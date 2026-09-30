"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { deleteTenant, saveTenant, type NajemciFormState } from "@/lib/najemciActions";
import { zkontrolujUcet } from "@/lib/ucet";
import { dateCz } from "@/lib/format";
import { Hlaska, Pole, SmazatTlacitko, TextPole, UpravaPanel, UpravitTlacitko } from "./form";
import { UliceNaseptavac } from "./AdresaNaseptavac";
import { Badge } from "./Stat";

export interface NajemceRadek {
  id: string;
  cislo: string;
  name: string;
  email: string | null; phone: string | null;
  street: string | null; city: string | null; zip: string | null;
  account: string | null; notes: string | null;
  smlouvy: {
    id: string; propertyId: string; nemovitost: string; od: string; do: string | null; aktivni: boolean;
  }[];
}

export function NajemciManager({ najemci }: { najemci: NajemceRadek[] }) {
  const [upravaId, setUpravaId] = useState<string | null>(null);
  const [state, action, ukladam] = useActionState<NajemciFormState, FormData>(saveTenant, {});
  const [delState, delAction] = useActionState<NajemciFormState, FormData>(deleteTenant, {});
  useEffect(() => { if (state.success) setUpravaId(null); }, [state.success]);
  const [hledani, setHledani] = useState("");

  const upravovany = najemci.find((n) => n.id === upravaId) ?? null;
  const q = hledani.trim().toLowerCase();
  const zobrazene = q
    ? najemci.filter((n) => [n.name, n.email, n.phone, n.cislo].some((x) => x?.toLowerCase().includes(q)))
    : najemci;

  return (
    <div>
      <Hlaska state={state.error || state.success ? state : delState} />

      <input type="search" className="input mb-3 max-w-sm" placeholder="Hledat jméno, e-mail, telefon, číslo…"
        value={hledani} onChange={(e) => setHledani(e.target.value)} aria-label="Hledat nájemce" />

      {zobrazene.length === 0 ? (
        <p className="py-3 text-center text-sm text-ink-muted">Žádný nájemce.</p>
      ) : (
        <div className="table-scroll">
          <table className="table-base">
            <thead>
              <tr>
                <th>Nájemce</th>
                <th className="hidden md:table-cell">Kontakt</th>
                <th>Smlouvy</th>
                <th className="w-[5.5rem]"><span className="sr-only">Akce</span></th>
              </tr>
            </thead>
            <tbody>
              {zobrazene.map((n) => {
                const adresa = [n.street, [n.zip, n.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
                const aktivni = n.smlouvy.filter((s) => s.aktivni).length;
                return (
                  <tr key={n.id} className={upravaId === n.id ? "!bg-accent-soft/60" : undefined}>
                    <td>
                      <div className="font-medium">{n.name}</div>
                      <div className="text-xs tabular-nums text-ink-muted" title={`Interní ID: ${n.id}`}>{n.cislo}</div>
                      <div className="text-xs text-ink-muted md:hidden">{n.email ?? n.phone ?? ""}</div>
                    </td>
                    <td className="hidden text-sm md:table-cell">
                      {[n.email, n.phone].filter(Boolean).join(" · ") || <span className="text-xs text-ink-muted">bez kontaktu</span>}
                      {adresa && <div className="text-xs text-ink-muted">{adresa}</div>}
                      {n.account && <div className="text-xs text-ink-muted">účet {n.account}</div>}
                    </td>
                    <td>
                      {n.smlouvy.length === 0 ? (
                        <span className="text-xs text-ink-muted">bez smlouvy</span>
                      ) : (
                        <ul className="space-y-0.5 text-xs">
                          {n.smlouvy.map((s) => (
                            <li key={s.id} className="flex flex-wrap items-center gap-1.5">
                              <Link href={`/properties/${s.propertyId}`} className="text-accent hover:underline">{s.nemovitost}</Link>
                              <span className="tabular-nums text-ink-muted">{dateCz(s.od)} – {s.do ? dateCz(s.do) : "dosud"}</span>
                              {s.aktivni && <Badge tone="good">platná</Badge>}
                            </li>
                          ))}
                        </ul>
                      )}
                      {aktivni > 1 && <div className="mt-1 text-xs text-warn">více platných smluv</div>}
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-0.5">
                        <UpravitTlacitko aktivni={upravaId === n.id}
                          onClick={() => setUpravaId(upravaId === n.id ? null : n.id)} />
                        {n.smlouvy.length === 0 && (
                          <SmazatTlacitko action={delAction} id={n.id} potvrzeni={`Smazat nájemce ${n.name}?`} />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {upravovany && (
        <UpravaPanel nadpis={`Upravit nájemce ${upravovany.cislo}`} onZavrit={() => setUpravaId(null)}>
          <Formular key={upravovany.id} n={upravovany} action={action} pending={ukladam} />
        </UpravaPanel>
      )}
    </div>
  );
}

function Formular({ n, action, pending }: { n: NajemceRadek; action: (p: FormData) => void; pending: boolean }) {
  const [a, setA] = useState({ ulice: n.street ?? "", obec: n.city ?? "", psc: n.zip ?? "" });
  const [ucet, setUcet] = useState(n.account ?? "");
  const kontrola = zkontrolujUcet(ucet);
  const chyba = kontrola.ok ? null : kontrola.chyba;

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="id" value={n.id} />
      <Pole label="Jméno" name="name" required defaultValue={n.name} sirka="sm:col-span-2" />
      <Pole label="E-mail" name="email" type="email" defaultValue={n.email ?? ""} placeholder="nepovinné"
        hint="Podle e-mailu se pozná stejný člověk u další smlouvy" />
      <Pole label="Telefon" name="phone" defaultValue={n.phone ?? ""} placeholder="nepovinné" />
      <UliceNaseptavac name="street" value={a.ulice} className="sm:col-span-2" placeholder="nepovinné"
        onChange={(t) => setA((x) => ({ ...x, ulice: t }))}
        onVybrano={(v) => setA((x) => ({ ulice: v.ulice, obec: v.mesto || x.obec, psc: v.psc || x.psc }))} />
      <Pole label="Obec" name="city" value={a.obec} onChange={(e) => setA((x) => ({ ...x, obec: e.target.value }))} />
      <Pole label="PSČ" name="zip" value={a.psc} onChange={(e) => setA((x) => ({ ...x, psc: e.target.value }))} />
      <div className="sm:col-span-2">
        <label className="label mb-1.5 block" htmlFor="account">Číslo účtu pro vratku</label>
        <input id="account" name="account" className={`input ${chyba ? "border-bad" : ""}`} value={ucet}
          onChange={(e) => setUcet(e.target.value)} autoComplete="off" placeholder="nepovinné, např. 19-2000145399/0800" />
        {chyba ? <p className="mt-1 text-xs text-bad">{chyba}</p>
          : kontrola.ok && kontrola.hodnota ? <p className="mt-1 text-xs text-ink-muted">Číslo účtu je v pořádku.</p> : null}
      </div>
      <TextPole label="Poznámka" name="notes" sirka="sm:col-span-2" defaultValue={n.notes ?? ""} placeholder="nepovinné" />
      <p className="text-xs text-ink-muted sm:col-span-2">Změna platí ve všech smlouvách tohoto nájemce.</p>
      <div className="sm:col-span-2">
        <button type="submit" disabled={pending} className="btn btn-primary">{pending ? "Ukládám…" : "Uložit nájemce"}</button>
      </div>
    </form>
  );
}
