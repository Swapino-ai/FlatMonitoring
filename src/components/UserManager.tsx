"use client";

import { useActionState } from "react";
import { addUser, changePassword, deleteUser, type UserFormState } from "@/lib/userActions";
import { Badge, Card } from "./Stat";

interface Row { id: string; email: string; name: string; role: string; createdAt: Date }

export function UserManager({ users, currentUserId }: { users: Row[]; currentUserId: string }) {
  const [addState, addAction, adding] = useActionState<UserFormState, FormData>(addUser, {});
  const [pwState, pwAction] = useActionState<UserFormState, FormData>(changePassword, {});
  const [delState, delAction] = useActionState<UserFormState, FormData>(deleteUser, {});

  const message = addState.error || pwState.error || delState.error
    || addState.success || pwState.success || delState.success;
  const isError = Boolean(addState.error || pwState.error || delState.error);

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
              <tr key={u.id}>
                <td className="font-medium">
                  {u.name}
                  {u.id === currentUserId && <span className="ml-2 text-xs text-ink-muted">(ty)</span>}
                </td>
                <td className="text-ink-secondary">{u.email}</td>
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
                <td className="text-right">
                  {u.id !== currentUserId && (
                    <form action={delAction}>
                      <input type="hidden" name="id" value={u.id} />
                      <button type="submit" className="text-xs text-bad hover:underline">Smazat</button>
                    </form>
                  )}
                </td>
              </tr>
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
