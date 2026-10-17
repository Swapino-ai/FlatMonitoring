"use client";

import { useState } from "react";
import { czk, dateCz } from "@/lib/format";
import { vazenyMedian } from "@/lib/market/zarazeni";

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
  /** Souřadnice nabídky (pro mapu); null u starších snímků. */
  latitude?: number | null;
  longitude?: number | null;
  /** Prvni fotka inzeratu; null u starsich snimku. */
  fotka?: string | null;
  /** Vaha v odhadu (podobnost); u starsich snimku 1. */
  vaha?: number;
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
export function Comparables({ nabidky, tvojeKcM2, datumOceneni, poznamka, fotky = {} }: {
  nabidky: Nabidka[];
  /** Odhad za m² (vážený průměr) */
  tvojeKcM2: number;
  plochaM2: number;
  datumOceneni: Date | string;
  /** Poznámka od ocenění — nese i to, v jakém okruhu se hledalo. */
  poznamka?: string | null;
  /** Fotky ke starším snímkům, které je v sobě nemají (klíč nabídky → adresa). */
  fotky?: Record<string, string>;
  propertyId?: string;
  vyrazene?: string[];
  canEdit?: boolean;
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
  const pozice = (kcM2: number) => Math.min(100, Math.max(0, ((kcM2 - min) / rozsah) * 100));

  // Vazeny median ze stejnych nabidek (starsi snimky bez vah = vaha 1)
  const median = vazenyMedian(serazene.map((n) => ({ hodnota: n.pricePerM2, vaha: n.vaha ?? 1 })));
  const levnejsich = serazene.filter((n) => n.pricePerM2 < tvojeKcM2).length;
  const percentil = Math.round((levnejsich / serazene.length) * 100);
  const zobrazene = vse ? serazene : serazene.slice(0, 8);

  return (
    <div className="space-y-4">
      {/* Rozpětí nabídek: průměr a medián jako dvě barevné značky */}
      <div className="rounded-card bg-surface-sunken p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-sm font-medium">Tvůj byt v rozpětí nabídek</span>
          <span className="text-xs text-ink-muted">{nabidky.length} nabídek · {dateCz(datumOceneni)}</span>
        </div>

        <div className="relative h-12">
          <div className="absolute inset-x-0 top-5 h-1.5 rounded-full bg-gradient-to-r from-[rgb(var(--series-3))] via-[rgb(var(--series-4))] to-[rgb(var(--series-2))] opacity-40" />
          {serazene.map((n, i) => (
            <div key={i} className="absolute top-[18px] h-2.5 w-px bg-ink-muted/50" style={{ left: `${pozice(n.pricePerM2)}%` }} />
          ))}
          <div className="absolute top-2 -translate-x-1/2" style={{ left: `${pozice(median)}%` }} title={`Medián ${czk(median)}/m²`}>
            <div className="h-7 w-1 rounded-full bg-[rgb(var(--series-2))] ring-2 ring-surface-card" />
          </div>
          <div className="absolute top-2 -translate-x-1/2" style={{ left: `${pozice(tvojeKcM2)}%` }} title={`Průměr ${czk(tvojeKcM2)}/m²`}>
            <div className="h-7 w-1 rounded-full bg-accent ring-2 ring-surface-card" />
          </div>
        </div>

        <div className="flex justify-between gap-2 text-xs text-ink-muted">
          <span>{czk(min)}/m²</span>
          <span>{czk(max)}/m²</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-1 rounded-full bg-accent" />Průměr <strong className="tabular-nums">{czk(tvojeKcM2)}/m²</strong></span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-1 rounded-full bg-[rgb(var(--series-2))]" />Medián <strong className="tabular-nums">{czk(median)}/m²</strong></span>
        </div>
        <p className="mt-2 text-xs text-ink-secondary">
          {percentil <= 25 && "Odhad je mezi levnějšími nabídkami."}
          {percentil > 25 && percentil < 75 && "Odhad je uprostřed nabídek."}
          {percentil >= 75 && "Odhad je mezi dražšími nabídkami — zkontroluj, jestli jsou opravdu srovnatelné."}
          {" "}Levnějších nabídek je {levnejsich} z {serazene.length}.
        </p>
      </div>

      {/* Nabídky po řádcích s fotkou */}
      <ul className="divide-y divide-line/70 overflow-hidden rounded-xl border border-line bg-surface-card">
        {zobrazene.map((n, i) => {
          const rozdil = tvojeKcM2 ? ((n.pricePerM2 - tvojeKcM2) / tvojeKcM2) * 100 : 0;
          const klic = klicNabidky(n);
          const fotka = n.fotka ?? (klic ? fotky[klic] : undefined);
          return (
            <li key={i} className="flex items-center gap-3 px-3 py-2">
              <div className="h-14 w-20 shrink-0 overflow-hidden rounded-md bg-surface-sunken">
                {fotka && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fotka} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{n.disposition ?? "?"} · {n.areaM2 ?? "?"} m²</div>
                <div className="truncate text-xs text-ink-muted">
                  {n.district ?? "—"}{n.vzdalenostKm != null && ` · ${n.vzdalenostKm} km`}{n.vaha != null && ` · váha ${String(n.vaha).replace(".", ",")}×`}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold tabular-nums">{czk(n.pricePerM2)}<span className="text-xs font-normal text-ink-muted">/m²</span></div>
                <div className="text-xs tabular-nums text-ink-muted">{czk(n.price)}</div>
              </div>
              <div className={`hidden w-16 text-right text-xs tabular-nums sm:block ${Math.abs(rozdil) < 2 ? "text-accent" : rozdil > 0 ? "text-good" : "text-warn"}`}
                title="Proti odhadu (průměru)">
                {Math.abs(rozdil) < 2 ? "≈ odhad" : `${rozdil > 0 ? "+" : ""}${rozdil.toFixed(0)} %`}
              </div>
              <div className="w-16 text-right text-xs">
                {pouzitelnyOdkaz(n.url)
                  ? <a href={n.url!} target="_blank" rel="noreferrer noopener" className="text-accent hover:underline">inzerát ↗</a>
                  : <span className="text-ink-muted">—</span>}
              </div>
            </li>
          );
        })}
      </ul>

      {serazene.length > 8 && (
        <button onClick={() => setVse(!vse)} className="btn w-full border-dashed text-ink-secondary">
          {vse ? "Zobrazit méně" : `Zobrazit všech ${serazene.length} nabídek`}
        </button>
      )}

      {poznamka?.includes("rozšířen") && (
        <p className="rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn">
          {poznamka.slice(poznamka.indexOf("Okruh"))} Nabídky z většího okolí jsou jiný trh — ber odhad jako hrubý.
        </p>
      )}

      <p className="text-xs text-ink-muted">
        Nabídkové ceny ze Sreality, ne realizované — ty bývají o 5–10 % nižší.
      </p>
    </div>
  );
}
