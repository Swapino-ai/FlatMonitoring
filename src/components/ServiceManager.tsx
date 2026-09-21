"use client";

import { useActionState } from "react";
import { deleteService, saveService, type EntityFormState } from "@/lib/entityActions";
import { Hlaska, Pole, Rozbalovaci, SmazatTlacitko, Vyber, Zaskrtavatko } from "./form";
import { SERVICE_TYPES } from "@/lib/categories";
import { czk, dateCz } from "@/lib/format";

interface Row {
  id: string; type: string; provider: string; monthlyCost: number;
  annualCost: number | null; contractEnd: Date | null; isBundleable: boolean;
}

export function ServiceManager({ propertyId, services, canEdit }: {
  propertyId: string; services: Row[]; canEdit: boolean;
}) {
  const [addState, addAction, adding] = useActionState<EntityFormState, FormData>(saveService.bind(null, null), {});
  const [delState, delAction] = useActionState<EntityFormState, FormData>(deleteService, {});

  const celkem = services.reduce((a, s) => a + s.monthlyCost + (s.annualCost ?? 0) / 12, 0);

  return (
    <div>
      <Hlaska state={addState.error || addState.success ? addState : delState} />

      {services.length === 0 ? (
        <p className="py-3 text-center text-sm text-ink-muted">Žádné evidované služby.</p>
      ) : (
        <table className="table-base">
          <thead>
            <tr><th>Služba</th><th>Dodavatel</th><th className="num">Měsíčně</th><th>Vázán do</th>{canEdit && <th />}</tr>
          </thead>
          <tbody>
            {services.map((s) => (
              <tr key={s.id}>
                <td>
                  {SERVICE_TYPES[s.type] ?? s.type}
                  {!s.isBundleable && <span className="ml-1.5 text-xs text-ink-muted">(mimo balík)</span>}
                </td>
                <td className="text-ink-secondary">{s.provider}</td>
                <td className="num">{czk(s.monthlyCost + (s.annualCost ?? 0) / 12)}</td>
                <td className="text-ink-secondary">{s.contractEnd ? dateCz(s.contractEnd) : "volné"}</td>
                {canEdit && (
                  <td className="text-right">
                    <SmazatTlacitko action={delAction} id={s.id}
                      potvrzeni={`Opravdu smazat ${SERVICE_TYPES[s.type] ?? s.type} od ${s.provider}?`} />
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

      {canEdit && (
        <Rozbalovaci popisek="Přidat službu nebo dodavatele" zavritPo={addState.success}>
          <form action={addAction} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="propertyId" value={propertyId} />
            <Vyber label="Druh služby" name="type" defaultValue="ELECTRICITY"
              options={Object.entries(SERVICE_TYPES) as [string, string][]} />
            <Pole label="Dodavatel" name="provider" required placeholder="např. ČEZ Prodej" />
            <Pole label="Měsíční náklad (Kč)" name="monthlyCost" type="number" defaultValue={0} />
            <Pole label="Roční náklad (Kč)" name="annualCost" type="number"
              hint="Když se platí jednou ročně — rozpočte se na měsíce" />
            <Pole label="Číslo smlouvy" name="contractNo" placeholder="nepovinné" />
            <Pole label="Smlouva vázána do" name="contractEnd" type="date"
              hint="Do kdy nelze přejít jinam" />
            <Pole label="Výpovědní lhůta (měsíců)" name="noticePeriodMonths" type="number" defaultValue={0} />
            <div className="flex items-end">
              <Zaskrtavatko name="isBundleable" label="Zahrnout do hromadné poptávky" defaultChecked
                hint="Vypni u SVJ a regulovaných plateb" />
            </div>
            <div className="sm:col-span-2">
              <button type="submit" disabled={adding} className="btn btn-primary">
                {adding ? "Ukládám…" : "Uložit službu"}
              </button>
            </div>
          </form>
        </Rozbalovaci>
      )}
    </div>
  );
}
