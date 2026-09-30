"use client";

import { useActionState, useEffect, useState } from "react";
import { deleteLease, saveLease, smazZmenuZaloh, type EntityFormState } from "@/lib/entityActions";
import {
  Hlaska, Pole, Rozbalovaci, Sekce, SmazatTlacitko, UpravaPanel, UpravitTlacitko, Zaskrtavatko, isoDatum,
} from "./form";
import { Badge } from "./Stat";
import { Ikona } from "./Ikony";
import { zkontrolujUcet } from "@/lib/ucet";
import { UliceNaseptavac } from "./AdresaNaseptavac";
import { DatumPole } from "./DatumPole";
import { EvidencniList, type Pronajimatel } from "./EvidencniList";
import { HistorieZmen } from "./HistorieZmen";
import { ZalohyUpozorneni } from "./ZalohyUpozorneni";
import { SERVICE_TYPES } from "@/lib/categories";
import {
  popisPorovnani, porovnejZalohy, sluzbaKDatu, type PorovnaniZaloh, type SluzbaVstup,
} from "@/lib/zalohy";
import { czk, dateCz } from "@/lib/format";

interface Row {
  id: string; tenantName: string; tenantEmail: string | null; tenantPhone: string | null;
  tenantStreet: string | null; tenantCity: string | null; tenantZip: string | null;
  tenantAccount: string | null;
  tenantId: string | null;
  startDate: Date; endDate: Date | null; rentMonthly: number; utilitiesMonthly: number;
  deposit: number; indexationClause: boolean; paymentDay: number; isActive: boolean;
}

export interface ZmenaZalohRadek { id: string; validFrom: Date | string; amount: number }

const dnesISO = () => new Date().toISOString().slice(0, 10);

/** ISO datum o den dal — nova smlouva zacina den po konci stare. */
function denPo(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function LeaseManager({ propertyId, leases, canEdit, services, porovnani, historie, nemovitost, pronajimatele }: {
  /** Udaje do evidencniho listu. */
  nemovitost: { nazev: string; adresa: string };
  pronajimatele: Pronajimatel[];
  propertyId: string; leases: Row[]; canEdit: boolean;
  /** Sluzby nemovitosti — zalohy se ve formulari overuji proti nim. */
  services: SluzbaVstup[];
  porovnani: PorovnaniZaloh | null;
  /** Zmeny zaloh podle smlouvy (klic je id smlouvy). */
  historie: Record<string, ZmenaZalohRadek[]>;
}) {
  const [addState, addAction, adding] = useActionState<EntityFormState, FormData>(saveLease.bind(null, null), {});
  const [delState, delAction] = useActionState<EntityFormState, FormData>(deleteLease, {});

  const [upravaId, setUpravaId] = useState<string | null>(null);
  const [upravaState, upravaAction, upravuji] = useActionState<EntityFormState, FormData>(
    saveLease.bind(null, upravaId), {});
  useEffect(() => { if (upravaState.success) setUpravaId(null); }, [upravaState.success]);

  // Nova smlouva ze stare: nejdriv se zeptame na konec stare (konec === null), pak otevreme formular
  const [kopie, setKopie] = useState<{ id: string; konec: string | null } | null>(null);
  const [konecVstup, setKonecVstup] = useState<string | null>(null);
  useEffect(() => { if (addState.success) setKopie(null); }, [addState.success]);
  const kopirovana = kopie ? leases.find((l) => l.id === kopie.id) ?? null : null;

  // Evidencni list (rozpis najmu) ke smlouve
  const [listId, setListId] = useState<string | null>(null);
  const listSmlouva = leases.find((l) => l.id === listId) ?? null;

  const upravovana = leases.find((l) => l.id === upravaId) ?? null;
  // Platna smlouva je videt hned, historicke jsou sbalene pod ni
  const serazene = [...leases].sort((a, b) => Number(b.isActive) - Number(a.isActive)
    || b.startDate.getTime() - a.startDate.getTime());
  const platne = serazene.filter((l) => l.isActive);
  const historicke = serazene.filter((l) => !l.isActive);
  const [historieOtevrena, setHistorieOtevrena] = useState(false);
  // Upravovana nebo kopirovana smlouva nesmi zustat schovana
  const skrytaVyber = historicke.some((l) => l.id === upravaId || l.id === kopie?.id || l.id === listId);

  const karta = (l: Row) => {
            const adresa = [l.tenantStreet, [l.tenantZip, l.tenantCity].filter(Boolean).join(" ")].filter(Boolean).join(", ");
            return (
              <div key={l.id} className={`rounded-xl border p-3.5 ${
                upravaId === l.id ? "border-accent/40 bg-accent/5" : l.isActive ? "border-good/40 bg-good/5" : "border-line"
              }`}>
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-medium">{l.tenantName}</span>
                    <span className="ml-2"><Badge tone={l.isActive ? "good" : "neutral"}>{l.isActive ? "platná" : "ukončená"}</Badge></span>
                    {(l.tenantEmail || l.tenantPhone) && (
                      <div className="text-xs text-ink-muted">{[l.tenantEmail, l.tenantPhone].filter(Boolean).join(" · ")}</div>
                    )}
                    {adresa && <div className="text-xs text-ink-muted">{adresa}</div>}
                    {canEdit && l.tenantAccount && <div className="text-xs text-ink-muted">účet {l.tenantAccount}</div>}
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    {/* Prace se systemem: doklady a navazujici smlouva */}
                    <button type="button" title="Rozpis záloh (evidenční list)" aria-label="Rozpis záloh (evidenční list)"
                      aria-pressed={listId === l.id}
                      onClick={() => { setUpravaId(null); setKopie(null); setListId(listId === l.id ? null : l.id); }}
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                        listId === l.id ? "bg-accent-soft text-accent" : "text-ink-muted hover:bg-accent-soft hover:text-accent"}`}>
                      <Ikona nazev="dokument" />
                    </button>
                    {canEdit && (
                      <>
                        <button type="button" title="Nová smlouva z této" aria-label="Nová smlouva z této"
                          onClick={() => {
                            setUpravaId(null); setListId(null);
                            if (kopie?.id === l.id) { setKopie(null); return; }
                            const navrh = l.endDate ? l.endDate.toISOString().slice(0, 10) : dnesISO();
                            setKonecVstup(navrh);
                            setKopie({ id: l.id, konec: null });
                          }}
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                            kopie?.id === l.id ? "bg-accent-soft text-accent" : "text-ink-muted hover:bg-accent-soft hover:text-accent"}`}>
                          <Ikona nazev="kopie" />
                        </button>
                        {/* Uprava zaznamu: oddelena od praci se systemem */}
                        <span className="mx-1.5 h-5 w-px bg-line" aria-hidden />
                        <UpravitTlacitko aktivni={upravaId === l.id}
                          onClick={() => { setListId(null); setUpravaId(upravaId === l.id ? null : l.id); }} />
                        <SmazatTlacitko action={delAction} id={l.id}
                          potvrzeni={`Opravdu smazat smlouvu s ${l.tenantName}?`} />
                      </>
                    )}
                  </div>
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
            );
          };

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
          {platne.map((l) => karta(l))}
          {platne.length === 0 && (
            <p className="rounded-xl border border-dashed border-line px-3 py-3 text-center text-sm text-ink-muted">
              Žádná platná smlouva.
            </p>
          )}
          {historicke.length > 0 && (
            <div>
              <button type="button" onClick={() => setHistorieOtevrena((o) => !o)}
                aria-expanded={historieOtevrena || skrytaVyber}
                className="flex w-full items-center justify-between rounded-xl border border-line px-3.5 py-2.5 text-sm font-medium hover:bg-surface-sunken">
                <span>Historické smlouvy ({historicke.length})</span>
                <svg viewBox="0 0 20 20" className={`h-4 w-4 text-ink-muted transition-transform ${historieOtevrena || skrytaVyber ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 8l5 5 5-5" /></svg>
              </button>
              {(historieOtevrena || skrytaVyber) && (
                <div className="mt-3 space-y-3">{historicke.map((l) => karta(l))}</div>
              )}
            </div>
          )}
        </div>
      )}

      {listSmlouva && (
        <UpravaPanel nadpis={`Rozpis záloh: ${listSmlouva.tenantName}`} onZavrit={() => setListId(null)}>
          <EvidencniList key={listSmlouva.id} v={{
            nemovitost,
            najemce: {
              name: listSmlouva.tenantName,
              adresa: [listSmlouva.tenantStreet, [listSmlouva.tenantZip, listSmlouva.tenantCity].filter(Boolean).join(" ")].filter(Boolean).join(", "),
              email: listSmlouva.tenantEmail, phone: listSmlouva.tenantPhone,
            },
            pronajimatele,
            najemne: listSmlouva.rentMonthly,
            zalohyAktualni: listSmlouva.utilitiesMonthly,
            zalohyHistorie: historie[listSmlouva.id] ?? [],
            odKdy: listSmlouva.startDate.toISOString().slice(0, 10),
            doKdy: listSmlouva.endDate ? listSmlouva.endDate.toISOString().slice(0, 10) : null,
            platebniDen: listSmlouva.paymentDay,
            kauce: listSmlouva.deposit,
            prectene: services.filter((s) => s.chargedToTenant),
          }} />
        </UpravaPanel>
      )}

      {canEdit && upravovana && (
        <UpravaPanel nadpis={`Upravit smlouvu s ${upravovana.tenantName}`} onZavrit={() => setUpravaId(null)}>
          <Formular key={upravovana.id} propertyId={propertyId} r={upravovana} services={services}
            action={upravaAction} pending={upravuji} popisekTlacitka="Uložit změny" />
          <HistorieZmen
            nadpis="Historie záloh"
            radky={(historie[upravovana.id] ?? []).map((z) => ({
              id: z.id, validFrom: z.validFrom, hodnota: `${czk(z.amount)}/měs.`,
            }))}
            action={smazZmenuZaloh}
            potvrzeni="Smazat tuto změnu záloh? Zálohy se vrátí na hodnotu platnou před ní."
          />
        </UpravaPanel>
      )}

      {canEdit && kopirovana && kopie && (
        <UpravaPanel nadpis={`Nová smlouva ze smlouvy s ${kopirovana.tenantName}`} onZavrit={() => setKopie(null)}>
          {kopie.konec === null ? (
            <div className="space-y-4">
              <DatumPole key={kopirovana.id} label="Stará smlouva končí dne" name="konecStare" required
                min={kopirovana.startDate.toISOString().slice(0, 10)}
                defaultValue={konecVstup ?? ""} onChange={setKonecVstup}
                hint={konecVstup ? `Nová smlouva začne ${dateCz(new Date(`${denPo(konecVstup)}T00:00:00Z`))}.` : "Zadej platné datum."} />
              <button type="button" className="btn btn-primary" disabled={!konecVstup}
                onClick={() => konecVstup && setKopie({ id: kopirovana.id, konec: konecVstup })}>
                Pokračovat
              </button>
            </div>
          ) : (
            <>
              <p className="mb-3 rounded-lg bg-surface-sunken px-3 py-2 text-sm text-ink-secondary">
                Stará smlouva skončí <strong>{dateCz(new Date(`${kopie.konec}T00:00:00Z`))}</strong>, nová začne{" "}
                <strong>{dateCz(new Date(`${denPo(kopie.konec)}T00:00:00Z`))}</strong>. Všechny údaje jsou předvyplněné, uprav jen,
                co se mění.
              </p>
              <Formular key={`${kopie.id}-${kopie.konec}`} propertyId={propertyId} services={services}
                r={{ ...kopirovana, startDate: new Date(`${denPo(kopie.konec)}T00:00:00Z`), endDate: null, isActive: true }}
                kopie={{ predchoziId: kopie.id, predchoziKonec: kopie.konec }}
                action={addAction} pending={adding} popisekTlacitka="Ukončit starou a uložit novou" />
            </>
          )}
        </UpravaPanel>
      )}

      {canEdit && !upravovana && !kopie && (
        <Rozbalovaci popisek="Přidat nájemní smlouvu" zavritPo={addState.success}>
          <Formular propertyId={propertyId} r={null} services={services} action={addAction} pending={adding}
            popisekTlacitka="Uložit smlouvu" />
        </Rozbalovaci>
      )}
    </div>
  );
}

function Formular({ propertyId, r, services, action, pending, popisekTlacitka, kopie }: {
  propertyId: string; r: Row | null; kopie?: { predchoziId: string; predchoziKonec: string }; services: SluzbaVstup[];
  action: (payload: FormData) => void; pending: boolean; popisekTlacitka: string;
}) {
  // Sluzby s cenou platnou dnes; drivejsi ceny do dnesniho srovnani nepatri
  const sluzbyDnes = services.map((s) => sluzbaKDatu(s, new Date()));

  // Nova smlouva dostane zalohy predvyplnene podle sluzeb, ktere se preuctovavaji;
  // upravovana si nechava ty, ktere ma — prepsat je potichu by zmenilo smlouvu.
  const doporuceno = Math.round(porovnejZalohy(0, sluzbyDnes)?.naklady ?? 0);
  const [zalohy, setZalohy] = useState(String(r ? r.utilitiesMonthly : doporuceno));
  const cislo = Number(zalohy.replace(/\s/g, "").replace(",", ".")) || 0;
  const zive = porovnejZalohy(cislo, sluzbyDnes);
  const popis = zive ? popisPorovnani(zive) : null;

  const [ucet, setUcet] = useState(r?.tenantAccount ?? "");
  const ucetKontrola = zkontrolujUcet(ucet);
  const ucetChyba = ucetKontrola.ok ? null : ucetKontrola.chyba;

  const [adresa, setAdresa] = useState({
    ulice: r?.tenantStreet ?? "", obec: r?.tenantCity ?? "", psc: r?.tenantZip ?? "",
  });

  // Zmena zaloh u existujici smlouvy potrebuje datum, od ktereho plati
  const zmenaZaloh = r != null && !kopie && cislo !== r.utilitiesMonthly;

  return (
    <form action={action} className="grid gap-x-3 gap-y-5 sm:grid-cols-2">
      <input type="hidden" name="propertyId" value={propertyId} />
      <input type="hidden" name="tenantId" value={r?.tenantId ?? ""} />
      {kopie && <input type="hidden" name="predchoziId" value={kopie.predchoziId} />}
      {kopie && <input type="hidden" name="predchoziKonec" value={kopie.predchoziKonec} />}

      <Sekce nadpis="Nájemce" popis="Kontakt a adresa do smlouvy a k vyúčtování služeb.">
        <Pole label="Jméno nájemce" name="tenantName" required defaultValue={r?.tenantName} sirka="sm:col-span-2" />
        <Pole label="E-mail" name="tenantEmail" type="email" placeholder="nepovinné" defaultValue={r?.tenantEmail ?? ""} />
        <Pole label="Telefon" name="tenantPhone" placeholder="nepovinné" defaultValue={r?.tenantPhone ?? ""} />
        <UliceNaseptavac name="tenantStreet" value={adresa.ulice} className="sm:col-span-2"
          placeholder="nepovinné" hint="Trvalé bydliště nebo adresa pro doručování"
          onChange={(t) => setAdresa((a) => ({ ...a, ulice: t }))}
          onVybrano={(n) => setAdresa({ ulice: n.ulice, obec: n.mesto || adresa.obec, psc: n.psc || adresa.psc })} />
        <Pole label="Obec" name="tenantCity" placeholder="nepovinné" value={adresa.obec}
          onChange={(e) => setAdresa((a) => ({ ...a, obec: e.target.value }))} />
        <Pole label="PSČ" name="tenantZip" placeholder="nepovinné" value={adresa.psc}
          onChange={(e) => setAdresa((a) => ({ ...a, psc: e.target.value }))} />
        <div className="sm:col-span-2">
          <label className="label mb-1.5 block" htmlFor="tenantAccount">Číslo účtu pro vratku</label>
          <input id="tenantAccount" name="tenantAccount" className={`input ${ucetChyba ? "border-bad" : ""}`}
            placeholder="nepovinné, např. 19-2000145399/0800 nebo IBAN" inputMode="text" autoComplete="off"
            value={ucet} onChange={(e) => setUcet(e.target.value)} aria-invalid={!!ucetChyba} />
          {ucetChyba
            ? <p className="mt-1 text-xs text-bad">{ucetChyba}</p>
            : <p className="mt-1 text-xs text-ink-muted">
              {ucetKontrola.ok && ucetKontrola.hodnota ? "Číslo účtu je v pořádku. " : ""}
              Sem se pošle přeplatek z vyúčtování služeb; objeví se ve vyúčtování pro nájemce.
            </p>}
        </div>
      </Sekce>

      <Sekce nadpis="Nájem a poplatky" popis="Doba nájmu, nájemné a zálohy na služby.">
        <Pole label="Nájem od" name="startDate" type="date" required defaultValue={isoDatum(r?.startDate)} />
        <Pole label="Nájem do" name="endDate" type="date" defaultValue={isoDatum(r?.endDate)}
          hint="Prázdné = na dobu neurčitou" />
        <Pole label="Čisté nájemné (Kč/měs.)" name="rentMonthly" type="number" required defaultValue={r?.rentMonthly}
          hint="Bez záloh na služby — jen tohle se daní" />
        <Pole label="Den splatnosti" name="paymentDay" type="number" min={1} max={28} defaultValue={r?.paymentDay ?? 15} />
        <Pole label="Kauce (Kč)" name="deposit" type="number" defaultValue={r?.deposit ?? 0} />
        <Pole label="Zálohy na služby (Kč/měs.)" name="utilitiesMonthly" type="number"
          value={zalohy} onChange={(e) => setZalohy(e.target.value)}
          hint={!r && doporuceno > 0 ? "Předvyplněno podle služeb, které se přeúčtovávají" : "Průchozí položka, nedaní se"} />

        {/* Zmena zaloh se zapisuje s datem: jinak by se prepsala minulost */}
        {zmenaZaloh && (
          <Pole label="Nové zálohy platí od" name="advanceValidFrom" type="date" required
            defaultValue={dnesISO()} sirka="sm:col-span-2"
            hint="Předchozí výše zůstane v historii, takže půjde zjistit, co nájemce platil dřív." />
        )}

        {/* Zive srovnani se sluzbami: nesoulad je videt drive, nez se smlouva ulozi */}
        <div className="sm:col-span-2">
          {popis ? (
            <div className={`rounded-xl px-4 py-3 text-sm ${popis.tone === "good" ? "bg-good/10" : "bg-warn/15"}`} role="status">
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

        <div className="space-y-2 sm:col-span-2">
          <Zaskrtavatko name="indexationClause" label="Inflační doložka ve smlouvě"
            defaultChecked={r?.indexationClause} />
          <Zaskrtavatko name="isActive" label="Toto je platná smlouva" defaultChecked={r ? r.isActive : true}
            hint="Dosavadní platná smlouva se tím ukončí" />
        </div>
      </Sekce>

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
