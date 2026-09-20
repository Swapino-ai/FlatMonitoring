import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createSession, hashPassword } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Zalozeni prvniho uctu primo v prohlizeci.
 *
 * Existuje jen dokud v databazi neni zadny uzivatel — pak je stranka nedostupna.
 * Diky tomu se da aplikace rozjet v cloudu bez jedineho prikazu na vlastnim pocitaci.
 */
export default async function SetupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if ((await prisma.user.count()) > 0) redirect("/login");
  const { error } = await searchParams;

  async function createOwner(formData: FormData) {
    "use server";

    // Kontrola znovu uvnitr akce — mezi vykreslenim stranky a odeslanim
    // formulare uz uzivatel vzniknout mohl.
    if ((await prisma.user.count()) > 0) redirect("/login");

    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const name = String(formData.get("name") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    if (!email.includes("@")) redirect("/setup?error=email");
    if (password.length < 8) redirect("/setup?error=heslo");

    const user = await prisma.user.create({
      data: { email, name: name || email, role: "OWNER", passwordHash: await hashPassword(password) },
    });

    await createSession({ id: user.id, email: user.email, name: user.name, role: "OWNER" });
    redirect("/");
  }

  const errors: Record<string, string> = {
    email: "Zadej platný e-mail.",
    heslo: "Heslo musí mít aspoň 8 znaků.",
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-lg font-bold text-white">
            FM
          </div>
          <h1 className="text-xl font-semibold">První spuštění</h1>
          <p className="mt-1 text-sm text-ink-secondary">
            Databáze je prázdná. Založ si účet správce — tahle stránka pak zmizí.
          </p>
        </div>

        <form action={createOwner} className="card space-y-4">
          <div>
            <label className="label mb-1.5 block" htmlFor="email">E-mail</label>
            <input id="email" name="email" type="email" required autoComplete="username" className="input" />
          </div>
          <div>
            <label className="label mb-1.5 block" htmlFor="name">Jméno</label>
            <input id="name" name="name" type="text" className="input" placeholder="nepovinné" />
          </div>
          <div>
            <label className="label mb-1.5 block" htmlFor="password">Heslo</label>
            <input id="password" name="password" type="password" required minLength={8}
              autoComplete="new-password" className="input" />
            <p className="mt-1 text-xs text-ink-muted">Aspoň 8 znaků. Chrání přístup k tvým finančním datům.</p>
          </div>

          {error && <p className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">{errors[error] ?? "Nepodařilo se založit účet."}</p>}

          <button type="submit" className="btn btn-primary w-full">Založit účet a pokračovat</button>
        </form>

        <p className="mt-6 text-center text-xs text-ink-muted">
          Účet pro obchodního partnera přidáš později v aplikaci.
        </p>
      </div>
    </main>
  );
}
