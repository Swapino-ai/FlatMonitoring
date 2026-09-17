import Link from "next/link";
import { redirect } from "next/navigation";
import { page } from "@/lib/guard";
import { Nav } from "@/components/Nav";
import { PropertyForm } from "@/components/PropertyForm";

export const dynamic = "force-dynamic";

export default async function NewPropertyPage() {
  const user = await page();
  if (user.role !== "OWNER") redirect("/properties");

  return (
    <>
      <Nav user={user} />
      <main className="mx-auto max-w-[900px] space-y-5 p-6">
        <div>
          <Link href="/properties" className="text-sm text-ink-muted hover:text-ink-primary">← Nemovitosti</Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Nová nemovitost</h1>
          <p className="mt-1 text-sm text-ink-secondary">
            Úvěry, nájemní smlouvy a služby doplníš po uložení v detailu bytu.
          </p>
        </div>
        <PropertyForm />
      </main>
    </>
  );
}
