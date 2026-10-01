"use client";

import { useActionState, useEffect, useState } from "react";
import { deleteOperator, saveOperator, type ProvozovateleState } from "@/lib/provozovateleActions";
import { zkontrolujUcet } from "@/lib/ucet";
import { Hlaska, Pole, SmazatTlacitko, TextPole, UpravaPanel, UpravitTlacitko } from "./form";
import { UliceNaseptavac } from "./AdresaNaseptavac";

export interface ProvozovatelRadek {
  id: string; name: string; street: string | null; city: string | null; zip: string | null;
  ico: string | null; dic: string | null; email: string | null; phone: string | null;
  account: string | null; notes: string | null; pouzito: number;
}

/** Provozovatele nemovitosti: kdo je na smlouvach a vyuctovani jako pronajimatel. */
export function ProvozovateleManager({ provozovatele }: { provozovatele: ProvozovatelRadek[] }) {
  const [upravaId, setUpravaId] = useState<string | null>(null);
  const [pridani, setPridani] = useState(false);
  const [state, action, pending] = useActionState<ProvozovateleState, FormData>(saveOperator, {});
  const [delState, delAction] = useActionState<ProvozovateleState, FormData>(deleteOperator, {});
  useEffect(() => { if (state.success) { setUpravaId(null); setPridani(false); } }, [state.success]);

  const upravovany = provozovatele.find((p) => p.id === upravaId) ?? null;

  return (
    <div>
      <Hlaska state={state.error || state.success ? state : delState} />

      {provozovatele.length === 0 ? (
        <p className="py-2 text-center text-sm text-ink-muted">
          Zatím žádný provozovatel. Bez něj je na smlouvách pronajímatelem vlastník s největším podílem.
        </p>
      ) : (
        <ul className="divide-y divide-line/70 rounded-xl border border-line">
          {provozovatele.map((p) => {
            const adresa = [p.street, [p.zip, p.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
            return (
              <li key={p.id} className={`flex flex-wrap items-center gap-3 px-3.5 py-2.5 ${upravaId === p.id ? "bg-accent-soft/50" : ""}`}>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{p.name}</div>
                  <div className="text-xs text-ink-muted">
                    {[p.ico && `IČO ${p.ico}`, p.dic && `DIČ ${p.dic}`, adresa, p.account && `účet ${p.account}`].filter(Boolean).join(" · ") || "bez údajů"}
                  </div>
                </div>
                <span className="text-xs text-ink-muted">{p.pouzito === 0 ? "nepoužit" : `${p.pouzito} ${p.pouzito === 1 ? "nemovitost" : p.pouzito < 5 ? "nemovitosti" : "nemovitostí"}`}</span>
                <div className="flex items-center gap-0.5">
                  <UpravitTlacitko aktivni={upravaId === p.id} onClick={() => { setPridani(false); setUpravaId(upravaId === p.id ? null : p.id); }} />
                  {p.pouzito === 0 && <SmazatTlacitko action={delAction} id={p.id} potvrzeni={`Smazat provozovatele ${p.name}?`} />}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {upravovany && (
        <UpravaPanel nadpis={`Upravit: ${upravovany.name}`} onZavrit={() => setUpravaId(null)}>
          <Formular key={upravovany.id} p={upravovany} action={action} pending={pending} popisek="Uložit provozovatele" />
        </UpravaPanel>
      )}

      {!upravovany && (pridani ? (
        <UpravaPanel nadpis="Nový provozovatel" onZavrit={() => setPridani(false)}>
          <Formular p={null} action={action} pending={pending} popisek="Přidat provozovatele" />
        </UpravaPanel>
      ) : (
        <button type="button" onClick={() => setPridani(true)} className="btn mt-3 w-full border-dashed text-ink-secondary">
          + Přidat provozovatele
        </button>
      ))}
    </div>
  );
}

function Formular({ p, action, pending, popisek }: {
  p: ProvozovatelRadek | null; action: (f: FormData) => void; pending: boolean; popisek: string;
}) {
  const [a, setA] = useState({ ulice: p?.street ?? "", obec: p?.city ?? "", psc: p?.zip ?? "" });
  const [ucet, setUcet] = useState(p?.account ?? "");
  const kontrola = zkontrolujUcet(ucet);
  const chyba = kontrola.ok ? null : kontrola.chyba;

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="id" value={p?.id ?? ""} />
      <Pole label="Jméno nebo název" name="name" required defaultValue={p?.name} sirka="sm:col-span-2" />
      <Pole label="IČO" name="ico" defaultValue={p?.ico ?? ""} placeholder="nepovinné, 8 číslic" />
      <Pole label="DIČ" name="dic" defaultValue={p?.dic ?? ""} placeholder="nepovinné" />
      <UliceNaseptavac name="street" value={a.ulice} className="sm:col-span-2" placeholder="sídlo nebo adresa"
        onChange={(t) => setA((x) => ({ ...x, ulice: t }))}
        onVybrano={(v) => setA((x) => ({ ulice: v.ulice, obec: v.mesto || x.obec, psc: v.psc || x.psc }))} />
      <Pole label="Obec" name="city" value={a.obec} onChange={(e) => setA((x) => ({ ...x, obec: e.target.value }))} />
      <Pole label="PSČ" name="zip" value={a.psc} onChange={(e) => setA((x) => ({ ...x, psc: e.target.value }))} />
      <Pole label="E-mail" name="email" type="email" defaultValue={p?.email ?? ""} placeholder="nepovinné" />
      <Pole label="Telefon" name="phone" defaultValue={p?.phone ?? ""} placeholder="nepovinné" />
      <div className="sm:col-span-2">
        <label className="label mb-1.5 block" htmlFor="op-account">Číslo účtu</label>
        <input id="op-account" name="account" className={`input ${chyba ? "border-bad" : ""}`} value={ucet}
          onChange={(e) => setUcet(e.target.value)} autoComplete="off" placeholder="nepovinné, např. 19-2000145399/0800" />
        {chyba ? <p className="mt-1 text-xs text-bad">{chyba}</p>
          : <p className="mt-1 text-xs text-ink-muted">Sem nájemci platí nedoplatky z vyúčtování (QR platba).</p>}
      </div>
      <TextPole label="Poznámka" name="notes" sirka="sm:col-span-2" defaultValue={p?.notes ?? ""} placeholder="nepovinné" />
      <div className="sm:col-span-2">
        <button type="submit" disabled={pending} className="btn btn-primary">{pending ? "Ukládám…" : popisek}</button>
      </div>
    </form>
  );
}
