import { redirect } from "next/navigation";
import { page } from "@/lib/guard";
import { Nav } from "@/components/Nav";
import { Verze } from "@/components/Verze";
import { BankaPohyby } from "@/components/BankaPohyby";
import { prisma } from "@/lib/db";
import { fioNastaveno } from "@/lib/fio";
import { denISO } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Pohyby na bankovnim uctu (Fio) a jejich parovani na najem, zalohy a vyuctovani. */
export default async function BankaPage() {
  const user = await page();
  if (user.role !== "OWNER") redirect("/");
  const [keKontrole, sparovane, smlouvy, pocty, kratkodobe] = await Promise.all([
    prisma.bankovniPohyb.findMany({ where: { stav: "KE_KONTROLE" }, orderBy: { datum: "desc" } }),
    prisma.bankovniPohyb.findMany({ where: { stav: "SPAROVANO" }, orderBy: { datum: "desc" }, take: 50 }),
    prisma.lease.findMany({ include: { property: { select: { name: true } } }, orderBy: [{ isActive: "desc" }, { startDate: "desc" }] }),
    prisma.bankovniPohyb.groupBy({ by: ["stav"], _count: true }),
    // Byty s krátkodobým pronájmem: výplaty z Airbnb / Booking jdou přiřadit jako jejich příjem
    prisma.property.findMany({ where: { kratkodobe: { some: {} } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const posledni = await prisma.bankovniPohyb.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  const nazevSmlouvy = (id: string | null) => {
    const s = smlouvy.find((x) => x.id === id);
    return s ? `${s.tenantName} · ${s.property.name}` : null;
  };
  const nazevBytu = (p: { leaseId: string | null; propertyId: string | null; parovani: unknown }) =>
    (p.parovani as { kratkodoby?: string } | null)?.kratkodoby ? `Krátkodobý pronájem · ${kratkodobe.find((x) => x.id === p.propertyId)?.name ?? ""}` : nazevSmlouvy(p.leaseId);
  const radek = (p: (typeof keKontrole)[number]) => ({
    id: p.id, datum: denISO(p.datum), castka: p.castka, protiucet: p.protiucet, nazevProtiuctu: p.nazevProtiuctu,
    vs: p.vs, zprava: p.zprava, poznamka: p.poznamka, navrhLeaseId: p.navrhLeaseId, propertyId: p.propertyId,
    smlouva: nazevBytu(p), parovani: p.parovani as { klic: string; castka: number }[] | { vyuctovani: string; cislo: string } | { kratkodoby: string } | null,
  });

  return (
    <>
      <Nav user={user} verze={<Verze />} />
      <main className="mx-auto max-w-[1100px] space-y-5 p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Banka</h1>
        <BankaPohyby
          napojeno={fioNastaveno()}
          posledniStazeni={posledni?.createdAt.toISOString() ?? null}
          pocty={Object.fromEntries(pocty.map((x) => [x.stav, x._count]))}
          keKontrole={keKontrole.map(radek)}
          sparovane={sparovane.map(radek)}
          smlouvy={smlouvy.map((s) => ({ id: s.id, nazev: `${s.tenantName} · ${s.property.name}${s.isActive ? "" : " (skončená)"}` }))}
          kratkodobe={kratkodobe.map((p) => ({ id: p.id, nazev: `Krátkodobý pronájem · ${p.name}` }))}
        />
      </main>
    </>
  );
}
