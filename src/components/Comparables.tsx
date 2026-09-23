"use client";

import { useState } from "react";
import { czk, dateCz } from "@/lib/format";

export interface Nabidka {
  disposition: string | null;
  areaM2: number | null;
  price: number;
  pricePerM2: number;
  district: string | null;
  url: string | null;
  source: string;
  scrapedAt: string;
}

/**
 * Starsi snimky nesou adresu se zastupnym /x/x/, kterou Sreality nikdy
 * neprepsaly — takovy odkaz vede na 404, radsi ho nenabizime vubec.
 */
function pouzitelnyOdkaz(url: string | null | undefined): boolean {
  return !!url && !url.includes("/x/x/");
}

/**
 * Nabidky, ze kterych medián vznikl. Bez nich je ocenění černá skříňka —
 * tohle ukáže, s čím přesně se byt porovnával.
 */
export function Comparables({ nabidky, tvojeKcM2, plochaM2, datumOceneni, poznamka }: {
  nabidky: Nabidka[];
  tvojeKcM2: number;
  plochaM2: number;
  datumOceneni: Date | string;
  /** Poznámka od ocenění — nese i to, v jakém okruhu se hledalo. */
  poznamka?: string | null;
}) {
  const [vse, setVse] = useState(false);

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
            <div key={i} className="absolute top-3.5 h-2.5 w-px bg-ink-muted/50"
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

      {/* Karty jednotlivých nabídek */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {zobrazene.map((n, i) => {
          const rozdil = ((n.pricePerM2 - tvojeKcM2) / tvojeKcM2) * 100;
          // Nabidka temer na urovni odhadu — nejblizsi srovnani
          const nejblizsi = Math.abs(rozdil) < 2;
          return (
            <div key={i} className={`rounded-card border p-3 ${nejblizsi ? "border-accent/50 bg-accent/5" : "border-line"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="whitespace-nowrap font-medium">
                    {n.disposition ?? "?"} · {n.areaM2 ?? "?"} m²
                  </div>
                  <div className="truncate text-xs text-ink-muted">{n.district ?? "—"}</div>
                </div>
                {nejblizsi && (
                  <span title="Tahle nabídka je na úrovni odhadu"
                    className="shrink-0 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                    ≈ odhad
                  </span>
                )}
              </div>

              <div className="mt-2.5 space-y-0.5">
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

      <p className="text-xs text-ink-muted">
        Jde o nabídkové ceny ze Sreality, ne realizované — ty bývají o 5–10 % nižší.
        Porovnává se stejná dispozice a plocha ±25 % v okruhu od tvé nemovitosti.
      </p>
    </div>
  );
}
