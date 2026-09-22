"use client";

import { useState } from "react";
import { Comparables, type Nabidka } from "./Comparables";
import { czk, dateCz, pct } from "@/lib/format";
import { Badge } from "./Stat";

interface Odhad {
  id: string; date: Date; monthlyRent: number; rentPerM2: number | null;
  p25: number | null; p75: number | null; source: string;
  sampleSize: number | null; confidence: string | null;
  comparables?: unknown; notes: string | null;
}

/**
 * Vyvoj trzniho najemneho. Proti smluvnimu najmu je videt, jestli
 * nepodnajimas — nebo naopak jestli neni najem nad trhem a hrozi odchod.
 */
export function RentHistory({ odhady, smluvniNajem, areaM2 }: {
  odhady: Odhad[];
  smluvniNajem: number;
  areaM2: number;
}) {
  const [otevrene, setOtevrene] = useState<string | null>(null);

  if (odhady.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-ink-muted">
        Zatím žádný odhad nájmu. Vzniká sám při nočním skenu trhu.
      </p>
    );
  }

  const aktualni = odhady[0];
  const rozdil = smluvniNajem > 0
    ? ((smluvniNajem - aktualni.monthlyRent) / aktualni.monthlyRent) * 100
    : null;

  // Vyvoj proti nejstarsimu zaznamu — kam se trh za sledovane obdobi pohnul
  const nejstarsi = odhady[odhady.length - 1];
  const trend = odhady.length > 1
    ? ((aktualni.monthlyRent - nejstarsi.monthlyRent) / nejstarsi.monthlyRent) * 100
    : null;

  return (
    <div className="space-y-4">
      <div className="rounded-card bg-surface-sunken p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <div className="label">Tržní nájem podle skenu</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">
              {czk(aktualni.monthlyRent)}<span className="text-sm font-normal text-ink-muted">/měs.</span>
            </div>
            {aktualni.rentPerM2 && (
              <div className="text-xs text-ink-muted">
                {czk(aktualni.rentPerM2)}/m² · {aktualni.sampleSize} nabídek · {dateCz(aktualni.date)}
              </div>
            )}
          </div>

          {trend !== null && Math.abs(trend) >= 0.5 && (
            <Badge tone={trend > 0 ? "good" : "warn"}>
              trh {trend > 0 ? "+" : ""}{trend.toFixed(1)} % od {dateCz(nejstarsi.date)}
            </Badge>
          )}
        </div>

        {rozdil !== null && (
          <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${
            rozdil < -8 ? "bg-warn/10 text-warn" : rozdil > 8 ? "bg-bad/10 text-bad" : "bg-good/10 text-good"
          }`}>
            {rozdil < -8 && (
              <>Tvůj nájem {czk(smluvniNajem)} je <strong>{pct(Math.abs(rozdil), 0)} pod trhem</strong>.
                Při obnově smlouvy je prostor jít nahoru — rozdíl dělá {czk((aktualni.monthlyRent - smluvniNajem) * 12)} ročně.</>
            )}
            {rozdil > 8 && (
              <>Tvůj nájem {czk(smluvniNajem)} je <strong>{pct(rozdil, 0)} nad trhem</strong>.
                Drž si nájemníka — nový by se hledal hůř a neobsazenost stojí víc než ten rozdíl.</>
            )}
            {Math.abs(rozdil) <= 8 && (
              <>Tvůj nájem {czk(smluvniNajem)} odpovídá trhu (rozdíl {pct(Math.abs(rozdil), 0)}).</>
            )}
          </p>
        )}
      </div>

      <div className="table-scroll">
        <table className="table-base">
          <thead>
            <tr>
              <th>Datum</th><th className="num">Nájem</th><th className="num">Kč/m²</th>
              <th className="num">Rozpětí</th><th>Vzorek</th>
            </tr>
          </thead>
          <tbody>
            {odhady.slice(0, 20).map((o, i) => {
              const nabidky = (Array.isArray(o.comparables) ? o.comparables : []) as Nabidka[];
              const predchozi = odhady[i + 1];
              const zmena = predchozi ? ((o.monthlyRent - predchozi.monthlyRent) / predchozi.monthlyRent) * 100 : null;
              return (
                <tr key={o.id} className={i === 0 ? "bg-accent/5" : ""}>
                  <td className="tabular-nums">
                    {dateCz(o.date)}
                    {nabidky.length > 0 && (
                      <button onClick={() => setOtevrene(otevrene === o.id ? null : o.id)}
                        className="ml-2 text-xs text-accent hover:underline">
                        {otevrene === o.id ? "skrýt" : "z čeho"}
                      </button>
                    )}
                  </td>
                  <td className="num font-medium">
                    {czk(o.monthlyRent)}
                    {zmena !== null && Math.abs(zmena) >= 0.5 && (
                      <span className={`ml-1.5 text-xs ${zmena > 0 ? "text-good" : "text-warn"}`}>
                        {zmena > 0 ? "+" : ""}{zmena.toFixed(1)} %
                      </span>
                    )}
                  </td>
                  <td className="num text-ink-secondary">{o.rentPerM2 ? czk(o.rentPerM2) : "—"}</td>
                  <td className="num text-ink-secondary">
                    {o.p25 && o.p75 ? `${Math.round(o.p25)}–${Math.round(o.p75)}` : "—"}
                  </td>
                  <td>
                    {o.sampleSize ? (
                      <Badge tone={o.sampleSize >= 15 ? "good" : o.sampleSize >= 7 ? "neutral" : "warn"}>
                        {o.sampleSize}
                      </Badge>
                    ) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {otevrene && (() => {
        const o = odhady.find((x) => x.id === otevrene)!;
        const nabidky = (Array.isArray(o.comparables) ? o.comparables : []) as Nabidka[];
        return (
          <div className="rounded-card border border-line p-4">
            <Comparables nabidky={nabidky} tvojeKcM2={o.rentPerM2 ?? 0}
              plochaM2={areaM2} datumOceneni={o.date} />
          </div>
        );
      })()}
    </div>
  );
}
