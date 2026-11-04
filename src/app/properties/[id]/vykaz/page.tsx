import { notFound } from "next/navigation";
import { page } from "@/lib/guard";
import { Nav } from "@/components/Nav";
import { Verze } from "@/components/Verze";
import { HlavickaNemovitosti } from "@/components/HlavickaNemovitosti";
import { VykazPrace } from "@/components/VykazPrace";
import { prisma } from "@/lib/db";
import { denISO } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Vykaz prace na byte: kdo pracoval, kolik casu, co udelal, fotky. */
export default async function VykazPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await page();
  const { id } = await params;
  // Starsi zaznamy s jmenem jako textem: prevest na pracovniky (jednou)
  const stare = await prisma.vykazPrace.findMany({ where: { propertyId: id, kdo: { not: null } }, select: { id: true, kdo: true } });
  for (const z of stare) {
    const j = z.kdo!.trim();
    const p = j ? await prisma.pracovnik.findFirst({ where: { jmeno: { equals: j, mode: "insensitive" } } }) ?? await prisma.pracovnik.create({ data: { jmeno: j } }) : null;
    await prisma.vykazPrace.update({ where: { id: z.id }, data: { kdo: null, ...(p ? { lide: { connect: { id: p.id } } } : {}) } });
  }
  const [property, pracovnici] = await Promise.all([
    prisma.property.findUnique({
      where: { id },
      include: { vykazy: { orderBy: [{ datum: "desc" }, { createdAt: "desc" }], include: { lide: { select: { id: true }, orderBy: { jmeno: "asc" } } } } },
    }),
    prisma.pracovnik.findMany({ orderBy: { jmeno: "asc" }, select: { id: true, jmeno: true, _count: { select: { vykazy: true } } } }),
  ]);
  if (!property) notFound();
  const [fotky, disk] = await Promise.all([
    prisma.dokument.findMany({ where: { vykazId: { in: property.vykazy.map((v) => v.id) } }, select: { id: true, vykazId: true, name: true }, orderBy: { createdAt: "asc" } }),
    prisma.googleConnection.findUnique({ where: { id: "main" }, select: { id: true } }),
  ]);
  const canEdit = user.role === "OWNER";

  return (
    <>
      <Nav user={user} verze={<Verze />} />
      <main className="mx-auto max-w-[1100px] space-y-5 p-4 sm:p-6">
        <HlavickaNemovitosti property={property} canEdit={canEdit} aktivni="vykaz" />
        <VykazPrace propertyId={id} canEdit={canEdit} diskPripojen={!!disk}
          pracovnici={pracovnici.sort((a, b) => b._count.vykazy - a._count.vykazy || a.jmeno.localeCompare(b.jmeno, "cs")).map((p) => ({ id: p.id, jmeno: p.jmeno }))}
          zaznamy={property.vykazy.map((v) => ({
            id: v.id, datum: denISO(v.datum), lide: v.lide.map((l) => l.id), minut: v.minut, popis: v.popis,
            fotky: fotky.filter((f) => f.vykazId === v.id).map((f) => ({ id: f.id, nazev: f.name })),
          }))} />
      </main>
    </>
  );
}
