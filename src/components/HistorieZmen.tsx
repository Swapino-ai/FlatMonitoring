"use client";

import { useActionState } from "react";
import type { EntityFormState } from "@/lib/entityActions";
import { Hlaska, SmazatTlacitko } from "./form";
import { dateCz } from "@/lib/format";

export interface RadekHistorie {
  id: string;
  validFrom: Date | string;
  /** Uz zformatovana hodnota, napr. "3 100 Kč/měs.". */
  hodnota: string;
}

/**
 * Seznam zmen s datem "plati od". Pomaha dvema veci: videt, co platilo kdy,
 * a opravit preklep v datu, aniz by se pletlo do zbytku smlouvy.
 *
 * Nejstarsi radek je vychozi hodnota — plati od zacatku, dokud nepride dalsi zmena.
 */
export function HistorieZmen({ nadpis, radky, action, potvrzeni }: {
  nadpis: string;
  radky: RadekHistorie[];
  action: (prev: EntityFormState, data: FormData) => Promise<EntityFormState>;
  potvrzeni: string;
}) {
  const [stav, smaz] = useActionState<EntityFormState, FormData>(action, {});
  if (radky.length === 0) return null;

  const razene = [...radky].sort((a, b) => new Date(a.validFrom).getTime() - new Date(b.validFrom).getTime());

  return (
    <div className="mt-4 border-t border-line pt-3">
      <h4 className="text-sm font-semibold">{nadpis}</h4>
      <Hlaska state={stav} />
      <ul className="mt-2 divide-y divide-line/60 text-sm">
        {razene.map((r, i) => (
          <li key={r.id} className="flex items-center justify-between gap-3 py-1.5">
            <span className="tabular-nums text-ink-secondary">
              {i === 0 ? "od začátku" : `od ${dateCz(new Date(r.validFrom))}`}
            </span>
            <span className="ml-auto font-medium tabular-nums">{r.hodnota}</span>
            <SmazatTlacitko action={smaz} id={r.id} potvrzeni={potvrzeni} />
          </li>
        ))}
      </ul>
    </div>
  );
}
