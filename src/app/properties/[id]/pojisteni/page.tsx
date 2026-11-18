import { notFound } from "next/navigation";
import { page } from "@/lib/guard";
import { Nav } from "@/components/Nav";
import { Verze } from "@/components/Verze";
import { HlavickaNemovitosti } from "@/components/HlavickaNemovitosti";
import { Pojisteni } from "@/components/Pojisteni";
import { prisma } from "@/lib/db";
import { denISO } from "@/lib/format";
import { aiPojistkyNastaveno, type RozborPojistky } from "@/lib/pojistkaAi";

export const dynamic = "force-dynamic";
// Rozbor smlouvy AI muze trvat i minutu
export const maxDuration = 300;

/** Pojisteni nemovitosti: pojistky, smlouvy a jejich rozbor AI. */
export default async function PojisteniPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await page();
  const { id } = await params;
  const property = await prisma.property.findUnique({
    where: { id },
    include: { pojistky: { include: { zmeny: true }, orderBy: { od: "desc" } }, valuations: { orderBy: { date: "desc" }, take: 1 } },
  });
  if (!property) notFound();
  const [smlouvy, disk] = await Promise.all([
    prisma.dokument.findMany({ where: { pojistkaId: { in: property.pojistky.map((p) => p.id) } }, select: { id: true, name: true, mime: true, pojistkaId: true }, orderBy: { createdAt: "asc" } }),
    prisma.googleConnection.findUnique({ where: { id: "main" }, select: { id: true } }),
  ]);
  const canEdit = user.role === "OWNER";
  return (
    <>
      <Nav user={user} verze={<Verze />} />
      <main className="mx-auto max-w-[1100px] space-y-5 p-4 sm:p-6">
        <HlavickaNemovitosti property={property} canEdit={canEdit} aktivni="pojisteni" />
        <Pojisteni propertyId={id} canEdit={canEdit} diskPripojen={!!disk} aiZapnuto={aiPojistkyNastaveno()}
          hodnota={property.valuations[0]?.value ?? property.purchasePrice ?? null}
          pojistky={property.pojistky.map((p) => ({
            id: p.id, pojistovna: p.pojistovna, cisloSmlouvy: p.cisloSmlouvy, druh: p.druh, od: denISO(p.od), do: p.do ? denISO(p.do) : null,
            frekvence: p.frekvence, castka: p.castka, pojistnaCastka: p.pojistnaCastka, poznamka: p.poznamka,
            zmeny: p.zmeny.map((z) => ({ id: z.id, validFrom: denISO(z.validFrom), castka: z.castka })),
            smlouvy: smlouvy.filter((s) => s.pojistkaId === p.id).map((s) => ({ id: s.id, nazev: s.name, mime: s.mime })),
            ai: (p.ai as RozborPojistky | null) ?? null, aiAt: p.aiAt?.toISOString() ?? null,
          }))} />
      </main>
    </>
  );
}
