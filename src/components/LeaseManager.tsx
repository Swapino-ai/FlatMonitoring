"use client";

import { useActionState } from "react";
import { deleteLease, saveLease, type EntityFormState } from "@/lib/entityActions";
import { Hlaska, Pole, Rozbalovaci, SmazatTlacitko, Zaskrtavatko } from "./form";
import { Badge } from "./Stat";
import { czk, dateCz } from "@/lib/format";

interface Row {
  id: string; tenantName: string; tenantEmail: string | null; tenantPhone: string | null;
  startDate: Date; endDate: Date | null; rentMonthly: number; utilitiesMonthly: number;
  deposit: number; indexationClause: boolean; paymentDay: number; isActive: boolean;
}

export function LeaseManager({ propertyId, leases, canEdit }: {
  propertyId: string; leases: Row[]; canEdit: boolean;
}) {
  const [addState, addAction, adding] = useActionState<EntityFormState, FormData>(saveLease.bind(null, null), {});
  const [delState, delAction] = useActionState<EntityFormState, FormData>(deleteLease, {});

  const serazene = [...leases].sort((a, b) => Number(b.isActive) - Number(a.isActive));

  return (
    <div>
      <Hlaska state={addState.error || addState.success ? addState : delState} />

      {leases.length === 0 ? (
        <p className="py-3 text-center text-sm text-ink-muted">Žádná nájemní smlouva.</p>
      ) : (
        <div className="space-y-3">
          {serazene.map((l) => (
            <div key={l.id} className={`rounded-lg border p-3 ${l.isActive ? "border-good/40 bg-good/5" : "border-line"}`}>
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <span className="font-medium">{l.tenantName}</span>
                  <span className="ml-2"><Badge tone={l.isActive ? "good" : "neutral"}>{l.isActive ? "platná" : "ukončená"}</Badge></span>
                  {(l.tenantEmail || l.tenantPhone) && (
                    <div className="text-xs text-ink-muted">{[l.tenantEmail, l.tenantPhone].filter(Boolean).join(" · ")}</div>
                  )}
                </div>
                {canEdit && (
                  <SmazatTlacitko action={delAction} id={l.id}
                    potvrzeni={`Opravdu smazat smlouvu s ${l.tenantName}?`} />
                )}
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
                <Radek t="Čisté nájemné" v={`${czk(l.rentMonthly)}/měs.`} />
                <Radek t="Zálohy na služby" v={`${czk(l.utilitiesMonthly)}/měs.`} />
                <Radek t="Kauce" v={czk(l.deposit)} />
                <Radek t="Od" v={dateCz(l.startDate)} />
                <Radek t="Do" v={l.endDate ? dateCz(l.endDate) : "na dobu neurčitou"} />
                <Radek t="Inflační doložka" v={l.indexationClause ? "ano" : "ne"} />
              </dl>
            </div>
          ))}
        </div>
      )}

      {canEdit && (
        <Rozbalovaci popisek="Přidat nájemní smlouvu" zavritPo={addState.success}>
          <form action={addAction} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="propertyId" value={propertyId} />
            <Pole label="Jméno nájemce" name="tenantName" required />
            <Pole label="E-mail" name="tenantEmail" type="email" placeholder="nepovinné" />
            <Pole label="Telefon" name="tenantPhone" placeholder="nepovinné" />
            <Pole label="Den splatnosti" name="paymentDay" type="number" min={1} max={28} defaultValue={15} />
            <Pole label="Čisté nájemné (Kč/měs.)" name="rentMonthly" type="number" required
              hint="Bez záloh na služby — jen tohle se daní" />
            <Pole label="Zálohy na služby (Kč/měs.)" name="utilitiesMonthly" type="number" defaultValue={0}
              hint="Průchozí položka, nedaní se" />
            <Pole label="Kauce (Kč)" name="deposit" type="number" defaultValue={0} />
            <div />
            <Pole label="Nájem od" name="startDate" type="date" required />
            <Pole label="Nájem do" name="endDate" type="date" hint="Prázdné = na dobu neurčitou" />
            <div className="space-y-2 sm:col-span-2">
              <Zaskrtavatko name="indexationClause" label="Inflační doložka ve smlouvě" />
              <Zaskrtavatko name="isActive" label="Toto je platná smlouva" defaultChecked
                hint="Dosavadní platná smlouva se tím ukončí" />
            </div>
            <div className="sm:col-span-2">
              <button type="submit" disabled={adding} className="btn btn-primary">
                {adding ? "Ukládám…" : "Uložit smlouvu"}
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
