"use client";

import { Fragment, useActionState, useState } from "react";
import { addUser, changePassword, deleteUser, updateUser, type UserFormState } from "@/lib/userActions";
import { Badge, Card } from "./Stat";
import { UliceNaseptavac } from "./AdresaNaseptavac";

interface Row {
  id: string; email: string; name: string; role: string; createdAt: Date;
  street: string | null; city: string | null; zip: string | null; phone: string | null;
}

/** Jmeno, adresa a telefon — spolecne pro zalozeni i upravu uctu. */
function KontaktniPole({ u, prefix }: { u?: Row; prefix: string }) {
  const [a, setA] = useState({ ulice: u?.street ?? "", obec: u?.city ?? "", psc: u?.zip ?? "" });
  return (
    <>
      <UliceNaseptavac name="street" value={a.ulice} className="sm:col-span-2"
        onChange={(t) => setA((x) => ({ ...x, ulice: t }))}
        onVybrano={(n) => setA((x) => ({ ulice: n.ulice, obec: n.mesto || x.obec, psc: n.psc || x.psc }))}
        hint="Trvalé bydliště nebo sídlo — použije se v exportech." />
      <div>
        <label className="label mb-1.5 block" htmlFor={`${prefix}-city`}>Obec</label>
        <input id={`${prefix}-city`} name="city" className="input" value={a.obec}
          onChange={(e) => setA((x) => ({ ...x, obec: e.target.value }))} />
      </div>
      <div>
        <label className="label mb-1.5 block" htmlFor={`${prefix}-zip`}>PSČ</label>
        <input id={`${prefix}-zip`} name="zip" className="input" value={a.psc}
          onChange={(e) => setA((x) => ({ ...x, psc: e.target.value }))} />
      </div>
      <div>
        <label className="label mb-1.5 block" htmlFor={`${prefix}-phone`}>Telefon</label>
        <input id={`${prefix}-phone`} name="phone" className="input" defaultValue={u?.phone ?? ""} />
      </div>
    </>
  );
}

export function UserManager({ users, currentUserId }: { users: Row[]; currentUserId: string }) {
  const [addState, addAction, adding] = useActionState<UserFormState, FormData>(addUser, {});
  const [pwState, pwAction] = useActionState<UserFormState, FormData>(changePassword, {});
  const [delState, delAction] = useActionState<UserFormState, FormData>(deleteUser, {});
  const [upState, upAction] = useActionState<UserFormState, FormData>(updateUser, {});
  const [upravovany, setUpravovany] = useState<string | null>(null);

  const message = addState.error || pwState.error || delState.error || upState.error
    || addState.success || pwState.success || delState.success || upState.success;
  const isError = Boolean(addState.error || pwState.error || delState.error || upState.error);

  return (
    <div className="space-y-4">
      {message && (
        <p className={`rounded-lg px-3 py-2.5 text-sm ${isError ? "bg-bad/10 text-bad" : "bg-good/10 text-good"}`}>
          {message}
        </p>
      )}

      <Card title="Účty">
        <table className="table-base">
          <thead>
            <tr><th>Jméno</th><th>E-mail</th><th>Role</th><th>Nové heslo</th><th /></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <Fragment key={u.id}>
              <tr>
                <td className="font-medium">
                  {u.name}
                  {u.id === currentUserId && <span className="ml-2 text-xs text-ink-muted">(ty)</span>}
                </td>
                <td className="text-ink-secondary">
                  {u.email}
                  <span className="block text-xs">
                    {[u.street, [u.zip, u.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "adresa nevyplněna"}
                  </span>
                </td>
                <td>
                  <Badge tone={u.role === "OWNER" ? "good" : "neutral"}>
                    {u.role === "OWNER" ? "majitel" : "jen čtení"}
                  </Badge>
                </td>
                <td>
                  <form action={pwAction} className="flex gap-1.5">
                    <input type="hidden" name="id" value={u.id} />
                    <input type="password" name="password" minLength={8} required
                      placeholder="min. 8 znaků" className="input max-w-[160px] py-1 text-xs" />
                    <button type="submit" className="btn px-2 py-1 text-xs">Změnit</button>
                  </form>
                </td>
                <td className="whitespace-nowrap text-right">
                  <button type="button" className="mr-3 text-xs text-accent hover:underline"
                    onClick={() => setUpravovany(upravovany === u.id ? null : u.id)}>
                    {upravovany === u.id ? "Zavřít" : "Upravit"}
                  </button>
                  {u.id !== currentUserId && (
                    <form action={delAction}>
                      <input type="hidden" name="id" value={u.id} />
                      <button type="submit" className="text-xs text-bad hover:underline">Smazat</button>
                    </form>
                  )}
                </td>
              </tr>
              {upravovany === u.id && (
                <tr>
                  <td colSpan={5}>
                    <form action={upAction} className="grid gap-4 rounded-lg bg-surface-sunken p-4 sm:grid-cols-2">
                      <input type="hidden" name="id" value={u.id} />
                      <div className="sm:col-span-2">
                        <label className="label mb-1.5 block" htmlFor={`u-${u.id}-name`}>Jméno</label>
                        <input id={`u-${u.id}-name`} name="name" required defaultValue={u.name} className="input" />
                      </div>
                      <KontaktniPole u={u} prefix={`u-${u.id}`} />
                      <div className="sm:col-span-2">
                        <button type="submit" className="btn btn-primary">Uložit údaje</button>
                      </div>
                    </form>
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Přidat účet">
        <form action={addAction} className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label mb-1.5 block" htmlFor="new-name">Jméno</label>
            <input id="new-name" name="name" required className="input" />
          </div>
          <div>
            <label className="label mb-1.5 block" htmlFor="new-email">E-mail</label>
            <input id="new-email" name="email" type="email" required className="input" />
          </div>
          <div>
            <label className="label mb-1.5 block" htmlFor="new-role">Role</label>
            <select id="new-role" name="role" defaultValue="PARTNER" className="input">
              <option value="PARTNER">Jen pro čtení — obchodní partner, účetní</option>
              <option value="OWNER">Majitel — může vše</option>
            </select>
          </div>
          <div>
            <label className="label mb-1.5 block" htmlFor="new-password">Heslo</label>
            <input id="new-password" name="password" type="password" minLength={8} required className="input" />
          </div>
          <KontaktniPole prefix="new" />
          <div className="sm:col-span-2">
            <button type="submit" disabled={adding} className="btn btn-primary">
              {adding ? "Zakládám…" : "Přidat účet"}
            </button>
            <p className="mt-2 text-xs text-ink-muted">
              Heslo partnerovi předej jinou cestou než e-mailem s odkazem na aplikaci.
            </p>
          </div>
        </form>
      </Card>
    </div>
  );
}
