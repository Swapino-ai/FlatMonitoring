import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { page } from "@/lib/guard";
import { Nav } from "@/components/Nav";
import { Verze } from "@/components/Verze";
import { PropertyForm } from "@/components/PropertyForm";
import { OwnerManager } from "@/components/OwnerManager";
import { Card } from "@/components/Stat";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function EditPropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await page();
  const { id } = await params;
  if (user.role !== "OWNER") redirect(`/properties/${id}`);

  const property = await prisma.property.findUnique({
    where: { id },
    include: { owners: { include: { user: { select: { id: true, name: true, email: true } } } } },
  });
  if (!property) notFound();

  const uzivatele = await prisma.user.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true },
  });

  return (
    <>
      <Nav user={user} verze={<Verze />} />
      <main className="mx-auto max-w-[900px] space-y-5 p-6">
        <div>
          <Link href={`/properties/${id}`} className="text-sm text-ink-muted hover:text-ink-primary">← {property.name}</Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Upravit nemovitost</h1>
        </div>
        <Card title="Vlastníci a podíly">
          <p className="mb-3 text-sm text-ink-secondary">
            Vlastníkem nemusí být ten, kdo záznam založil. Podíl rozhoduje, kolik z hodnoty,
            dluhu i nájmu se komu počítá do portfolia a co zdaní ve svém přiznání.
          </p>
          <OwnerManager
            propertyId={property.id}
            owners={property.owners}
            uzivatele={uzivatele}
            canEdit
          />
        </Card>

        <PropertyForm id={id} values={{ ...property, purchaseDate: property.purchaseDate }} />
      </main>
    </>
  );
}
