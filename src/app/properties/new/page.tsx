import Link from "next/link";
import { redirect } from "next/navigation";
import { page } from "@/lib/guard";
import { Nav } from "@/components/Nav";
import { Verze } from "@/components/Verze";
import { PropertyForm } from "@/components/PropertyForm";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function NewPropertyPage() {
  const user = await page();
  if (user.role !== "OWNER") redirect("/properties");

  const uzivatele = await prisma.user.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true },
  });

  return (
    <>
      <Nav user={user} verze={<Verze />} />
      <main className="mx-auto max-w-[900px] space-y-5 p-6">
        <div>
          <Link href="/properties" className="text-sm text-ink-muted hover:text-ink-primary">← Nemovitosti</Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Nová nemovitost</h1>
          <p className="mt-1 text-sm text-ink-secondary">
            Vyber vlastníka a základní údaje. Úvěry, nájemní smlouvy, služby a další
            spoluvlastníky doplníš po uložení v detailu nemovitosti.
          </p>
        </div>
        <PropertyForm uzivatele={uzivatele} vychoziVlastnik={user.id} />
      </main>
    </>
  );
}
