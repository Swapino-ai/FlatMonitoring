"use client";

import { useTransition } from "react";
import { prepniVyrazeni } from "@/lib/actions";
import { dateCz } from "@/lib/format";

/**
 * Nabidky vyrazene z odhadu. Drzime u nich popis z doby vyrazeni, protoze
 * inzerat casem z trhu zmizi — bez nej by uzivatel nepoznal, co vlastne
 * vyradil, a nemohl by to vzit zpet.
 */
export function VyrazeneNabidky({ propertyId, polozky, canEdit }: {
  propertyId: string;
  polozky: { id: string; source: string; externalId: string; popis: string; createdAt: Date }[];
  canEdit: boolean;
}) {
  const [ceka, startTransition] = useTransition();

  if (polozky.length === 0) return null;

  return (
    <div className="mt-4 border-t border-line pt-3">
      <div className="label mb-2">Vyřazeno z odhadu ({polozky.length})</div>
      <ul className="space-y-1.5">
        {polozky.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-ink-secondary">
              {p.popis}
              <span className="ml-1.5 text-xs text-ink-muted">· {dateCz(p.createdAt)}</span>
            </span>
            {canEdit && (
              <button
                type="button"
                disabled={ceka}
                onClick={() => startTransition(() =>
                  prepniVyrazeni(propertyId, `${p.source}|${p.externalId}`, p.popis),
                )}
                className="shrink-0 text-xs text-accent hover:underline disabled:opacity-50"
              >
                vrátit
              </button>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-ink-muted">
        Vyřazené nabídky do odhadu nevstupují. Projeví se to při nejbližším skenu.
      </p>
    </div>
  );
}
