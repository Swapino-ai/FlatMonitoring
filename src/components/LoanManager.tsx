"use client";

import { useActionState } from "react";
import { deleteLoan, saveLoan, type EntityFormState } from "@/lib/entityActions";
import { Hlaska, Pole, Rozbalovaci, SmazatTlacitko } from "./form";
import { czk, dateCz, num } from "@/lib/format";

interface Row {
  id: string; lender: string; contractNo: string | null; principal: number;
  interestRate: number; startDate: Date; termMonths: number; fixationEnd: Date | null;
  monthlyPayment: number; currentBalance: number;
}

export function LoanManager({ propertyId, loans, canEdit }: {
  propertyId: string; loans: Row[]; canEdit: boolean;
}) {
  const [addState, addAction, adding] = useActionState<EntityFormState, FormData>(saveLoan.bind(null, null), {});
  const [delState, delAction] = useActionState<EntityFormState, FormData>(deleteLoan, {});

  return (
    <div>
      <Hlaska state={addState.error || addState.success ? addState : delState} />

      {loans.length === 0 ? (
        <p className="py-3 text-center text-sm text-ink-muted">Bez úvěru — byt je čistý.</p>
      ) : (
        <div className="space-y-3">
          {loans.map((l) => (
            <div key={l.id} className="rounded-lg border border-line p-3">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium">{l.lender}</div>
                  {l.contractNo && <div className="text-xs text-ink-muted">{l.contractNo}</div>}
                </div>
                {canEdit && (
                  <SmazatTlacitko action={delAction} id={l.id}
                    potvrzeni={`Opravdu smazat úvěr od ${l.lender}? Přepočítá se tím dluh i výnosy.`} />
                )}
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
                <Radek t="Zbývá splatit" v={czk(l.currentBalance)} />
                <Radek t="Půjčeno" v={czk(l.principal)} />
                <Radek t="Sazba" v={`${num(l.interestRate, 2)} % p.a.`} />
                <Radek t="Splátka" v={`${czk(l.monthlyPayment)}/měs.`} />
                <Radek t="Splatnost" v={`${l.termMonths} měs.`} />
                <Radek t="Konec fixace" v={dateCz(l.fixationEnd)} />
              </dl>
            </div>
          ))}
        </div>
      )}

      {canEdit && (
        <Rozbalovaci popisek="Přidat úvěr nebo hypotéku" zavritPo={addState.success}>
          <form action={addAction} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="propertyId" value={propertyId} />
            <Pole label="Banka / věřitel" name="lender" required />
            <Pole label="Číslo smlouvy" name="contractNo" placeholder="nepovinné" />
            <Pole label="Půjčená jistina (Kč)" name="principal" type="number" step="1000" required />
            <Pole label="Úroková sazba (% p.a.)" name="interestRate" type="number" step="0.01" required placeholder="4,89" />
            <Pole label="Datum čerpání" name="startDate" type="date" required />
            <Pole label="Splatnost (měsíců)" name="termMonths" type="number" required placeholder="360"
              hint="30 let = 360 měsíců" />
            <Pole label="Konec fixace" name="fixationEnd" type="date" hint="Aplikace upozorní 12 měsíců předem" />
            <Pole label="Měsíční splátka (Kč)" name="monthlyPayment" type="number"
              hint="Nech prázdné a dopočítá se anuita" />
            <div className="sm:col-span-2">
              <button type="submit" disabled={adding} className="btn btn-primary">
                {adding ? "Ukládám…" : "Uložit úvěr"}
              </button>
            </div>
          </form>
        </Rozbalovaci>
      )}
    </div>
  );
}

function Radek({ t, v }: { t: string; v: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-ink-muted">{t}</dt>
      <dd className="tabular-nums">{v}</dd>
    </div>
  );
}
