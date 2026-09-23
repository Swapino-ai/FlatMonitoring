"use client";

import { useEffect, useState, useTransition } from "react";
import { czk, dateCz } from "@/lib/format";
import { prepniVyrazeni } from "@/lib/actions";

export interface Nabidka {
  disposition: string | null;
  areaM2: number | null;
  price: number;
  pricePerM2: number;
  district: string | null;
  url: string | null;
  source: string;
  scrapedAt: string;
  /** Klíč pro vyřazení z odhadu; null u starších snímků. */
  klic?: string | null;
  /** Vzdušná vzdálenost od nemovitosti; null u starších snímků. */
  vzdalenostKm?: number | null;
  /** Je nabídka přímo z lokality, nebo až z rozšířeného okruhu? */
  zLokality?: boolean;
}

/**
 * Starsi snimky nesou adresu se zastupnym /x/x/, kterou Sreality nikdy
 * neprepsaly — takovy odkaz vede na 404, radsi ho nenabizime vubec.
 */
function pouzitelnyOdkaz(url: string | null | undefined): boolean {
  return !!url && !url.includes("/x/x/");
}

/**
 * Klic pro vyrazeni nabidky z odhadu. Snimky porizene driv ho v sobe nemaji,
 * ale id inzeratu je na konci adresy — bez toho by u starsich oceneni neslo
 * vyradit nic.
 */
function klicNabidky(n: Nabidka): string | null {
  if (n.klic) return n.klic;
  const id = typeof n.url === "string" ? n.url.match(/\/(\d+)\/?$/)?.[1] : null;
  return id ? `${n.source || "SREALITY"}|${id}` : null;
}

/**
 * Nabidky, ze kterych medián vznikl. Bez nich je ocenění černá skříňka —
 * tohle ukáže, s čím přesně se byt porovnával.
 */
export function Comparables({ nabidky, tvojeKcM2, plochaM2, datumOceneni, poznamka, propertyId, vyrazene = [], canEdit = false }: {
  nabidky: Nabidka[];
  tvojeKcM2: number;
  plochaM2: number;
  datumOceneni: Date | string;
  /** Poznámka od ocenění — nese i to, v jakém okruhu se hledalo. */
  poznamka?: string | null;
  /** Bez něj nejde nabídku vyřadit — historické snímky ho nemají. */
  propertyId?: string;
  /** Klíče nabídek, které už uživatel vyřadil. */
  vyrazene?: string[];
  canEdit?: boolean;
}) {
  const [vse, setVse] = useState(false);
  const [ceka, startTransition] = useTransition();

  // Vlastni kopie, at se skrtnuti ukaze hned. Server az potom potvrdi —
  // cekat na odpoved by pusobilo, ze klik nezabral.
  const [vyrazenoLokalne, setVyrazenoLokalne] = useState<string[]>(vyrazene);
  useEffect(() => setVyrazenoLokalne(vyrazene), [vyrazene]);

  function prepni(klic: string, popis: string) {
    setVyrazenoLokalne((p) => (p.includes(klic) ? p.filter((x) => x !== klic) : [...p, klic]));
    if (propertyId) startTransition(() => prepniVyrazeni(propertyId, klic, popis));
  }

  if (nabidky.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-ink-muted">
        U tohoto ocenění není uložený seznam nabídek — vzniklo před tím, než se začal ukládat,
        nebo bylo zadáno ručně.
      </p>
    );
  }

  const serazene = [...nabidky].sort((a, b) => a.pricePerM2 - b.pricePerM2);
  const min = serazene[0].pricePerM2;
  const max = serazene[serazene.length - 1].pricePerM2;
  const rozsah = Math.max(max - min, 1);

  // Kam v rozpeti padne tvuj byt
  const tvojePozice = Math.min(100, Math.max(0, ((tvojeKcM2 - min) / rozsah) * 100));
  const levnejsich = serazene.filter((n) => n.pricePerM2 < tvojeKcM2).length;
  const percentil = Math.round((levnejsich / serazene.length) * 100);

  const zobrazene = vse ? serazene : serazene.slice(0, 6);

  return (
    <div className="space-y-4">
      {/* Kde leží tvůj byt v rozpětí nabídek */}
      <div className="rounded-card bg-surface-sunken p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-sm font-medium">Tvůj byt v rozpětí nabídek</span>
          <span className="text-xs text-ink-muted">
            {nabidky.length} nabídek · sken {dateCz(datumOceneni)}
          </span>
        </div>

        <div className="relative h-10">
          <div className="absolute inset-x-0 top-4 h-1.5 rounded-full bg-gradient-to-r from-[rgb(var(--series-3))] via-[rgb(var(--series-4))] to-[rgb(var(--series-2))] opacity-40" />
          {/* Každá nabídka jako značka — je vidět, kde se ceny shlukují */}
          {serazene.map((n, i) => (
            <div key={i}
              className={`absolute top-3.5 h-2.5 w-px transition-opacity duration-300 ${
                (() => { const k = klicNabidky(n); return k != null && vyrazenoLokalne.includes(k); })()
                  ? "bg-ink-muted/20"
                  : n.zLokality === false ? "bg-warn/70" : "bg-ink-muted/50"
              }`}
              style={{ left: `${((n.pricePerM2 - min) / rozsah) * 100}%` }} />
          ))}
          {/* Odhad z mediánu */}
          <div className="absolute top-1.5 -translate-x-1/2" style={{ left: `${tvojePozice}%` }}>
            <div className="h-6 w-1 rounded-full bg-accent ring-2 ring-surface-card" />
          </div>
        </div>

        <div className="flex justify-between gap-2 text-xs text-ink-muted">
          <span>{czk(min)}/m²</span>
          <span className="font-medium text-accent">odhad {czk(tvojeKcM2)}/m²</span>
          <span>{czk(max)}/m²</span>
        </div>

        <p className="mt-3 text-sm text-ink-secondary">
          {percentil <= 25 && "Tvůj byt je mezi levnějšími — buď je to podhodnocený odhad, nebo máš prostor při prodeji."}
          {percentil > 25 && percentil < 75 && "Tvůj byt je uprostřed nabídek, odhad odpovídá trhu."}
          {percentil >= 75 && "Tvůj byt je mezi dražšími — zkontroluj, jestli jsou srovnatelné nabídky opravdu srovnatelné."}
          {" "}Levnějších je {levnejsich} z {serazene.length}.
        </p>
      </div>

      {serazene.some((n) => n.vzdalenostKm != null) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm border border-line bg-surface-card" />
            z lokality
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm border border-warn/40 bg-warn/20" />
            z rozšířeného okruhu — jiný trh, ber s rezervou
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm border border-accent/50 bg-accent/20" />
            na úrovni odhadu
          </span>
        </div>
      )}

      {/* Karty jednotlivých nabídek */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {zobrazene.map((n, i) => {
          const rozdil = ((n.pricePerM2 - tvojeKcM2) / tvojeKcM2) * 100;
          // Nabidka temer na urovni odhadu — nejblizsi srovnani
          const nejblizsi = Math.abs(rozdil) < 2;
          // Starsi snimky vzdalenost nemaji; ty neobarvujeme, abychom netvrdili
          // neco, co v datech neni
          const zdaleka = n.zLokality === false;
          const klic = klicNabidky(n);
          const vyrazeno = klic != null && vyrazenoLokalne.includes(klic);
          return (
            <div key={i} className={`rounded-card border p-3 transition-all duration-300 ${
              vyrazeno
                ? "border-line/60 bg-surface-sunken/40 opacity-50 saturate-0"
                : zdaleka ? "border-warn/40 bg-warn/5"
                  : nejblizsi ? "border-accent/50 bg-accent/5"
                    : "border-line"
            }`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className={`whitespace-nowrap font-medium transition-all duration-300 ${vyrazeno ? "line-through" : ""}`}>
                    {n.disposition ?? "?"} · {n.areaM2 ?? "?"} m²
                  </div>
                  <div className="truncate text-xs text-ink-muted">
                    {n.district ?? "—"}
                    {n.vzdalenostKm != null && (
                      <span className={zdaleka ? "text-warn" : "text-good"}> · {n.vzdalenostKm} km</span>
                    )}
                  </div>
                </div>
                {nejblizsi && (
                  <span title="Tahle nabídka je na úrovni odhadu"
                    className="shrink-0 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                    ≈ odhad
                  </span>
                )}
              </div>

              <div className={`mt-2.5 space-y-0.5 transition-all duration-300 ${vyrazeno ? "line-through decoration-2" : ""}`}>
                <div className="text-lg font-semibold tabular-nums">{czk(n.pricePerM2)}<span className="text-xs font-normal text-ink-muted">/m²</span></div>
                <div className="text-sm tabular-nums text-ink-secondary">{czk(n.price)} celkem</div>
              </div>

              <div className="mt-2 flex items-center justify-between gap-2">
                <span className={`text-xs tabular-nums ${rozdil > 0 ? "text-good" : "text-warn"}`}>
                  {rozdil > 0 ? "+" : ""}{rozdil.toFixed(0)} % proti tvému
                </span>
                {pouzitelnyOdkaz(n.url) ? (
                  <a href={n.url!} target="_blank" rel="noreferrer noopener"
                    className="text-xs text-accent hover:underline">inzerát →</a>
                ) : (
                  <span className="text-xs text-ink-muted" title="Snímek vznikl dřív, než se odkazy ukládaly ve funkčním tvaru.">
                    bez odkazu
                  </span>
                )}
              </div>

              {canEdit && propertyId && klic && (
                <button
                  type="button"
                  disabled={ceka}
                  onClick={() => prepni(klic, `${n.disposition ?? "?"} · ${n.areaM2 ?? "?"} m² · ${n.district ?? "—"} · ${czk(n.price)}`)}
                  className={`mt-2 w-full rounded-lg border border-dashed py-1 text-xs transition-colors ${
                    vyrazeno
                      ? "border-accent/50 text-accent hover:bg-accent/5"
                      : "border-line text-ink-muted hover:border-warn hover:text-warn"
                  }`}
                >
                  {vyrazeno ? "vrátit do odhadu" : "nezapočítávat do odhadu"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {serazene.length > 6 && (
        <button onClick={() => setVse(!vse)} className="btn w-full border-dashed text-ink-secondary">
          {vse ? "Zobrazit jen prvních 6" : `Zobrazit všech ${serazene.length} nabídek`}
        </button>
      )}

      {poznamka?.includes("rozšířen") && (
        <p className="rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn">
          {poznamka.slice(poznamka.indexOf("Okruh"))} Nabídky z většího okolí jsou jiný trh —
          ber odhad jako hrubý.
        </p>
      )}

      {vyrazenoLokalne.length > 0 && (
        <p className="text-xs text-ink-muted">
          {vyrazenoLokalne.length === 1 ? "Jedna nabídka je" : `${vyrazenoLokalne.length} nabídek je`} z odhadu
          vyřazená — projeví se to při nejbližším skenu. Tenhle snímek zůstává, jak vznikl.
        </p>
      )}

      {poznamka?.includes("jen podle plochy") && (
        <p className="rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn">
          Se stejnou dispozicí se nic nenašlo, porovnává se jen podle plochy. Čísla ber
          jako hrubé vodítko — 3+kk a 2+1 o stejné výměře mívají jinou cenu za metr.
        </p>
      )}

      <p className="text-xs text-ink-muted">
        Jde o nabídkové ceny ze Sreality, ne realizované — ty bývají o 5–10 % nižší.
        Porovnává se plocha ±25 % v okruhu od tvé nemovitosti.
      </p>
    </div>
  );
}
