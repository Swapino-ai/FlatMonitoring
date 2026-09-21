import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { page } from "@/lib/guard";
import { Nav } from "@/components/Nav";
import { Verze } from "@/components/Verze";
import { PropertyForm } from "@/components/PropertyForm";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function EditPropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await page();
  const { id } = await params;
  if (user.role !== "OWNER") redirect(`/properties/${id}`);

  const property = await prisma.property.findUnique({ where: { id } });
  if (!property) notFound();

  return (
    <>
      <Nav user={user} verze={<Verze />} />
      <main className="mx-auto max-w-[900px] space-y-5 p-6">
        <div>
          <Link href={`/properties/${id}`} className="text-sm text-ink-muted hover:text-ink-primary">← {property.name}</Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Upravit nemovitost</h1>
        </div>
        <PropertyForm id={id} values={{ ...property, purchaseDate: property.purchaseDate }} />
      </main>
    </>
  );
}
