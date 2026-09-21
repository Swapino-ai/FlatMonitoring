"use client";

import { useActionState } from "react";
import { deleteOwner, saveOwner, type EntityFormState } from "@/lib/entityActions";
import { Hlaska, Pole, Rozbalovaci, SmazatTlacitko, Vyber } from "./form";
import { neprirazenyPodil } from "@/lib/ownership";
import { num } from "@/lib/format";

interface Podil {
  id: string; userId: string; share: number; note: string | null;
  user: { id: string; name: string; email: string };
}

export function OwnerManager({ propertyId, owners, uzivatele, canEdit }: {
  propertyId: string;
  owners: Podil[];
  uzivatele: { id: string; name: string; email: string }[];
  canEdit: boolean;
}) {
  const [addState, addAction, adding] = useActionState<EntityFormState, FormData>(saveOwner, {});
  const [delState, delAction] = useActionState<EntityFormState, FormData>(deleteOwner, {});

  const zbyva = neprirazenyPodil(owners);
  const volni = uzivatele.filter((u) => !owners.some((o) => o.userId === u.id));

  return (
    <div>
      <Hlaska state={addState.error || addState.success ? addState : delState} />

      {owners.length === 0 ? (
        <p className="rounded-lg bg-surface-sunken px-3 py-2.5 text-sm text-ink-secondary">
          Vlastníci nejsou zadaní, byt se proto počítá <strong>celý</strong> do portfolia každého majitele.
          Podíly doplň, až je budeš potřebovat rozlišit.
        </p>
      ) : (
        <>
          <table className="table-base">
            <thead>
              <tr>
                <th>Vlastník</th>
                <th className="num">Podíl</th>
                {canEdit ? <th>Změnit podíl</th> : <th>Poznámka</th>}
                {canEdit && <th />}
              </tr>
            </thead>
            <tbody>
              {owners.map((o) => (
                <tr key={o.id}>
                  <td>
                    <div className="font-medium">{o.user.name}</div>
                    <div className="text-xs text-ink-muted">{o.user.email}</div>
                  </td>
                  <td className="num font-medium">{num(o.share, o.share % 1 ? 2 : 0)} %</td>
                  {canEdit ? (
                    <td>
                      {/* Ulozeni bezi pres stejnou akci — upsert podil prepise */}
                      <form action={addAction} className="flex gap-1.5">
                        <input type="hidden" name="propertyId" value={propertyId} />
                        <input type="hidden" name="userId" value={o.userId} />
                        <input type="hidden" name="note" value={o.note ?? ""} />
                        <input type="number" name="share" step="0.01" min={0.01} max={100}
                          defaultValue={o.share} required
                          className="input max-w-[90px] py-1 text-xs" />
                        <button type="submit" className="btn px-2 py-1 text-xs">Uložit</button>
                      </form>
                      {o.note && <div className="mt-1 text-xs text-ink-muted">{o.note}</div>}
                    </td>
                  ) : (
                    <td className="text-ink-secondary">{o.note}</td>
                  )}
                  {canEdit && (
                    <td className="text-right align-top">
                      <SmazatTlacitko action={delAction} id={o.id}
                        potvrzeni={`Odebrat podíl ${o.user.name}? Přepočítá se tím jeho portfolio.`} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {Math.abs(zbyva) > 0.01 && (
            <p className={`mt-3 rounded-lg px-3 py-2 text-xs ${zbyva > 0 ? "bg-warn/10 text-warn" : "bg-bad/10 text-bad"}`}>
              {zbyva > 0
                ? `Nepřiřazeno zbývá ${num(zbyva, 2)} % bytu — tahle část se nezapočítá nikomu.`
                : `Součet podílů přesahuje 100 % o ${num(-zbyva, 2)} %. Oprav některý podíl.`}
            </p>
          )}
        </>
      )}

      {canEdit && volni.length > 0 && (
        <Rozbalovaci popisek="Přidat spoluvlastníka" zavritPo={addState.success}>
          <form action={addAction} className="grid gap-3 sm:grid-cols-3">
            <input type="hidden" name="propertyId" value={propertyId} />
            <Vyber label="Vlastník" name="userId"
              options={volni.map((u) => [u.id, `${u.name} (${u.email})`] as [string, string])} />
            <Pole label="Podíl (%)" name="share" type="number" step="0.01" min={0.01} max={100} required
              defaultValue={owners.length === 0 ? 100 : Math.max(zbyva, 0) || undefined}
              hint={owners.length ? `Zbývá ${num(Math.max(zbyva, 0), 2)} %` : "Celý byt = 100"} />
            <Pole label="Poznámka" name="note" placeholder="např. SJM" />
            <div className="sm:col-span-3">
              <button type="submit" disabled={adding} className="btn btn-primary">
                {adding ? "Ukládám…" : "Uložit podíl"}
              </button>
            </div>
          </form>
        </Rozbalovaci>
      )}

      {canEdit && volni.length === 0 && owners.length > 0 && (
        <p className="mt-3 text-xs text-ink-muted">
          Všichni uživatelé už mají u tohoto bytu podíl. Další spoluvlastník potřebuje účet — založíš ho v sekci Uživatelé.
        </p>
      )}
    </div>
  );
}
