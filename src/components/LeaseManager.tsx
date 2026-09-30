"use client";

import { useActionState, useEffect, useState } from "react";
import { deleteLease, saveLease, type EntityFormState } from "@/lib/entityActions";
import {
  Hlaska, Pole, Rozbalovaci, SmazatTlacitko, UpravaPanel, UpravitTlacitko, Zaskrtavatko, isoDatum,
} from "./form";
import { Badge } from "./Stat";
import { Ikona } from "./Ikony";
import { ZalohyUpozorneni } from "./ZalohyUpozorneni";
import { SERVICE_TYPES } from "@/lib/categories";
import {
  popisPorovnani, porovnejZalohy, type PorovnaniZaloh, type SluzbaVstup,
} from "@/lib/zalohy";
import { czk, dateCz } from "@/lib/format";

interface Row {
  id: string; tenantName: string; tenantEmail: string | null; tenantPhone: string | null;
  startDate: Date; endDate: Date | null; rentMonthly: number; utilitiesMonthly: number;
  deposit: number; indexationClause: boolean; paymentDay: number; isActive: boolean;
}

export function LeaseManager({ propertyId, leases, canEdit, services, porovnani }: {
  propertyId: string; leases: Row[]; canEdit: boolean;
  /** Sluzby nemovitosti — zalohy se ve formulari overuji proti nim. */
  services: SluzbaVstup[];
  porovnani: PorovnaniZaloh | null;
}) {
  const [addState, addAction, adding] = useActionState<EntityFormState, FormData>(saveLease.bind(null, null), {});
  const [delState, delAction] = useActionState<EntityFormState, FormData>(deleteLease, {});

  const [upravaId, setUpravaId] = useState<string | null>(null);
  const [upravaState, upravaAction, upravuji] = useActionState<EntityFormState, FormData>(
    saveLease.bind(null, upravaId), {});
  useEffect(() => { if (upravaState.success) setUpravaId(null); }, [upravaState.success]);

  const upravovana = leases.find((l) => l.id === upravaId) ?? null;
  const serazene = [...leases].sort((a, b) => Number(b.isActive) - Number(a.isActive));

  return (
    <div>
      <Hlaska state={
        upravaState.error ? upravaState
          : addState.error || addState.success ? addState
          : delState.error || delState.success ? delState
          : upravaState
      } />

      <ZalohyUpozorneni porovnani={porovnani} />

      {leases.length === 0 ? (
        <p className="py-3 text-center text-sm text-ink-muted">Žádná nájemní smlouva.</p>
      ) : (
        <div className="space-y-3">
          {serazene.map((l) => (
            <div key={l.id} className={`rounded-lg border p-3 ${
              upravaId === l.id ? "border-accent/40 bg-accent/5" : l.isActive ? "border-good/40 bg-good/5" : "border-line"
            }`}>
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <span className="font-medium">{l.tenantName}</span>
                  <span className="ml-2"><Badge tone={l.isActive ? "good" : "neutral"}>{l.isActive ? "platná" : "ukončená"}</Badge></span>
                  {(l.tenantEmail || l.tenantPhone) && (
                    <div className="text-xs text-ink-muted">{[l.tenantEmail, l.tenantPhone].filter(Boolean).join(" · ")}</div>
                  )}
                </div>
                {canEdit && (
                  <div className="flex shrink-0 items-center gap-3">
                    <UpravitTlacitko aktivni={upravaId === l.id}
                      onClick={() => setUpravaId(upravaId === l.id ? null : l.id)} />
                    <SmazatTlacitko action={delAction} id={l.id}
                      potvrzeni={`Opravdu smazat smlouvu s ${l.tenantName}?`} />
                  </div>
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

      {canEdit && upravovana && (
        <UpravaPanel nadpis={`Upravit smlouvu s ${upravovana.tenantName}`} onZavrit={() => setUpravaId(null)}>
          <Formular key={upravovana.id} propertyId={propertyId} r={upravovana} services={services}
            action={upravaAction} pending={upravuji} popisekTlacitka="Uložit změny" />
        </UpravaPanel>
      )}

      {canEdit && !upravovana && (
        <Rozbalovaci popisek="Přidat nájemní smlouvu" zavritPo={addState.success}>
          <Formular propertyId={propertyId} r={null} services={services} action={addAction} pending={adding}
            popisekTlacitka="Uložit smlouvu" />
        </Rozbalovaci>
      )}
    </div>
  );
}

function Formular({ propertyId, r, services, action, pending, popisekTlacitka }: {
  propertyId: string; r: Row | null; services: SluzbaVstup[];
  action: (payload: FormData) => void; pending: boolean; popisekTlacitka: string;
}) {
  // Nova smlouva dostane zalohy predvyplnene podle sluzeb, ktere se preuctovavaji;
  // upravovana si nechava ty, ktere ma — prepsat je potichu by zmenilo smlouvu.
  const doporuceno = Math.round(porovnejZalohy(0, services)?.naklady ?? 0);
  const [zalohy, setZalohy] = useState(String(r ? r.utilitiesMonthly : doporuceno));
  const cislo = Number(zalohy.replace(/\s/g, "").replace(",", ".")) || 0;
  const zive = porovnejZalohy(cislo, services);
  const popis = zive ? popisPorovnani(zive) : null;

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="propertyId" value={propertyId} />
      <Pole label="Jméno nájemce" name="tenantName" required defaultValue={r?.tenantName} />
      <Pole label="E-mail" name="tenantEmail" type="email" placeholder="nepovinné" defaultValue={r?.tenantEmail ?? ""} />
      <Pole label="Telefon" name="tenantPhone" placeholder="nepovinné" defaultValue={r?.tenantPhone ?? ""} />
      <Pole label="Den splatnosti" name="paymentDay" type="number" min={1} max={28} defaultValue={r?.paymentDay ?? 15} />
      <Pole label="Čisté nájemné (Kč/měs.)" name="rentMonthly" type="number" required defaultValue={r?.rentMonthly}
        hint="Bez záloh na služby — jen tohle se daní" />
      <Pole label="Zálohy na služby (Kč/měs.)" name="utilitiesMonthly" type="number"
        value={zalohy} onChange={(e) => setZalohy(e.target.value)}
        hint={!r && doporuceno > 0 ? "Předvyplněno podle služeb, které se přeúčtovávají" : "Průchozí položka, nedaní se"} />
      <Pole label="Kauce (Kč)" name="deposit" type="number" defaultValue={r?.deposit ?? 0} />

      {/* Zive srovnani se sluzbami: nesoulad je videt drive, nez se smlouva ulozi */}
      <div className="sm:col-span-2">
        {popis ? (
          <div className={`rounded-xl px-4 py-3 text-sm ${popis.tone === "good" ? "bg-good/10" : "bg-warn/12"}`} role="status">
            <div className="flex items-start gap-2.5">
              <Ikona nazev={popis.tone === "good" ? "ok" : "pozor"}
                trida={`mt-0.5 h-4 w-4 ${popis.tone === "good" ? "text-good" : "text-warn"}`} />
              <div className="min-w-0">
                <div className="font-semibold">{popis.nadpis}</div>
                <p className="mt-0.5 text-ink-secondary">{popis.text}</p>
                {zive && zive.polozky.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-xs text-ink-secondary">
                    {zive.polozky.map((p, i) => (
                      <li key={i} className="flex justify-between gap-4">
                        <span>{SERVICE_TYPES[p.type] ?? p.type} · {p.provider}</span>
                        <span className="tabular-nums">{Math.round(p.castka).toLocaleString("cs-CZ")}&nbsp;Kč</span>
                      </li>
                    ))}
                  </ul>
                )}
                {zive && zive.polozky.length > 0 && zive.stav !== "sedi" && (
                  <button type="button" className="btn mt-3"
                    onClick={() => setZalohy(String(Math.round(zive.naklady)))}>
                    Použít {Math.round(zive.naklady).toLocaleString("cs-CZ")}&nbsp;Kč podle služeb
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-ink-muted">
            Žádná služba se zatím nepřeúčtovává nájemci, takže zálohy nemají s čím porovnat. Přeúčtované
            služby označíš v jejich formuláři.
          </p>
        )}
      </div>
      <Pole label="Nájem od" name="startDate" type="date" required defaultValue={isoDatum(r?.startDate)} />
      <Pole label="Nájem do" name="endDate" type="date" defaultValue={isoDatum(r?.endDate)}
        hint="Prázdné = na dobu neurčitou" />
      <div className="space-y-2 sm:col-span-2">
        <Zaskrtavatko name="indexationClause" label="Inflační doložka ve smlouvě"
          defaultChecked={r?.indexationClause} />
        <Zaskrtavatko name="isActive" label="Toto je platná smlouva" defaultChecked={r ? r.isActive : true}
          hint="Dosavadní platná smlouva se tím ukončí" />
      </div>
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
