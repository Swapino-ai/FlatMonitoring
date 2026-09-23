"use client";

import { Fragment, useActionState, useState } from "react";
import { addValuation, deleteValuation, type ValuationFormState } from "@/lib/valuationActions";
import { czk, dateCz } from "@/lib/format";
import { Comparables, type Nabidka } from "./Comparables";

interface Row {
  id: string; date: Date; value: number; pricePerM2: number | null;
  source: string; sampleSize: number | null; notes: string | null;
  comparables?: unknown;
}

const SOURCE_LABELS: Record<string, string> = {
  MANUAL: "ruční odhad",
  EXPERT: "znalecký posudek",
  MARKET_SCAN: "sken trhu",
  INDEX: "index",
};

export function ValuationManager({ propertyId, valuations, areaM2, canEdit }: {
  propertyId: string;
  valuations: Row[];
  areaM2: number;
  canEdit: boolean;
}) {
  // Ktere oceneni si uzivatel rozkliknul pro zobrazeni srovnatelnych nabidek
  const [otevrene, setOtevrene] = useState<string | null>(null);
  const [addState, addAction, adding] = useActionState<ValuationFormState, FormData>(addValuation, {});
  const [delState, delAction] = useActionState<ValuationFormState, FormData>(deleteValuation, {});

  const message = addState.error || delState.error || addState.success || delState.success;
  const isError = Boolean(addState.error || delState.error);

  return (
    <div className="space-y-4">
      {message && (
        <p className={`rounded-lg px-3 py-2 text-sm ${isError ? "bg-bad/10 text-bad" : "bg-good/10 text-good"}`}>
          {message}
        </p>
      )}

      {valuations.length === 0 ? (
        <p className="py-4 text-center text-sm text-ink-muted">
          Zatím žádné ocenění — počítá se s pořizovací cenou.
        </p>
      ) : (
        <table className="table-base">
          <thead>
            <tr><th>Datum</th><th className="num">Hodnota</th><th className="num">Kč/m²</th><th>Zdroj</th>{canEdit && <th />}</tr>
          </thead>
          <tbody>
            {valuations.map((v, i) => {
              const nabidky = (Array.isArray(v.comparables) ? v.comparables : []) as Nabidka[];
              const rozbaleno = otevrene === v.id;
              return (
                <Fragment key={v.id}>
                  <tr className={i === 0 ? "bg-accent/5" : ""}>
                    <td className="tabular-nums">
                      {dateCz(v.date)}
                      {i === 0 && <span className="ml-1.5 text-xs text-accent">platné</span>}
                    </td>
                    <td className="num font-medium">{czk(v.value)}</td>
                    <td className="num text-ink-secondary">{v.pricePerM2 ? czk(v.pricePerM2) : "—"}</td>
                    <td className="text-ink-secondary">
                      {SOURCE_LABELS[v.source] ?? v.source}
                      {v.sampleSize ? <span className="text-xs text-ink-muted"> ({v.sampleSize} nabídek)</span> : null}
                      {v.notes && <div className="text-xs text-ink-muted">{v.notes}</div>}
                      {nabidky.length > 0 && (
                        <button onClick={() => setOtevrene(rozbaleno ? null : v.id)}
                          className="mt-1 block text-xs text-accent hover:underline">
                          {rozbaleno ? "Skrýt srovnatelné nabídky" : `Podle čeho se počítalo (${nabidky.length}) →`}
                        </button>
                      )}
                    </td>
                    {canEdit && (
                      <td className="text-right align-top">
                        <form action={delAction}>
                          <input type="hidden" name="id" value={v.id} />
                          <button type="submit" className="text-xs text-bad hover:underline">Smazat</button>
                        </form>
                      </td>
                    )}
                  </tr>
                  {rozbaleno && (
                    <tr>
                      <td colSpan={canEdit ? 5 : 4} className="bg-surface-sunken/30 p-4">
                        <Comparables
                          nabidky={nabidky}
                          tvojeKcM2={v.pricePerM2 ?? (areaM2 ? v.value / areaM2 : 0)}
                          plochaM2={areaM2}
                          datumOceneni={v.date}
                          poznamka={v.notes}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}

      {canEdit && (
        <form action={addAction} className="grid gap-3 border-t border-line pt-4 sm:grid-cols-4">
          <input type="hidden" name="propertyId" value={propertyId} />
          <div>
            <label className="label mb-1.5 block" htmlFor="v-value">Hodnota (Kč)</label>
            <input id="v-value" name="value" type="number" step="1000" required className="input" />
          </div>
          <div>
            <label className="label mb-1.5 block" htmlFor="v-date">Ke dni</label>
            <input id="v-date" name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className="input" />
          </div>
          <div>
            <label className="label mb-1.5 block" htmlFor="v-source">Zdroj</label>
            <select id="v-source" name="source" defaultValue="MANUAL" className="input">
              <option value="MANUAL">Vlastní odhad</option>
              <option value="EXPERT">Znalecký posudek</option>
            </select>
          </div>
          <div>
            <label className="label mb-1.5 block" htmlFor="v-notes">Poznámka</label>
            <input id="v-notes" name="notes" className="input" placeholder="nepovinné" />
          </div>
          <div className="sm:col-span-4">
            <button type="submit" disabled={adding} className="btn btn-primary">
              {adding ? "Ukládám…" : "Přidat ocenění"}
            </button>
            <p className="mt-2 text-xs text-ink-muted">
              Použije se nejnovější ocenění. Plocha {areaM2} m² — cena za m² se dopočítá sama.
            </p>
          </div>
        </form>
      )}
    </div>
  );
}
