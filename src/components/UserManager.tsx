"use client";

import { useActionState, useState } from "react";
import { addUser, changePassword, deleteUser, updateUser, type UserFormState } from "@/lib/userActions";
import { Badge, Card } from "./Stat";
import { SbalitelnaKarta } from "./SbalitelnaKarta";
import { UliceNaseptavac } from "./AdresaNaseptavac";
import { SmazatTlacitko, UpravaPanel, UpravitTlacitko } from "./form";

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
  const editovany = users.find((u) => u.id === upravovany) ?? null;

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
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr><th>Uživatel</th><th className="hidden md:table-cell">Kontakt</th><th>Role</th><th /></tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const adresa = [u.street, [u.zip, u.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
                const inicialy = u.name.split(/\s+/).filter(Boolean).slice(0, 2).map((c) => c[0]?.toUpperCase()).join("");
                return (
                  <tr key={u.id} className={upravovany === u.id ? "bg-accent-soft/40" : ""}>
                    <td>
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
                          {inicialy || "?"}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate font-medium">
                            {u.name}
                            {u.id === currentUserId && <span className="ml-2 text-xs font-normal text-ink-muted">(ty)</span>}
                          </div>
                          <div className="truncate text-xs text-ink-muted">{u.email}</div>
                          {/* Na telefonu neni misto na sloupec Kontakt */}
                          <div className="truncate text-xs text-ink-muted md:hidden">{adresa || u.phone || ""}</div>
                        </div>
                      </div>
                    </td>
                    <td className="hidden text-sm md:table-cell">
                      {adresa || u.phone ? (
                        <>
                          {adresa && <div>{adresa}</div>}
                          {u.phone && <div className="text-xs text-ink-muted">{u.phone}</div>}
                        </>
                      ) : <span className="text-xs text-ink-muted">nevyplněno</span>}
                    </td>
                    <td>
                      <Badge tone={u.role === "OWNER" ? "good" : "neutral"}>
                        {u.role === "OWNER" ? "majitel" : "jen čtení"}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <UpravitTlacitko aktivni={upravovany === u.id}
                        onClick={() => setUpravovany(upravovany === u.id ? null : u.id)} />
                      {u.id !== currentUserId && (
                        <SmazatTlacitko action={delAction} id={u.id}
                          potvrzeni={`Smazat účet ${u.email}?`} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {editovany && (
          <UpravaPanel key={editovany.id} nadpis={`Upravit: ${editovany.name}`} onZavrit={() => setUpravovany(null)}>
            <form action={upAction} className="grid gap-4 sm:grid-cols-2">
              <input type="hidden" name="id" value={editovany.id} />
              <div className="sm:col-span-2">
                <label className="label mb-1.5 block" htmlFor="u-name">Jméno</label>
                <input id="u-name" name="name" required defaultValue={editovany.name} className="input" />
              </div>
              <KontaktniPole u={editovany} prefix="u" />
              <div className="sm:col-span-2">
                <button type="submit" className="btn btn-primary">Uložit údaje</button>
              </div>
            </form>
            <form action={pwAction} className="mt-4 flex flex-wrap items-end gap-2 border-t border-line pt-4">
              <input type="hidden" name="id" value={editovany.id} />
              <div>
                <label className="label mb-1.5 block" htmlFor="u-pw">Nové heslo</label>
                <input id="u-pw" type="password" name="password" minLength={8} required
                  placeholder="min. 8 znaků" className="input max-w-[220px]" />
              </div>
              <button type="submit" className="btn">Změnit heslo</button>
            </form>
          </UpravaPanel>
        )}
      </Card>

      <SbalitelnaKarta klic="uzivatele-pridat" title="Přidat účet" vychoziSbalena>
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
      </SbalitelnaKarta>
    </div>
  );
}
