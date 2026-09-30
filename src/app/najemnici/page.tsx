import { redirect } from "next/navigation";
import { page } from "@/lib/guard";
import { Nav } from "@/components/Nav";
import { Verze } from "@/components/Verze";
import { Card } from "@/components/Stat";
import { NajemciManager } from "@/components/NajemciManager";
import { prisma } from "@/lib/db";
import { cisloNajemce, zajistiNajemce } from "@/lib/najemci";

export const dynamic = "force-dynamic";

/** Databaze najemniku: jeden clovek = jeden zaznam s vlastnim cislem, smlouvy na nej odkazuji. */
export default async function NajemniciPage() {
  const user = await page();
  // Jsou tu telefony, adresy a cisla uctu; partner jen pro cteni je nema videt
  if (user.role !== "OWNER") redirect("/");

  // Smlouvy z doby pred touto tabulkou se dohledaji a napoji
  await zajistiNajemce();

  const najemci = await prisma.tenant.findMany({
    orderBy: { cislo: "asc" },
    include: {
      leases: {
        orderBy: { startDate: "desc" },
        select: { id: true, propertyId: true, startDate: true, endDate: true, isActive: true, property: { select: { name: true } } },
      },
    },
  });
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  return (
    <>
      <Nav user={user} verze={<Verze />} />
      <main className="mx-auto max-w-[1100px] space-y-4 px-6 py-6">
        <div>
          <h1 className="text-xl font-semibold">Nájemníci</h1>
          <p className="mt-1 text-sm text-ink-secondary">
            Každý nájemce má vlastní číslo. Kontakt se mění tady nebo ve smlouvě a platí ve všech jeho smlouvách.
          </p>
        </div>
        <Card title={`Databáze nájemníků (${najemci.length})`}>
          <NajemciManager najemci={najemci.map((n) => ({
            id: n.id, cislo: cisloNajemce(n.cislo), name: n.name,
            email: n.email, phone: n.phone, street: n.street, city: n.city, zip: n.zip,
            account: n.account, notes: n.notes,
            smlouvy: n.leases.map((l) => ({
              id: l.id, propertyId: l.propertyId, nemovitost: l.property.name,
              od: iso(l.startDate), do: l.endDate ? iso(l.endDate) : null, aktivni: l.isActive,
            })),
          }))} />
        </Card>
      </main>
    </>
  );
}
