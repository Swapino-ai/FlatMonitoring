"use client";

import { useActionState, useEffect, useState } from "react";
import { deleteLoan, saveLoan, type EntityFormState } from "@/lib/entityActions";
import { Hlaska, Pole, Rozbalovaci, SmazatTlacitko, UpravaPanel, UpravitTlacitko, isoDatum } from "./form";
import { TYPY_UVERU, UVER_MAP, nazevUveru } from "@/lib/catalogs";
import { czk, dateCz, num } from "@/lib/format";

interface Row {
  id: string; type: string; lender: string; contractNo: string | null; principal: number;
  interestRate: number; startDate: Date; termMonths: number; fixationEnd: Date | null;
  monthlyPayment: number; currentBalance: number;
}

export function LoanManager({ propertyId, loans, canEdit }: {
  propertyId: string; loans: Row[]; canEdit: boolean;
}) {
  const [addState, addAction, adding] = useActionState<EntityFormState, FormData>(saveLoan.bind(null, null), {});
  const [delState, delAction] = useActionState<EntityFormState, FormData>(deleteLoan, {});

  const [upravaId, setUpravaId] = useState<string | null>(null);
  const [upravaState, upravaAction, upravuji] = useActionState<EntityFormState, FormData>(
    saveLoan.bind(null, upravaId), {});
  useEffect(() => { if (upravaState.success) setUpravaId(null); }, [upravaState.success]);

  const upravovany = loans.find((l) => l.id === upravaId) ?? null;

  return (
    <div>
      <Hlaska state={
        upravaState.error ? upravaState
          : addState.error || addState.success ? addState
          : delState.error || delState.success ? delState
          : upravaState
      } />

      {loans.length === 0 ? (
        <p className="py-3 text-center text-sm text-ink-muted">Bez úvěru — byt je čistý.</p>
      ) : (
        <div className="space-y-3">
          {loans.map((l) => (
            <div key={l.id}
              className={`rounded-lg border p-3 ${upravaId === l.id ? "border-accent/40 bg-accent/5" : "border-line"}`}>
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium">{l.lender}</div>
                  <div className="text-xs text-ink-muted">
                    {nazevUveru(l.type)}
                    {l.contractNo && ` · ${l.contractNo}`}
                  </div>
                </div>
                {canEdit && (
                  <div className="flex shrink-0 items-center gap-3">
                    <UpravitTlacitko aktivni={upravaId === l.id}
                      onClick={() => setUpravaId(upravaId === l.id ? null : l.id)} />
                    <SmazatTlacitko action={delAction} id={l.id}
                      potvrzeni={`Opravdu smazat úvěr od ${l.lender}? Přepočítá se tím dluh i výnosy.`} />
                  </div>
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

      {canEdit && upravovany && (
        <UpravaPanel nadpis={`Upravit úvěr od ${upravovany.lender}`} onZavrit={() => setUpravaId(null)}>
          <Formular key={upravovany.id} propertyId={propertyId} r={upravovany}
            action={upravaAction} pending={upravuji} popisekTlacitka="Uložit změny" />
        </UpravaPanel>
      )}

      {canEdit && !upravovany && (
        <Rozbalovaci popisek="Přidat úvěr nebo hypotéku" zavritPo={addState.success}>
          <Formular propertyId={propertyId} r={null} action={addAction} pending={adding}
            popisekTlacitka="Uložit úvěr" />
        </Rozbalovaci>
      )}
    </div>
  );
}

function Formular({ propertyId, r, action, pending, popisekTlacitka }: {
  propertyId: string; r: Row | null;
  action: (payload: FormData) => void; pending: boolean; popisekTlacitka: string;
}) {
  const [typ, setTyp] = useState(r?.type ?? "HYPOTEKA_NA_BYDLENI");
  const katalog = UVER_MAP.get(typ);

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="propertyId" value={propertyId} />
      <div className="sm:col-span-2">
        <label className="label mb-1.5 block" htmlFor="loan-type">Druh úvěru</label>
        <select id="loan-type" name="type" value={typ} onChange={(e) => setTyp(e.target.value)} className="input">
          {TYPY_UVERU.map((t) => <option key={t.klic} value={t.klic}>{t.nazev}</option>)}
        </select>
        {katalog && (
          <div className="mt-2 space-y-1.5 rounded-lg bg-surface-sunken px-3 py-2.5 text-xs">
            <p className="text-ink-secondary">{katalog.popis}</p>
            <p className="text-ink-primary">
              <strong>Předčasné splacení:</strong> {katalog.predcasneSplaceni}
            </p>
            {!katalog.spotrebitelsky && (
              <p className="text-warn">
                Nejde o spotřebitelský úvěr — zákonná ochrana spotřebitele se neuplatní.
              </p>
            )}
          </div>
        )}
      </div>
      <Pole label="Banka / věřitel" name="lender" required defaultValue={r?.lender} />
      <Pole label="Číslo smlouvy" name="contractNo" placeholder="nepovinné" defaultValue={r?.contractNo ?? ""} />
      <Pole label="Půjčená jistina (Kč)" name="principal" type="number" step="1000" required
        defaultValue={r?.principal} />
      <Pole label="Úroková sazba (% p.a.)" name="interestRate" type="number" step="0.01" required placeholder="4,89"
        defaultValue={r?.interestRate} />
      <Pole label="Datum čerpání" name="startDate" type="date" required defaultValue={isoDatum(r?.startDate)} />
      <Pole label="Splatnost (měsíců)" name="termMonths" type="number" required placeholder="360"
        defaultValue={r?.termMonths} hint="30 let = 360 měsíců" />
      <Pole label="Konec fixace" name="fixationEnd" type="date" defaultValue={isoDatum(r?.fixationEnd)}
        hint="Aplikace upozorní 12 měsíců předem" />
      <Pole label="Měsíční splátka (Kč)" name="monthlyPayment" type="number" defaultValue={r?.monthlyPayment}
        hint="Nech prázdné a dopočítá se anuita" />
      <div className="sm:col-span-2">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Ukládám…" : popisekTlacitka}
        </button>
      </div>
    </form>
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
