import { notFound } from "next/navigation";
import { page } from "@/lib/guard";
import { Nav } from "@/components/Nav";
import { Verze } from "@/components/Verze";
import { HlavickaNemovitosti } from "@/components/HlavickaNemovitosti";
import { KratkodobyPronajem } from "@/components/KratkodobyPronajem";
import { prisma } from "@/lib/db";
import { aiNastaveno } from "@/lib/uctenkaAi";
import { denISO } from "@/lib/format";
import { nactiNavrhPlatby } from "@/lib/pravidelnePlatbyData";

export const dynamic = "force-dynamic";

/** Krátkodobý pronájem (Airbnb, Booking): období, příjmy jako platby a náklady s účtenkami. */
export default async function KratkodobyPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await page();
  const { id } = await params;
  const property = await prisma.property.findUnique({
    where: { id },
    include: {
      kratkodobe: { orderBy: { od: "desc" } },
      // Vsechny pohyby bytu — jedna evidence se Stavem uctu
      transactions: { orderBy: { date: "desc" } },
    },
  });
  if (!property) notFound();
  const [dokumenty, disk] = await Promise.all([
    prisma.dokument.findMany({ where: { transactionId: { in: property.transactions.map((t) => t.id) } }, select: { id: true, transactionId: true, mime: true, name: true } }),
    prisma.googleConnection.findUnique({ where: { id: "main" }, select: { id: true } }),
  ]);
  const bankovni = property.transactions.map((t) => t.sourceKey?.startsWith("banka:") ? t.sourceKey.slice(6) : null).filter((x): x is string => !!x);
  const poznamky = new Map(bankovni.length
    ? (await prisma.bankovniPohyb.findMany({ where: { id: { in: bankovni }, mojePoznamka: { not: null } }, select: { id: true, mojePoznamka: true } })).map((p) => [`banka:${p.id}`, p.mojePoznamka])
    : []);
  const canEdit = user.role === "OWNER";
  // Zaplacene pravidelne platby zapsane jen v evidenci (splatky, sluzby) — Stav uctu je pocita taky
  const predpisy = (await nactiNavrhPlatby(id)).filter((p) => p.zaplaceno?.zdroj === "EVIDENCE");

  return (
    <>
      <Nav user={user} verze={<Verze />} />
      <main className="mx-auto max-w-[1400px] space-y-5 p-4 sm:p-6">
        <HlavickaNemovitosti property={property} canEdit={canEdit} aktivni="kratkodoby" />
        <KratkodobyPronajem
          propertyId={id}
          canEdit={canEdit}
          aiZapnuto={aiNastaveno()}
          diskPripojen={!!disk}
          obdobi={property.kratkodobe.map((o) => ({ id: o.id, od: denISO(o.od), do: o.do ? denISO(o.do) : null, poznamka: o.poznamka }))}
          polozky={[
            ...property.transactions.map((t) => ({
              id: t.id, datum: denISO(t.date), castka: t.amount, kategorie: t.category, popis: t.description, zdroj: "POHYB" as const,
              poznamka: t.sourceKey ? poznamky.get(t.sourceKey) ?? null : null, proplaceno: !!t.proplacenoPohybId,
              uctenky: dokumenty.filter((d) => d.transactionId === t.id).map((d) => ({ id: d.id, nazev: d.name, mime: d.mime })),
            })),
            ...predpisy.map((p) => ({
              id: p.klic, datum: p.zaplaceno!.datum, castka: (p.castka >= 0 ? 1 : -1) * p.zaplaceno!.castka, kategorie: p.kategorie,
              popis: p.popis, zdroj: "PREDPIS" as const, poznamka: p.zaplaceno!.poznamka ?? null, uctenky: [],
            })),
          ].sort((a, b) => b.datum.localeCompare(a.datum))}
        />
      </main>
    </>
  );
}
