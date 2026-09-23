"use client";

import { useState } from "react";
import { czk, dateCz } from "@/lib/format";
import type { Nabidka } from "./Comparables";

/**
 * Nabidky z okoli, ktere na odhad nestacily.
 *
 * Do vypoctu nevstupuji — jde jen o to je videt. "Neni dost srovnatelnych
 * nabidek" bez seznamu je tvrzeni, ktere si clovek nemuze overit, a prave
 * pohled na ne casto ukaze, proc: jina dispozice, jina ctvrt, jiny stav.
 */
export function NabidkyVOkoli({ nabidky, kroky }: {
  nabidky: Nabidka[];
  kroky?: { popis: string; pocet: number; zlom: boolean }[];
}) {
  const [otevreno, setOtevreno] = useState(false);

  if (nabidky.length === 0 && !kroky?.length) return null;

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOtevreno(!otevreno)}
        className="text-xs text-accent hover:underline"
      >
        {otevreno ? "Skrýt nabídky z okolí" : `Ukázat, co se v okolí našlo (${nabidky.length}) →`}
      </button>

      {otevreno && (
        <div className="mt-3 space-y-3">
          {kroky && kroky.length > 0 && (
            <div className="rounded-card bg-surface-sunken p-3">
              <div className="label mb-2">Kde se vzorek ztratil</div>
              <ul className="space-y-1 text-sm">
                {kroky.map((k) => (
                  <li key={k.popis} className={`flex justify-between gap-3 ${k.zlom ? "font-medium text-warn" : "text-ink-secondary"}`}>
                    <span className="min-w-0">{k.popis}</span>
                    <span className="shrink-0 tabular-nums">{k.pocet < 0 ? "—" : k.pocet}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {nabidky.length > 0 && (
            <>
              <div className="table-scroll">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Dispozice</th><th className="num">Plocha</th><th className="num">Cena</th>
                      <th className="num">Kč/m²</th><th className="num">Vzdálenost</th><th>Lokalita</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {nabidky.map((n, i) => (
                      <tr key={n.klic ?? i}>
                        <td>{n.disposition ?? "—"}</td>
                        <td className="num tabular-nums">{n.areaM2 ?? "—"} m²</td>
                        <td className="num tabular-nums">{czk(n.price)}</td>
                        <td className="num tabular-nums text-ink-secondary">{czk(n.pricePerM2)}</td>
                        <td className={`num tabular-nums ${n.zLokality ? "text-good" : "text-warn"}`}>
                          {n.vzdalenostKm != null ? `${n.vzdalenostKm} km` : "—"}
                        </td>
                        <td className="text-ink-secondary">{n.district ?? "—"}</td>
                        <td className="num">
                          {n.url && !n.url.includes("/x/x/") && (
                            <a href={n.url} target="_blank" rel="noreferrer noopener"
                              className="text-xs text-accent hover:underline">inzerát →</a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-ink-muted">
                Tyhle nabídky se do odhadu nepočítají — mají jinou dispozici nebo plochu mimo
                srovnatelné rozpětí. Sken proběhl, data jsou; jen z nich nejde udělat medián,
                který by něco znamenal. Sken z {dateCz(nabidky[0].scrapedAt)}.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
