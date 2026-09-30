"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { deleteService, saveService, type EntityFormState } from "@/lib/entityActions";
import {
  Hlaska, Pole, Rozbalovaci, SmazatTlacitko, TextPole, UpravaPanel, UpravitTlacitko, Vyber, Zaskrtavatko, isoDatum,
} from "./form";
import { SERVICE_TYPES } from "@/lib/categories";
import { czk, dateCz } from "@/lib/format";
import { Ikona, IKONA_SLUZBY } from "./Ikony";
import { ZalohyUpozorneni } from "./ZalohyUpozorneni";
import { VYCHOZI_PRECTENE, type PorovnaniZaloh } from "@/lib/zalohy";
import { Badge } from "./Stat";

interface Row {
  id: string; type: string; provider: string; contractNo: string | null; monthlyCost: number;
  annualCost: number | null; contractEnd: Date | null; noticePeriodMonths: number; isBundleable: boolean;
  notes: string | null; chargedToTenant: boolean;
}

export function ServiceManager({ propertyId, services, canEdit, porovnani }: {
  propertyId: string; services: Row[]; canEdit: boolean;
  /** Zalohy najemce proti nakladum na preuctovane sluzby (pocita server). */
  porovnani: PorovnaniZaloh | null;
}) {
  const [addState, addAction, adding] = useActionState<EntityFormState, FormData>(saveService.bind(null, null), {});
  const [delState, delAction] = useActionState<EntityFormState, FormData>(deleteService, {});

  // Upravovany zaznam; stejny formular slouzi k zalozeni i k uprave
  const [upravaId, setUpravaId] = useState<string | null>(null);
  const [upravaState, upravaAction, upravuji] = useActionState<EntityFormState, FormData>(
    saveService.bind(null, upravaId), {});
  useEffect(() => { if (upravaState.success) setUpravaId(null); }, [upravaState.success]);

  const upravovana = services.find((s) => s.id === upravaId) ?? null;
  const celkem = services.reduce((a, s) => a + s.monthlyCost + (s.annualCost ?? 0) / 12, 0);

  return (
    <div>
      <Hlaska state={
        upravaState.error ? upravaState
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
              {services.map((s) => (
                <tr key={s.id} className={upravaId === s.id ? "!bg-accent-soft/60" : undefined}>
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
                  <td className="num font-semibold">{czk(s.monthlyCost + (s.annualCost ?? 0) / 12)}</td>
                  <td className="hidden sm:table-cell"><KonecVazby datum={s.contractEnd} /></td>
                  {canEdit && (
                    <td>
                      <div className="flex items-center justify-end gap-0.5">
                        <UpravitTlacitko aktivni={upravaId === s.id}
                          onClick={() => setUpravaId(upravaId === s.id ? null : s.id)} />
                        <SmazatTlacitko action={delAction} id={s.id}
                          potvrzeni={`Opravdu smazat ${SERVICE_TYPES[s.type] ?? s.type} od ${s.provider}?`} />
                      </div>
                    </td>
                  )}
                </tr>
              ))}
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

      {canEdit && upravovana && (
        <UpravaPanel nadpis={`Upravit ${SERVICE_TYPES[upravovana.type] ?? upravovana.type}`}
          onZavrit={() => setUpravaId(null)}>
          <Formular key={upravovana.id} propertyId={propertyId} r={upravovana}
            action={upravaAction} pending={upravuji} popisekTlacitka="Uložit změny" />
        </UpravaPanel>
      )}

      {canEdit && !upravovana && (
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

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="propertyId" value={propertyId} />
      <Vyber label="Druh služby" name="type" defaultValue={r?.type ?? "ELECTRICITY"}
        options={Object.entries(SERVICE_TYPES) as [string, string][]}
        onChange={(druh) => { if (!r && !rucne.current) setPrect(VYCHOZI_PRECTENE.has(druh)); }} />
      <Pole label="Dodavatel" name="provider" required placeholder="např. ČEZ Prodej" defaultValue={r?.provider} />
      <Pole label="Měsíční náklad (Kč)" name="monthlyCost" type="number" defaultValue={r?.monthlyCost ?? 0} />
      <Pole label="Roční náklad (Kč)" name="annualCost" type="number" defaultValue={r?.annualCost ?? ""}
        hint="Když se platí jednou ročně — rozpočte se na měsíce" />
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
