"use client";

import { useActionState, useEffect, useState } from "react";
import { deleteService, saveService, type EntityFormState } from "@/lib/entityActions";
import {
  Hlaska, Pole, Rozbalovaci, SmazatTlacitko, UpravaPanel, UpravitTlacitko, Vyber, Zaskrtavatko, isoDatum,
} from "./form";
import { SERVICE_TYPES } from "@/lib/categories";
import { czk, dateCz } from "@/lib/format";

interface Row {
  id: string; type: string; provider: string; contractNo: string | null; monthlyCost: number;
  annualCost: number | null; contractEnd: Date | null; noticePeriodMonths: number; isBundleable: boolean;
}

export function ServiceManager({ propertyId, services, canEdit }: {
  propertyId: string; services: Row[]; canEdit: boolean;
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

      {services.length === 0 ? (
        <p className="py-3 text-center text-sm text-ink-muted">Žádné evidované služby.</p>
      ) : (
        <table className="table-base">
          <thead>
            <tr><th>Služba</th><th>Dodavatel</th><th className="num">Měsíčně</th><th>Vázán do</th>{canEdit && <th />}</tr>
          </thead>
          <tbody>
            {services.map((s) => (
              <tr key={s.id} className={upravaId === s.id ? "bg-accent/5" : undefined}>
                <td>
                  {SERVICE_TYPES[s.type] ?? s.type}
                  {!s.isBundleable && <span className="ml-1.5 text-xs text-ink-muted">(mimo balík)</span>}
                </td>
                <td className="text-ink-secondary">{s.provider}</td>
                <td className="num">{czk(s.monthlyCost + (s.annualCost ?? 0) / 12)}</td>
                <td className="text-ink-secondary">{s.contractEnd ? dateCz(s.contractEnd) : "volné"}</td>
                {canEdit && (
                  <td>
                    <div className="flex items-center justify-end gap-3">
                      <UpravitTlacitko aktivni={upravaId === s.id}
                        onClick={() => setUpravaId(upravaId === s.id ? null : s.id)} />
                      <SmazatTlacitko action={delAction} id={s.id}
                        potvrzeni={`Opravdu smazat ${SERVICE_TYPES[s.type] ?? s.type} od ${s.provider}?`} />
                    </div>
                  </td>
                )}
              </tr>
            ))}
            <tr>
              <td colSpan={2} className="font-medium">Celkem</td>
              <td className="num font-medium">{czk(celkem)}</td>
              <td colSpan={canEdit ? 2 : 1} />
            </tr>
          </tbody>
        </table>
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
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="propertyId" value={propertyId} />
      <Vyber label="Druh služby" name="type" defaultValue={r?.type ?? "ELECTRICITY"}
        options={Object.entries(SERVICE_TYPES) as [string, string][]} />
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
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Ukládám…" : popisekTlacitka}
        </button>
      </div>
    </form>
  );
}
