"use client";

import { useActionState } from "react";
import { deleteTransaction, saveTransaction, type EntityFormState } from "@/lib/entityActions";
import { Hlaska, Pole, Rozbalovaci, SmazatTlacitko, Vyber } from "./form";
import { CATEGORIES, categoryLabel } from "@/lib/categories";
import { czk, dateCz } from "@/lib/format";

interface Row {
  id: string; date: Date; amount: number; category: string;
  description: string | null; documentRef: string | null;
}

export function TransactionManager({ propertyId, transactions, canEdit }: {
  propertyId: string; transactions: Row[]; canEdit: boolean;
}) {
  const [addState, addAction, adding] = useActionState<EntityFormState, FormData>(saveTransaction, {});
  const [delState, delAction] = useActionState<EntityFormState, FormData>(deleteTransaction, {});

  // Prijmy a vydaje zvlast, at je jasne, co znamena kladna castka
  const prijmy = CATEGORIES.filter((c) => c.kind === "INCOME").map((c) => [c.key, c.label] as [string, string]);
  const vydaje = CATEGORIES.filter((c) => c.kind === "EXPENSE").map((c) => [c.key, c.label] as [string, string]);

  return (
    <div>
      <Hlaska state={addState.error || addState.success ? addState : delState} />

      {transactions.length === 0 ? (
        <p className="py-3 text-center text-sm text-ink-muted">Žádné pohyby.</p>
      ) : (
        <table className="table-base">
          <thead>
            <tr><th>Datum</th><th>Kategorie</th><th>Popis</th><th className="num">Částka</th>{canEdit && <th />}</tr>
          </thead>
          <tbody>
            {transactions.map((t) => (
              <tr key={t.id}>
                <td className="tabular-nums text-ink-secondary">{dateCz(t.date)}</td>
                <td>{categoryLabel(t.category)}</td>
                <td className="text-ink-secondary">
                  {t.description}
                  {t.documentRef && <span className="ml-1.5 text-xs text-ink-muted">{t.documentRef}</span>}
                </td>
                <td className={`num font-medium ${t.amount >= 0 ? "text-good" : ""}`}>{czk(t.amount)}</td>
                {canEdit && (
                  <td className="text-right">
                    <SmazatTlacitko action={delAction} id={t.id} potvrzeni="Opravdu smazat tento pohyb?" />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {canEdit && (
        <Rozbalovaci popisek="Zaúčtovat pohyb" zavritPo={addState.success}>
          <form action={addAction} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="propertyId" value={propertyId} />
            <Pole label="Datum" name="date" type="date" required
              defaultValue={new Date().toISOString().slice(0, 10)} />
            <Vyber label="Kategorie" name="category" defaultValue="RENT"
              options={[...prijmy, ...vydaje]}
              hint="Daňové zařazení se doplní podle kategorie" />
            <Pole label="Částka (Kč)" name="amount" type="number" step="1" required
              hint="Zadej kladně — znaménko určí kategorie" />
            <Pole label="Doklad" name="documentRef" placeholder="např. FA-2026-0312" />
            <Pole label="Popis" name="description" sirka="sm:col-span-2" placeholder="nepovinné" />
            <div className="sm:col-span-2">
              <button type="submit" disabled={adding} className="btn btn-primary">
                {adding ? "Ukládám…" : "Zaúčtovat"}
              </button>
            </div>
          </form>
        </Rozbalovaci>
      )}
    </div>
  );
}
