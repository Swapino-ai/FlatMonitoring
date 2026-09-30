"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import {
  deleteSettlement, saveSettlement, type VyuctovaniFormState,
} from "@/lib/vyuctovaniActions";
import {
  pridejDny, prunik, rozuctuj, vyuctovaniNajemce,
  type NajemVstup, type SluzbaVyuctovani, type VyuctovaniVstup,
} from "@/lib/vyuctovani";
import { SERVICE_TYPES } from "@/lib/categories";
import { czk, dateCz } from "@/lib/format";
import { Hlaska, Pole, Rozbalovaci, SmazatTlacitko, TextPole, UpravaPanel, UpravitTlacitko, Vyber } from "./form";
import { DatumPole } from "./DatumPole";
import { Ikona, IKONA_SLUZBY } from "./Ikony";
import { Badge } from "./Stat";

export interface SluzbaRadek { id: string; type: string; provider: string; chargedToTenant: boolean }

export interface NajemRadek extends NajemVstup {
  tenantStreet: string | null; tenantCity: string | null; tenantZip: string | null;
  tenantAccount: string | null;
}

export interface VyuctovaniRadek extends VyuctovaniVstup {
  serviceId: string;
  cisloFaktury: string | null;
  poznamka: string | null;
}

const dnesISO = () => new Date().toISOString().slice(0, 10);
const cislo = (t: string) => Number(t.replace(/\s/g, "").replace(",", "."));
const nazevSluzby = (s: SluzbaRadek) => `${SERVICE_TYPES[s.type] ?? s.type} · ${s.provider}`;
const obdobi = (od: string, doDne: string) => `${dateCz(od)} – ${dateCz(doDne)}`;

// --- Vyuctovani sluzeb od dodavatelu ---

export function VyuctovaniSluzeb({ services, leases, vyuctovani, canEdit }: {
  services: SluzbaRadek[]; leases: NajemRadek[]; vyuctovani: VyuctovaniRadek[]; canEdit: boolean;
}) {
  const [addState, addAction, adding] = useActionState<VyuctovaniFormState, FormData>(saveSettlement.bind(null, null), {});
  const [delState, delAction] = useActionState<VyuctovaniFormState, FormData>(deleteSettlement, {});
  const [upravaId, setUpravaId] = useState<string | null>(null);
  const [upravaState, upravaAction, upravuji] = useActionState<VyuctovaniFormState, FormData>(
    saveSettlement.bind(null, upravaId), {});
  useEffect(() => { if (upravaState.success) setUpravaId(null); }, [upravaState.success]);
  const [rozbaleno, setRozbaleno] = useState<Set<string>>(new Set());

  const upravovane = vyuctovani.find((v) => v.id === upravaId) ?? null;
  const prepni = (id: string) => setRozbaleno((r) => { const n = new Set(r); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const stav = upravaState.error || upravaState.success ? upravaState
    : addState.error || addState.success ? addState
    : delState.error || delState.success ? delState : {};

  const sSluzbami = services.filter((s) => vyuctovani.some((v) => v.serviceId === s.id));

  return (
    <div>
      <Hlaska state={stav} />

      {vyuctovani.length === 0 ? (
        <p className="py-3 text-center text-sm text-ink-muted">Zatím žádné vyúčtování od dodavatelů.</p>
      ) : (
        <div className="space-y-5">
          {sSluzbami.map((s) => {
            const radky = vyuctovani.filter((v) => v.serviceId === s.id).sort((a, b) => (a.od < b.od ? 1 : -1));
            return (
              <div key={s.id}>
                <div className="mb-2 flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent-soft text-accent">
                    <Ikona nazev={IKONA_SLUZBY[s.type] ?? "tri"} trida="h-4 w-4" />
                  </span>
                  <div className="text-sm font-semibold">{nazevSluzby(s)}</div>
                  {s.chargedToTenant && <Badge tone="neutral">přeúčtuje se nájemci</Badge>}
                </div>
                <div className="divide-y divide-line/70 rounded-xl border border-line">
                  {radky.map((v) => {
                    const rozdel = rozuctuj(v, leases);
                    const otevrene = rozbaleno.has(v.id);
                    const vysl = v.zalohyDodavateli - v.naklad;
                    return (
                      <div key={v.id} className={upravaId === v.id ? "bg-accent-soft/50" : undefined}>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3.5 py-2.5">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium tabular-nums">{obdobi(v.od, v.do)}</div>
                            <div className="text-xs text-ink-muted">
                              {v.cisloFaktury ? `č. ${v.cisloFaktury} · ` : ""}
                              {v.rezim === "READINGS" ? `podle odečtů${v.jednotka ? ` (${v.jednotka})` : ""}` : "podle dnů"}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-semibold tabular-nums">{czk(v.naklad)}</div>
                            {v.zalohyDodavateli > 0 && (
                              <div className={`text-xs tabular-nums ${vysl >= 0 ? "text-good" : "text-bad"}`}>
                                {vysl >= 0 ? "přeplatek" : "nedoplatek"} {czk(Math.abs(vysl))}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-0.5">
                            <button type="button" onClick={() => prepni(v.id)} aria-expanded={otevrene}
                              title="Rozúčtování na nájemce" aria-label="Rozúčtování na nájemce"
                              className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                                otevrene ? "bg-accent-soft text-accent" : "text-ink-muted hover:bg-accent-soft hover:text-accent"}`}>
                              <Ikona nazev="najemce" />
                            </button>
                            {canEdit && (
                              <>
                                <UpravitTlacitko aktivni={upravaId === v.id}
                                  onClick={() => setUpravaId(upravaId === v.id ? null : v.id)} />
                                <SmazatTlacitko action={delAction} id={v.id}
                                  potvrzeni={`Smazat vyúčtování ${obdobi(v.od, v.do)}?`} />
                              </>
                            )}
                          </div>
                        </div>
                        {otevrene && (
                          <div className="border-t border-line/70 bg-surface-sunken/50 px-3.5 py-2.5">
                            {rozdel.chyba ? (
                              <p className="text-xs text-bad">{rozdel.chyba}</p>
                            ) : (
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-left text-ink-muted">
                                    <th className="py-1 font-medium">Kdo</th>
                                    <th className="py-1 font-medium">Období</th>
                                    <th className="py-1 text-right font-medium">{v.rezim === "READINGS" ? "Spotřeba" : "Dnů"}</th>
                                    <th className="py-1 text-right font-medium">Podíl</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {rozdel.podily.map((p) => (
                                    <tr key={p.leaseId}>
                                      <td className="py-0.5">{p.nazev}</td>
                                      <td className="py-0.5 tabular-nums text-ink-secondary">{p.od && p.do ? obdobi(p.od, p.do) : "—"}</td>
                                      <td className="py-0.5 text-right tabular-nums">
                                        {v.rezim === "READINGS"
                                          ? p.chybiOdecet ? <span className="text-warn">chybí</span> : p.spotreba
                                          : p.dnu}
                                      </td>
                                      <td className="py-0.5 text-right font-medium tabular-nums">{czk(p.podil)}</td>
                                    </tr>
                                  ))}
                                  {(rozdel.vlastnik.dnu > 0 || rozdel.vlastnik.podil > 0) && (
                                    <tr className="text-ink-muted">
                                      <td className="py-0.5" colSpan={2}>Vlastník (byt bez nájemce)</td>
                                      <td className="py-0.5 text-right tabular-nums">
                                        {v.rezim === "READINGS" ? v.spotrebaVlastnik ?? 0 : rozdel.vlastnik.dnu}
                                      </td>
                                      <td className="py-0.5 text-right tabular-nums">{czk(rozdel.vlastnik.podil)}</td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {canEdit && upravovane && (
        <UpravaPanel nadpis={`Upravit vyúčtování ${obdobi(upravovane.od, upravovane.do)}`} onZavrit={() => setUpravaId(null)}>
          <Formular key={upravovane.id} r={upravovane} services={services} leases={leases} vyuctovani={vyuctovani}
            action={upravaAction} pending={upravuji} popisekTlacitka="Uložit změny" />
        </UpravaPanel>
      )}

      {canEdit && !upravovane && (
        <Rozbalovaci popisek="Přidat vyúčtování od dodavatele" zavritPo={addState.success}>
          <Formular r={null} services={services} leases={leases} vyuctovani={vyuctovani}
            action={addAction} pending={adding} popisekTlacitka="Uložit vyúčtování" />
        </Rozbalovaci>
      )}
    </div>
  );
}

function Formular({ r, services, leases, vyuctovani, action, pending, popisekTlacitka }: {
  r: VyuctovaniRadek | null; services: SluzbaRadek[]; leases: NajemRadek[]; vyuctovani: VyuctovaniRadek[];
  action: (payload: FormData) => void; pending: boolean; popisekTlacitka: string;
}) {
  const [sluzbaId, setSluzbaId] = useState(r?.serviceId ?? services[0]?.id ?? "");
  const [od, setOd] = useState<string | null>(r?.od ?? null);
  const [doDne, setDoDne] = useState<string | null>(r?.do ?? null);
  const [naklad, setNaklad] = useState(r ? String(r.naklad) : "");
  const [rezim, setRezim] = useState<string>(r?.rezim ?? "DAYS");
  const [odecty, setOdecty] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(r?.odecty ?? {}).map(([k, v]) => [k, String(v)])));
  const [vlastnik, setVlastnik] = useState(r?.spotrebaVlastnik != null ? String(r.spotrebaVlastnik) : "");

  // Nove vyuctovani navazuje na predchozi: zacina den po konci posledniho
  const navrhOd = useMemo(() => {
    const konce = vyuctovani.filter((v) => v.serviceId === sluzbaId).map((v) => v.do).sort();
    return konce.length ? pridejDny(konce[konce.length - 1], 1) : "";
  }, [vyuctovani, sluzbaId]);

  // Najemci, kterych se obdobi tyka — u odectu se jim zadava spotreba
  const dotcene = od && doDne ? leases.filter((l) => prunik(l.od, l.do, od, doDne)) : [];

  const nahled = od && doDne && od <= doDne && cislo(naklad) >= 0 && naklad !== ""
    ? rozuctuj({
      id: "nahled", od, do: doDne, naklad: cislo(naklad), zalohyDodavateli: 0,
      rezim: rezim === "READINGS" ? "READINGS" : "DAYS",
      spotrebaVlastnik: cislo(vlastnik) || 0,
      odecty: Object.fromEntries(Object.entries(odecty).filter(([, v]) => v !== "").map(([k, v]) => [k, cislo(v)])),
    }, leases)
    : null;

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="label mb-1.5 block" htmlFor="serviceId">Služba</label>
        <select id="serviceId" name="serviceId" className="input" value={sluzbaId}
          onChange={(e) => setSluzbaId(e.target.value)}>
          {services.map((s) => <option key={s.id} value={s.id}>{nazevSluzby(s)}</option>)}
        </select>
      </div>
      <DatumPole key={`od-${r?.id ?? sluzbaId}`} label="Období od" name="periodFrom" required
        defaultValue={r?.od ?? navrhOd} onChange={setOd}
        hint={!r && navrhOd ? "Navazuje na předchozí vyúčtování této služby." : undefined} />
      <DatumPole label="Období do (včetně)" name="periodTo" required defaultValue={r?.do ?? ""} onChange={setDoDne}
        hint="Nemusí to být celý měsíc ani rok — zadej přesně, co vyúčtování pokrývá." />
      <Pole label="Skutečný náklad za období (Kč)" name="totalCost" type="number" step="0.01" required
        value={naklad} onChange={(e) => setNaklad(e.target.value)} />
      <Pole label="Zálohy zaplacené dodavateli (Kč)" name="supplierAdvances" type="number" step="0.01"
        defaultValue={r?.zalohyDodavateli ?? 0} hint="Rozdíl proti nákladu je přeplatek nebo nedoplatek u dodavatele" />
      <Pole label="Číslo dokladu" name="invoiceNo" placeholder="nepovinné" defaultValue={r?.cisloFaktury ?? ""} />
      <Vyber label="Jak rozdělit mezi nájemce" name="splitMode" defaultValue={rezim} onChange={setRezim}
        options={[["DAYS", "Podle dnů bydlení"], ["READINGS", "Podle odečtů (spotřeby)"]]} />

      {rezim === "READINGS" && (
        <div className="space-y-3 rounded-xl bg-surface-sunken p-3 sm:col-span-2">
          <Pole label="Jednotka spotřeby" name="readingUnit" placeholder="m³, kWh, GJ…" defaultValue={r?.jednotka ?? ""} />
          {dotcene.length === 0 && (
            <p className="text-xs text-ink-muted">Zadej období — pak se ukážou nájemci, kterých se týká.</p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {dotcene.map((l) => (
              <Pole key={l.id} label={`Spotřeba: ${l.nazev} (${dateCz(l.od)} – ${l.do ? dateCz(l.do) : "dosud"})`}
                name={`odecet:${l.id}`} type="number" step="any"
                value={odecty[l.id] ?? ""} onChange={(e) => setOdecty((o) => ({ ...o, [l.id]: e.target.value }))} />
            ))}
            <Pole label="Spotřeba mimo nájemce (prázdný byt, společné)" name="ownerConsumption" type="number" step="any"
              value={vlastnik} onChange={(e) => setVlastnik(e.target.value)} placeholder="nepovinné" />
          </div>
        </div>
      )}

      {nahled && !nahled.chyba && (
        <div className="rounded-xl bg-accent-soft/60 px-3.5 py-2.5 text-sm sm:col-span-2" role="status">
          <div className="mb-1 font-semibold">Takhle se rozúčtuje</div>
          <ul className="space-y-0.5 text-xs text-ink-secondary">
            {nahled.podily.map((p) => (
              <li key={p.leaseId} className="flex justify-between gap-3">
                <span>{p.nazev} · {rezim === "READINGS" ? (p.chybiOdecet ? "chybí odečet" : `${p.spotreba}`) : `${p.dnu} dní`}</span>
                <span className="tabular-nums font-medium">{czk(p.podil)}</span>
              </li>
            ))}
            {(nahled.vlastnik.dnu > 0 || nahled.vlastnik.podil > 0) && (
              <li className="flex justify-between gap-3">
                <span>Vlastník{rezim === "DAYS" ? ` · ${nahled.vlastnik.dnu} dní bez nájemce` : ""}</span>
                <span className="tabular-nums">{czk(nahled.vlastnik.podil)}</span>
              </li>
            )}
          </ul>
        </div>
      )}
      {nahled?.chyba && <p className="text-xs text-bad sm:col-span-2">{nahled.chyba}</p>}

      <TextPole label="Poznámka" name="notes" sirka="sm:col-span-2" defaultValue={r?.poznamka ?? ""} placeholder="nepovinné" />
      <div className="sm:col-span-2">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Ukládám…" : popisekTlacitka}
        </button>
      </div>
    </form>
  );
}

// --- Vyuctovani pro najemce ---

export function VyuctovaniNajemce({ nemovitost, adresaNemovitosti, leases, services }: {
  nemovitost: string; adresaNemovitosti: string;
  leases: NajemRadek[];
  services: SluzbaVyuctovani[];
}) {
  const razene = useMemo(() => [...leases].sort((a, b) => (a.od < b.od ? 1 : -1)), [leases]);
  const [najemId, setNajemId] = useState(razene[0]?.id ?? "");
  const najem = razene.find((l) => l.id === najemId) ?? null;

  const dnes = dnesISO();
  const [od, setOd] = useState<string | null>(najem?.od ?? null);
  const [doDne, setDoDne] = useState<string | null>(najem ? (najem.do && najem.do < dnes ? najem.do : dnes) : null);
  const [klic, setKlic] = useState(0);

  function nastav(o: string, d: string) { setOd(o); setDoDne(d); setKlic((k) => k + 1); }
  function vyberNajemce(id: string) {
    setNajemId(id);
    const l = razene.find((x) => x.id === id);
    if (l) nastav(l.od, l.do && l.do < dnes ? l.do : dnes);
  }

  const vysledek = najem && od && doDne && od <= doDne
    ? vyuctovaniNajemce(najem, leases, services, od, doDne) : null;

  if (leases.length === 0) {
    return <p className="py-3 text-center text-sm text-ink-muted">Žádná nájemní smlouva, není komu vyúčtování udělat.</p>;
  }

  const rok = new Date().getFullYear();
  const adresaNajemce = najem
    ? [najem.tenantStreet, [najem.tenantZip, najem.tenantCity].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "";

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-3 print:hidden">
        <Vyber label="Nájemce" name="najemce" defaultValue={najemId} onChange={vyberNajemce} sirka="sm:col-span-3"
          options={razene.map((l) => [l.id, `${l.nazev} (${dateCz(l.od)} – ${l.do ? dateCz(l.do) : "dosud"})`])} />
        <DatumPole key={`od-${najemId}-${klic}`} label="Vyúčtování od" name="od" defaultValue={od ?? ""} onChange={setOd} />
        <DatumPole key={`do-${najemId}-${klic}`} label="Vyúčtování do" name="do" defaultValue={doDne ?? ""} onChange={setDoDne} />
        <div className="flex flex-wrap items-end gap-1.5 pb-0.5">
          {najem && <button type="button" className="btn text-xs" onClick={() => nastav(najem.od, najem.do && najem.do < dnes ? najem.do : dnes)}>Celý nájem</button>}
          <button type="button" className="btn text-xs" onClick={() => nastav(`${rok - 1}-01-01`, `${rok - 1}-12-31`)}>Loni</button>
          <button type="button" className="btn text-xs" onClick={() => nastav(`${rok}-01-01`, dnes)}>Letos</button>
        </div>
      </div>

      {vysledek?.chyba && <p className="mt-4 rounded-lg bg-warn/15 px-3 py-2 text-sm">{vysledek.chyba}</p>}

      {vysledek && !vysledek.chyba && najem && (
        <div className="mt-5">
          {vysledek.neuplne && (
            <div className="mb-3 rounded-xl bg-warn/15 px-4 py-3 text-sm print:hidden" role="status">
              <div className="flex items-start gap-2.5">
                <Ikona nazev="pozor" trida="mt-0.5 h-4 w-4 text-warn" />
                <div>
                  <div className="font-semibold">Vyúčtování je neúplné</div>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-ink-secondary">
                    {vysledek.radky.flatMap((x) => [
                      ...x.chybi.map((c, i) => (
                        <li key={`${x.sluzbaId}-${i}`}>{x.nazev}: chybí vyúčtování za {obdobi(c[0], c[1])}</li>
                      )),
                      ...x.zdroje.filter((z) => z.chybiOdecet).map((z) => (
                        <li key={`${x.sluzbaId}-${z.id}`}>{x.nazev}: chybí odečet nájemce ve vyúčtování {obdobi(z.od, z.do)}</li>
                      )),
                    ])}
                  </ul>
                </div>
              </div>
            </div>
          )}

          <div className="vyuctovani-tisk rounded-xl border border-line p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
              <div>
                <h3 className="text-base font-semibold">Vyúčtování služeb</h3>
                <p className="text-sm text-ink-secondary">{obdobi(vysledek.od, vysledek.do)}</p>
              </div>
              <div className="text-right text-sm">
                <div className="font-medium">{nemovitost}</div>
                <div className="text-xs text-ink-muted">{adresaNemovitosti}</div>
              </div>
            </div>
            <div className="mt-3 text-sm">
              <div className="text-xs uppercase tracking-wide text-ink-muted">Nájemce</div>
              <div className="font-medium">{najem.nazev}</div>
              {adresaNajemce && <div className="text-xs text-ink-secondary">{adresaNajemce}</div>}
            </div>

            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-muted">
                  <th className="py-1.5 font-medium">Služba</th>
                  <th className="py-1.5 text-right font-medium">Váš podíl</th>
                </tr>
              </thead>
              <tbody>
                {vysledek.radky.map((x) => (
                  <tr key={x.sluzbaId} className="border-b border-line/60 align-top">
                    <td className="py-2">
                      <div className="font-medium">{x.nazev}</div>
                      <div className="text-xs text-ink-muted">{x.dodavatel}</div>
                      {x.zdroje.map((z) => (
                        <div key={z.id} className="text-xs text-ink-secondary tabular-nums">
                          {obdobi(z.od, z.do)}
                          {z.spotreba != null && z.jednotka ? ` · ${z.spotreba} ${z.jednotka}` : ""} · {czk(z.podil)}
                        </div>
                      ))}
                      {x.zdroje.length === 0 && <div className="text-xs text-warn">bez vyúčtování</div>}
                    </td>
                    <td className="py-2 text-right font-medium tabular-nums">{czk(x.castka)}</td>
                  </tr>
                ))}
                {vysledek.radky.length === 0 && (
                  <tr><td colSpan={2} className="py-3 text-center text-xs text-ink-muted">
                    Žádná služba není označená jako přeúčtovaná nájemci.
                  </td></tr>
                )}
              </tbody>
              <tfoot className="text-sm">
                <tr><td className="pt-3">Náklady na služby celkem</td><td className="pt-3 text-right font-medium tabular-nums">{czk(vysledek.naklady)}</td></tr>
                <tr><td className="py-1">Zaplacené zálohy</td><td className="py-1 text-right font-medium tabular-nums">{czk(vysledek.zalohy)}</td></tr>
                <tr className="border-t border-line text-base font-bold">
                  <td className="pt-2">{vysledek.rozdil >= 0 ? "Přeplatek k vrácení nájemci" : "Nedoplatek k úhradě"}</td>
                  <td className={`pt-2 text-right tabular-nums ${vysledek.rozdil >= 0 ? "text-good" : "text-bad"}`}>
                    {czk(Math.abs(vysledek.rozdil))}
                  </td>
                </tr>
              </tfoot>
            </table>
            {najem.tenantAccount && vysledek.rozdil > 0 && (
              <p className="mt-3 text-sm">Přeplatek bude zaslán na účet <strong>{najem.tenantAccount}</strong>.</p>
            )}
            {vysledek.rozdil > 0 && !najem.tenantAccount && (
              <p className="mt-3 text-xs text-warn print:hidden">Nájemce nemá vyplněné číslo účtu pro vratku (doplníš ve smlouvě).</p>
            )}
            <p className="mt-3 text-[11px] text-ink-muted">
              Zálohy jsou počítané podle smlouvy a jejích změn za dny, kdy nájem trval.
            </p>
          </div>

          <div className="mt-3 flex justify-end print:hidden">
            <button type="button" className="btn btn-primary"
              onClick={() => {
                const html = document.documentElement;
                html.classList.add("tisk-vyuctovani");
                window.addEventListener("afterprint", () => html.classList.remove("tisk-vyuctovani"), { once: true });
                window.print();
              }}>
              Vytisknout / uložit PDF
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
