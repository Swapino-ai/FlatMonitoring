"use client";

import { useActionState, useEffect, useState } from "react";
import { deleteTransaction, saveTransaction, type EntityFormState } from "@/lib/entityActions";
import { Hlaska, Pole, Rozbalovaci, SmazatTlacitko, UpravaPanel, UpravitTlacitko, Vyber, isoDatum } from "./form";
import { CATEGORIES, categoryLabel } from "@/lib/categories";
import { czk, dateCz } from "@/lib/format";
import { Ikona } from "./Ikony";

interface Row {
  id: string; date: Date; amount: number; category: string;
  description: string | null; documentRef: string | null;
}

export function TransactionManager({ propertyId, transactions, canEdit }: {
  propertyId: string; transactions: Row[]; canEdit: boolean;
}) {
  const [addState, addAction, adding] = useActionState<EntityFormState, FormData>(saveTransaction.bind(null, null), {});
  const [delState, delAction] = useActionState<EntityFormState, FormData>(deleteTransaction, {});

  const [upravaId, setUpravaId] = useState<string | null>(null);
  const [upravaState, upravaAction, upravuji] = useActionState<EntityFormState, FormData>(
    saveTransaction.bind(null, upravaId), {});
  useEffect(() => { if (upravaState.success) setUpravaId(null); }, [upravaState.success]);

  const upravovany = transactions.find((t) => t.id === upravaId) ?? null;

  // Prijmy a vydaje zvlast, at je jasne, co znamena kladna castka
  const prijmy = CATEGORIES.filter((c) => c.kind === "INCOME").map((c) => [c.key, c.label] as [string, string]);
  const vydaje = CATEGORIES.filter((c) => c.kind === "EXPENSE").map((c) => [c.key, c.label] as [string, string]);

  return (
    <div>
      <Hlaska state={
        upravaState.error ? upravaState
          : addState.error || addState.success ? addState
          : delState.error || delState.success ? delState
          : upravaState
      } />

      {transactions.length === 0 ? (
        <p className="py-3 text-center text-sm text-ink-muted">Žádné pohyby.</p>
      ) : (
        <table className="table-base">
          <thead>
            <tr>
              <th>Datum</th><th>Kategorie</th><th>Popis</th><th className="num">Částka</th>
              {canEdit && <th className="w-[5.5rem]"><span className="sr-only">Akce</span></th>}
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => (
              <tr key={t.id} className={upravaId === t.id ? "bg-accent/5" : undefined}>
                <td className="tabular-nums text-ink-secondary">{dateCz(t.date)}</td>
                <td>
                  <div className="flex items-center gap-2.5">
                    {/* Smer penez je videt driv, nez se precte kategorie. Neni to jedina
                        informace: znamenko u castky a barva jen doplnuji. */}
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                      t.amount >= 0 ? "bg-good/15 text-good" : "bg-surface-sunken text-ink-muted"
                    }`} title={t.amount >= 0 ? "Příjem" : "Výdaj"}>
                      <Ikona nazev={t.amount >= 0 ? "sipkaDolu" : "sipkaNahoru"} trida="h-4 w-4" />
                    </span>
                    <span className="font-medium">{categoryLabel(t.category)}</span>
                  </div>
                </td>
                <td className="max-w-[24rem] text-ink-secondary">
                  <span className="line-clamp-2" title={t.description ?? undefined}>{t.description}</span>
                  {t.documentRef && <span className="text-xs text-ink-muted">{t.documentRef}</span>}
                </td>
                <td className={`num font-semibold ${t.amount >= 0 ? "text-good" : ""}`}>
                  {t.amount > 0 ? "+" : ""}{czk(t.amount)}
                </td>
                {canEdit && (
                  <td>
                    <div className="flex items-center justify-end gap-0.5">
                      <UpravitTlacitko aktivni={upravaId === t.id}
                        onClick={() => setUpravaId(upravaId === t.id ? null : t.id)} />
                      <SmazatTlacitko action={delAction} id={t.id} potvrzeni="Opravdu smazat tento pohyb?" />
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {canEdit && upravovany && (
        <UpravaPanel nadpis={`Upravit pohyb z ${dateCz(upravovany.date)}`} onZavrit={() => setUpravaId(null)}>
          <Formular key={upravovany.id} propertyId={propertyId} r={upravovany} kategorie={[...prijmy, ...vydaje]}
            action={upravaAction} pending={upravuji} popisekTlacitka="Uložit změny" />
        </UpravaPanel>
      )}

      {canEdit && !upravovany && (
        <Rozbalovaci popisek="Zaúčtovat pohyb" zavritPo={addState.success}>
          <Formular propertyId={propertyId} r={null} kategorie={[...prijmy, ...vydaje]}
            action={addAction} pending={adding} popisekTlacitka="Zaúčtovat" />
        </Rozbalovaci>
      )}
    </div>
  );
}

function Formular({ propertyId, r, kategorie, action, pending, popisekTlacitka }: {
  propertyId: string; r: Row | null; kategorie: [string, string][];
  action: (payload: FormData) => void; pending: boolean; popisekTlacitka: string;
}) {
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="propertyId" value={propertyId} />
      <Pole label="Datum" name="date" type="date" required
        defaultValue={isoDatum(r?.date) ?? new Date().toISOString().slice(0, 10)} />
      <Vyber label="Kategorie" name="category" defaultValue={r?.category ?? "RENT"}
        options={kategorie}
        hint="Daňové zařazení se doplní podle kategorie" />
      {/* Znamenko urcuje kategorie, takze do pole patri absolutni hodnota */}
      <Pole label="Částka (Kč)" name="amount" type="number" step="1" required
        defaultValue={r ? Math.abs(r.amount) : undefined}
        hint="Zadej kladně — znaménko určí kategorie" />
      <Pole label="Doklad" name="documentRef" placeholder="např. FA-2026-0312" defaultValue={r?.documentRef ?? ""} />
      <Pole label="Popis" name="description" sirka="sm:col-span-2" placeholder="nepovinné"
        defaultValue={r?.description ?? ""} />
      <div className="sm:col-span-2">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Ukládám…" : popisekTlacitka}
        </button>
      </div>
    </form>
  );
}
