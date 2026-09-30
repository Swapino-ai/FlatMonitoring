"use client";

import { Fragment, useActionState, useEffect, useRef, useState } from "react";
import { deleteService, novyPoplatek, saveService, smazZmenuNakladu, type EntityFormState } from "@/lib/entityActions";
import {
  Hlaska, Pole, Rozbalovaci, SmazatTlacitko, TextPole, UpravaPanel, UpravitTlacitko, Vyber, Zaskrtavatko, isoDatum,
} from "./form";
import { SERVICE_TYPES } from "@/lib/categories";
import { czk, dateCz } from "@/lib/format";
import { Ikona, IKONA_SLUZBY } from "./Ikony";
import { DatumPole } from "./DatumPole";
import { ZalohyUpozorneni } from "./ZalohyUpozorneni";
import { VYCHOZI_PRECTENE, type PorovnaniZaloh } from "@/lib/zalohy";
import { Badge } from "./Stat";

interface Row {
  id: string; type: string; provider: string; contractNo: string | null; monthlyCost: number;
  annualCost: number | null; contractEnd: Date | null; noticePeriodMonths: number; isBundleable: boolean;
  notes: string | null; chargedToTenant: boolean;
}

export interface ZmenaNakladuRadek { id: string; validFrom: Date | string; monthlyCost: number; annualCost: number | null }

const dnesISO = () => new Date().toISOString().slice(0, 10);

export function ServiceManager({ propertyId, services, canEdit, porovnani, historie }: {
  propertyId: string; services: Row[]; canEdit: boolean;
  /** Zalohy najemce proti nakladum na preuctovane sluzby (pocita server). */
  porovnani: PorovnaniZaloh | null;
  /** Zmeny nakladu podle sluzby (klic je id sluzby). */
  historie: Record<string, ZmenaNakladuRadek[]>;
}) {
  const [addState, addAction, adding] = useActionState<EntityFormState, FormData>(saveService.bind(null, null), {});
  const [delState, delAction] = useActionState<EntityFormState, FormData>(deleteService, {});

  // Upravovany zaznam; stejny formular slouzi k zalozeni i k uprave
  const [upravaId, setUpravaId] = useState<string | null>(null);
  const [upravaState, upravaAction, upravuji] = useActionState<EntityFormState, FormData>(
    saveService.bind(null, upravaId), {});
  useEffect(() => { if (upravaState.success) setUpravaId(null); }, [upravaState.success]);

  // Novy poplatek: samostatna akce, aby hlavni radek drzel vzdy nejnovejsi vysi
  const [poplatekId, setPoplatekId] = useState<string | null>(null);
  const [poplatekState, poplatekAction, ukladamPoplatek] = useActionState<EntityFormState, FormData>(novyPoplatek, {});
  useEffect(() => { if (poplatekState.success) setPoplatekId(null); }, [poplatekState.success]);
  const [smazState, smazAction] = useActionState<EntityFormState, FormData>(smazZmenuNakladu, {});
  const [rozbaleno, setRozbaleno] = useState<Set<string>>(new Set());
  const prepniHistorii = (id: string) => setRozbaleno((r) => { const n = new Set(r); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const poplatkova = services.find((s) => s.id === poplatekId) ?? null;

  const upravovana = services.find((s) => s.id === upravaId) ?? null;
  const celkem = services.reduce((a, s) => a + s.monthlyCost + (s.annualCost ?? 0) / 12, 0);

  return (
    <div>
      <Hlaska state={
        poplatekState.error || poplatekState.success || poplatekState.warning ? poplatekState
          : smazState.error || smazState.success ? smazState
          : upravaState.error ? upravaState
          : addState.error || addState.success ? addState
          : delState.error || delState.success ? delState
          : upravaState
      } />

      <ZalohyUpozorneni porovnani={porovnani} />

      {services.length === 0 ? (
        <p className="py-3 text-center text-sm text-ink-muted">Žádné evidované služby.</p>
      ) : (
        <div className="table-scroll">
          <table className="table-base">
            <thead>
              <tr>
                <th>Služba</th>
                <th className="hidden sm:table-cell">Dodavatel</th>
                <th className="num">Měsíčně</th>
                <th className="hidden sm:table-cell">Vázán do</th>
                {canEdit && <th className="w-[5.5rem]"><span className="sr-only">Akce</span></th>}
              </tr>
            </thead>
            <tbody>
              {services.map((s) => {
                const zmeny = [...(historie[s.id] ?? [])]
                  .sort((a, b) => new Date(b.validFrom).getTime() - new Date(a.validFrom).getTime());
                const aktualni = zmeny[0];
                const drivejsi = zmeny.slice(1);
                const otevrena = rozbaleno.has(s.id);
                return (
                <Fragment key={s.id}>
                <tr className={upravaId === s.id || poplatekId === s.id ? "!bg-accent-soft/60" : undefined}>
                  <td>
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                        <Ikona nazev={IKONA_SLUZBY[s.type] ?? "tri"} />
                      </span>
                      <div className="min-w-0">
                        <div className="font-medium leading-tight">{SERVICE_TYPES[s.type] ?? s.type}</div>
                        {s.chargedToTenant && (
                          <div className="mt-0.5 flex items-center gap-1 text-xs font-medium text-accent">
                            <Ikona nazev="najemce" trida="h-3.5 w-3.5" />hradí nájemce zálohou
                          </div>
                        )}
                        {!s.isBundleable && <div className="mt-0.5 text-xs text-ink-muted">mimo hromadnou poptávku</div>}
                        {/* Na telefonu neni misto na sloupec Dodavatel ani Vazan do:
                            jinak by akce spadly mimo obrazovku a sly by najit jen posunem. */}
                        <div className="mt-1 sm:hidden">
                          <div className="text-sm text-ink-secondary">{s.provider}</div>
                          {s.notes && <div className="line-clamp-2 text-xs text-ink-muted">{s.notes}</div>}
                          <div className="mt-1"><KonecVazby datum={s.contractEnd} /></div>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="hidden max-w-[26rem] align-middle sm:table-cell">
                    <div className="font-medium leading-tight">{s.provider}</div>
                    {s.notes && (
                      <div className="mt-0.5 line-clamp-2 text-xs text-ink-muted" title={s.notes}>{s.notes}</div>
                    )}
                  </td>
                  <td className="num">
                    <div className="font-semibold">{czk(s.monthlyCost + (s.annualCost ?? 0) / 12)}</div>
                    {aktualni && (
                      <div className="text-xs font-normal text-ink-muted">od {dateCz(new Date(aktualni.validFrom))}</div>
                    )}
                    {drivejsi.length > 0 && (
                      <button type="button" onClick={() => prepniHistorii(s.id)} aria-expanded={otevrena}
                        className="mt-0.5 inline-flex items-center gap-1 text-xs font-normal text-accent hover:underline">
                        dříve ({drivejsi.length})
                        <svg viewBox="0 0 20 20" className={`h-3 w-3 transition-transform ${otevrena ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 8l5 5 5-5" /></svg>
                      </button>
                    )}
                  </td>
                  <td className="hidden sm:table-cell"><KonecVazby datum={s.contractEnd} /></td>
                  {canEdit && (
                    <td>
                      <div className="flex items-center justify-end gap-0.5">
                        <button type="button" title="Nový poplatek od data" aria-label="Nový poplatek od data"
                          aria-pressed={poplatekId === s.id}
                          onClick={() => { setUpravaId(null); setPoplatekId(poplatekId === s.id ? null : s.id); }}
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                            poplatekId === s.id ? "bg-accent-soft text-accent" : "text-ink-muted hover:bg-accent-soft hover:text-accent"}`}>
                          <Ikona nazev="trend" />
                        </button>
                        <UpravitTlacitko aktivni={upravaId === s.id}
                          onClick={() => { setPoplatekId(null); setUpravaId(upravaId === s.id ? null : s.id); }} />
                        <SmazatTlacitko action={delAction} id={s.id}
                          potvrzeni={`Opravdu smazat ${SERVICE_TYPES[s.type] ?? s.type} od ${s.provider}?`} />
                      </div>
                    </td>
                  )}
                </tr>
                {otevrena && drivejsi.length > 0 && (
                  <tr className="bg-surface-sunken/50">
                    <td colSpan={canEdit ? 5 : 4} className="!py-2">
                      <ul className="ml-12 space-y-0.5 text-xs text-ink-secondary">
                        {drivejsi.map((z, i) => {
                          // Vyse platila do dne pred nastupem nasledujici zmeny
                          const nasledujici = zmeny[i];
                          const do_ = new Date(new Date(nasledujici.validFrom).getTime() - 24 * 3600 * 1000);
                          const odText = i === drivejsi.length - 1 ? "od začátku" : `od ${dateCz(new Date(z.validFrom))}`;
                          return (
                            <li key={z.id} className="flex items-center gap-3">
                              <span className="tabular-nums">{odText} do {dateCz(do_)}</span>
                              <span className="ml-auto font-medium tabular-nums">{czk(z.monthlyCost + (z.annualCost ?? 0) / 12)}/měs.</span>
                              {canEdit && (
                                <SmazatTlacitko action={smazAction} id={z.id} popisek="Smazat záznam"
                                  potvrzeni="Smazat tuto změnu nákladu? Náklad se vrátí na hodnotu platnou před ní." />
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </td>
                  </tr>
                )}
                </Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-surface-sunken/60">
                <td className="rounded-bl-xl px-3 py-3 font-semibold">Celkem měsíčně</td>
                <td className="hidden sm:table-cell" />
                <td className="num px-3 py-3 text-base font-bold">{czk(celkem)}</td>
                <td className="hidden sm:table-cell" />
                {canEdit && <td className="rounded-br-xl" />}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {canEdit && poplatkova && (
        <UpravaPanel nadpis={`Nový poplatek: ${SERVICE_TYPES[poplatkova.type] ?? poplatkova.type} · ${poplatkova.provider}`}
          onZavrit={() => setPoplatekId(null)}>
          <form action={poplatekAction} key={poplatkova.id} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="id" value={poplatkova.id} />
            <p className="text-sm text-ink-secondary sm:col-span-2">
              Dnes platí <strong>{czk(poplatkova.monthlyCost + (poplatkova.annualCost ?? 0) / 12)}/měs.</strong>{" "}
              Tato výše zůstane v historii pod řádkem a nový poplatek se stane platným.
            </p>
            <Pole label="Měsíční náklad (Kč)" name="monthlyCost" type="number" defaultValue={poplatkova.monthlyCost} />
            <Pole label="Roční náklad (Kč)" name="annualCost" type="number" defaultValue={poplatkova.annualCost ?? ""}
              hint="Když se platí jednou ročně — rozpočte se na měsíce" />
            <DatumPole label="Nový poplatek platí od" name="costValidFrom" required max={dnesISO()}
              defaultValue={dnesISO()} sirka="sm:col-span-2" />
            <div className="sm:col-span-2">
              <button type="submit" disabled={ukladamPoplatek} className="btn btn-primary">
                {ukladamPoplatek ? "Ukládám…" : "Uložit nový poplatek"}
              </button>
            </div>
          </form>
        </UpravaPanel>
      )}

      {canEdit && upravovana && (
        <UpravaPanel nadpis={`Upravit ${SERVICE_TYPES[upravovana.type] ?? upravovana.type}`}
          onZavrit={() => setUpravaId(null)}>
          <Formular key={upravovana.id} propertyId={propertyId} r={upravovana}
            action={upravaAction} pending={upravuji} popisekTlacitka="Uložit změny" />
        </UpravaPanel>
      )}

      {canEdit && !upravovana && !poplatkova && (
        <Rozbalovaci popisek="Přidat službu nebo dodavatele" zavritPo={addState.success}>
          <Formular propertyId={propertyId} r={null} action={addAction} pending={adding}
            popisekTlacitka="Uložit službu" />
        </Rozbalovaci>
      )}
    </div>
  );
}

function Formular({ propertyId, r, action, pending, popisekTlacitka }: {
  propertyId: string; r: Row | null;
  action: (payload: FormData) => void; pending: boolean; popisekTlacitka: string;
}) {
  // Predvyplneni podle druhu: voda, teplo a odpad se obvykle preuctovavaji.
  // Je to jen vychozi hodnota — jakmile ji clovek prepne, druh ji uz neprepise.
  const [prect, setPrect] = useState(r ? r.chargedToTenant : VYCHOZI_PRECTENE.has("ELECTRICITY"));
  const rucne = useRef(false);

  const [mesicne, setMesicne] = useState(String(r?.monthlyCost ?? 0));
  const [rocne, setRocne] = useState(r?.annualCost != null ? String(r.annualCost) : "");

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="propertyId" value={propertyId} />
      <Vyber label="Druh služby" name="type" defaultValue={r?.type ?? "ELECTRICITY"}
        options={Object.entries(SERVICE_TYPES) as [string, string][]}
        onChange={(druh) => { if (!r && !rucne.current) setPrect(VYCHOZI_PRECTENE.has(druh)); }} />
      <Pole label="Dodavatel" name="provider" required placeholder="např. ČEZ Prodej" defaultValue={r?.provider} />
      {r ? (
        // Naklad se u existujici sluzby meni ikonou "Nový poplatek": tak zustane historie
        <>
          <input type="hidden" name="monthlyCost" value={r.monthlyCost} />
          <input type="hidden" name="annualCost" value={r.annualCost ?? ""} />
          <p className="rounded-lg bg-surface-sunken px-3 py-2 text-xs text-ink-secondary sm:col-span-2">
            Výši poplatku měň ikonou <strong>Nový poplatek</strong> u řádku. Původní částka zůstane v historii.
          </p>
        </>
      ) : (
        <>
          <Pole label="Měsíční náklad (Kč)" name="monthlyCost" type="number"
            value={mesicne} onChange={(e) => setMesicne(e.target.value)} />
          <Pole label="Roční náklad (Kč)" name="annualCost" type="number"
            value={rocne} onChange={(e) => setRocne(e.target.value)}
            hint="Když se platí jednou ročně — rozpočte se na měsíce" />
        </>
      )}
      <Pole label="Číslo smlouvy" name="contractNo" placeholder="nepovinné" defaultValue={r?.contractNo ?? ""} />
      <Pole label="Smlouva vázána do" name="contractEnd" type="date" defaultValue={isoDatum(r?.contractEnd)}
        hint="Do kdy nelze přejít jinam" />
      <Pole label="Výpovědní lhůta (měsíců)" name="noticePeriodMonths" type="number"
        defaultValue={r?.noticePeriodMonths ?? 0} />
      <div className="flex items-end">
        <Zaskrtavatko name="isBundleable" label="Zahrnout do hromadné poptávky"
          defaultChecked={r ? r.isBundleable : true} hint="Vypni u SVJ a regulovaných plateb" />
      </div>
      <div className="sm:col-span-2">
        <Zaskrtavatko name="chargedToTenant" label="Přeúčtuje se nájemci, kryje ho záloha"
          checked={prect} onChange={(v) => { rucne.current = true; setPrect(v); }}
          hint="Součet takových služeb je to, co má nájemce měsíčně platit. Porovná se se zálohami ve smlouvě." />
      </div>
      <TextPole label="Poznámka" name="notes" sirka="sm:col-span-2" defaultValue={r?.notes ?? ""}
        placeholder="nepovinné" hint="Číslo odběrného místa, kontakt na technika, co bylo dohodnuto po telefonu" />
      <div className="sm:col-span-2">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Ukládám…" : popisekTlacitka}
        </button>
      </div>
    </form>
  );
}

/**
 * Dokdy je clovek vazan. Volna smlouva neni udalost, tak je jen tlumene;
 * blizici se konec je to, co chce clovek videt, aby stihl prejit jinam.
 */
function KonecVazby({ datum }: { datum: Date | null }) {
  if (!datum) return <span className="text-xs text-ink-muted">volné</span>;

  const konec = new Date(datum);
  const mesicu = Math.ceil((konec.getTime() - Date.now()) / (30.44 * 24 * 3600 * 1000));

  // Uz skoncila: fakticky volne, datum jen v title pro pripad, ze ho nekdo hleda
  if (mesicu <= 0) return <span className="text-xs text-ink-muted" title={`Vazba skončila ${dateCz(konec)}`}>volné</span>;

  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-sm">
      <span className="tabular-nums text-ink-secondary">{dateCz(konec)}</span>
      {mesicu <= 3 && <Badge tone="warn">za {mesicu} {mesicu === 1 ? "měsíc" : "měs."}</Badge>}
    </span>
  );
}
