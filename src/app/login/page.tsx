import { redirect } from "next/navigation";
import { createSession, getSession, verifyCredentials } from "@/lib/auth";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getSession()) redirect("/");
  const { error } = await searchParams;

  async function login(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const user = await verifyCredentials(email, password);
    if (!user) redirect("/login?error=1");
    await createSession(user);
    redirect("/");
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-lg font-bold text-white">
            FM
          </div>
          <h1 className="text-xl font-semibold">FlatMonitoring</h1>
          <p className="mt-1 text-sm text-ink-secondary">Přehled nemovitostního portfolia</p>
        </div>

        <form action={login} className="card space-y-4">
          <div>
            <label className="label mb-1.5 block" htmlFor="email">E-mail</label>
            <input id="email" name="email" type="email" required autoComplete="username" className="input" />
          </div>
          <div>
            <label className="label mb-1.5 block" htmlFor="password">Heslo</label>
            <input id="password" name="password" type="password" required autoComplete="current-password" className="input" />
          </div>
          {error && (
            <p className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">Nesprávný e-mail nebo heslo.</p>
          )}
          <button type="submit" className="btn btn-primary w-full">Přihlásit se</button>
        </form>

        <p className="mt-6 text-center text-xs text-ink-muted">
          Běží lokálně. Data neopouštějí tvůj počítač.
        </p>
      </div>
    </main>
  );
}
