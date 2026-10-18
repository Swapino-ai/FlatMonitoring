import { notFound } from "next/navigation";
import { page } from "@/lib/guard";
import { Nav } from "@/components/Nav";
import { Verze } from "@/components/Verze";
import { HlavickaNemovitosti } from "@/components/HlavickaNemovitosti";
import { MerakyNemovitosti } from "@/components/MerakyNemovitosti";
import { prisma } from "@/lib/db";
import { udalostiNajmu } from "@/lib/meraky";
import { svjNastaveno, synchronizujSvj } from "@/lib/svj";
import { denISO } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Meraky nemovitosti a jejich stavy pri predani a vraceni bytu (predavaci protokol). */
export default async function MerakyPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await page();
  const { id } = await params;
  // Odecty z Evidence SVJ (u meraku s cislem v SVJ) se prevezmou pred nactenim stavu
  const svj = await synchronizujSvj(id);
  const property = await prisma.property.findUnique({
    where: { id },
    include: {
      leases: { select: { id: true, tenantId: true, tenantName: true, startDate: true, endDate: true, isActive: true } },
      meraky: { orderBy: [{ poradi: "asc" }, { createdAt: "asc" }], include: { stavy: true } },
    },
  });
  if (!property) notFound();
  const canEdit = user.role === "OWNER";

  return (
    <>
      <Nav user={user} verze={<Verze />} />
      <main className="mx-auto max-w-[1400px] space-y-5 p-6">
        <HlavickaNemovitosti property={property} canEdit={canEdit} aktivni="meraky" />
        <MerakyNemovitosti
          propertyId={id}
          canEdit={canEdit}
          meraky={property.meraky.map((m) => ({ id: m.id, druh: m.druh, nazev: m.nazev, cislo: m.cislo, aktivni: m.aktivni, dvoutarif: m.dvoutarif,
            nahrazujeId: m.nahrazujeId, vymenenAt: m.vymenenAt ? denISO(m.vymenenAt) : null,
            svjCislo: m.svjCislo, svjByt: m.svjByt }))}
          svj={svj}
          svjNastaveno={svjNastaveno()}
          udalosti={udalostiNajmu(property.leases)}
          stavy={property.meraky.flatMap((m) => m.stavy.map((s) => ({
            id: s.id, merakId: s.merakId, leaseId: s.leaseId, udalost: s.udalost, datum: denISO(s.datum), hodnota: s.hodnota, hodnota2: s.hodnota2, zdroj: s.zdroj,
          })))}
        />
      </main>
    </>
  );
}
