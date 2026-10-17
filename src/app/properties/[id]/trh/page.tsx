import Link from "next/link";
import { notFound } from "next/navigation";
import { page } from "@/lib/guard";
import { Nav } from "@/components/Nav";
import { Verze } from "@/components/Verze";
import { Card } from "@/components/Stat";
import { ValuationManager } from "@/components/ValuationManager";
import { TrhNemovitosti, type OdhadPanel, type RadekTrhu } from "@/components/TrhNemovitosti";
import { prisma } from "@/lib/db";
import { loadProperty } from "@/lib/portfolio";
import { NEMOVITOST_MAP, nazevNemovitosti } from "@/lib/catalogs";
import { denISO } from "@/lib/format";
import { odhadZeZarazenych } from "@/lib/market/zarazeni";
import { OKNO_ODHADU, navrhniProNemovitost } from "@/lib/market/inzeraty";
import { presunSnimkyNaDisk } from "@/lib/market/snimky";
import { prevedVyrazene } from "@/lib/market/prevod";

export const dynamic = "force-dynamic";

/**
 * Ocenění a trh: sledovani trhu u nemovitosti, kontrola navrzenych nabidek,
 * zarazene nabidky a odhad z poslednich 10 zarazenych.
 */
export default async function TrhPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await page();
  const { id } = await params;
  const property = await loadProperty(id);
  if (!property) notFound();

  // Snimky porizene nocnim skenem se presouvaji na Google Disk postupne
  await presunSnimkyNaDisk(3).catch(() => 0);

  // Drive vyrazene nabidky musi byt videt i v nove databazi trhu
  const stareVyrazene = await prevedVyrazene(id);
  // Proc co (ne)prislo do navrhu — bez zapisu
  const diag = await navrhniProNemovitost(id, { zapsat: false });

  const zaznamy = await prisma.zarazeniInzeratu.findMany({
    where: { propertyId: id },
    include: {
      inzerat: {
        include: {
          ceny: { orderBy: { at: "asc" } },
          snimky: { orderBy: { createdAt: "desc" }, select: { id: true, createdAt: true } },
        },
      },
    },
  });

  const radky: RadekTrhu[] = zaznamy.map((z) => {
    const i = z.inzerat;
    return {
      id: z.id, stav: z.stav as RadekTrhu["stav"], skore: z.skore, doporuceno: z.doporuceno, duvod: z.duvod,
      dealType: i.dealType === "RENT" ? "RENT" : "SALE", disposition: i.disposition, areaM2: i.areaM2,
      price: i.price, pricePerM2: i.pricePerM2, city: i.city, district: i.district, url: i.url,
      lat: i.latitude, lon: i.longitude, polohaRucne: i.polohaRucne, inzeratId: i.id,
      firstSeen: denISO(i.firstSeenAt), lastSeen: denISO(i.lastSeenAt), zmizel: i.zmizelAt ? denISO(i.zmizelAt) : null,
      ceny: i.ceny.map((c) => ({ at: denISO(c.at), price: c.price })),
      snimky: i.snimky.map((s) => ({ id: s.id, createdAt: s.createdAt.toISOString() })),
    };
  });

  const odhad = (d: "SALE" | "RENT"): OdhadPanel | null => {
    const o = odhadZeZarazenych(
      radky.filter((r) => r.dealType === d && r.stav === "ZARAZENO").map((r) => ({ datum: r.firstSeen, pricePerM2: r.pricePerM2 ?? 0 })),
      property.areaM2, OKNO_ODHADU,
    );
    return o ? { hodnota: o.hodnota, perM2: o.perM2, pocet: o.pocet, rada: o.rada.map((b) => ({ datum: b.datum, hodnota: b.hodnota })) } : null;
  };

  const canEdit = user.role === "OWNER";
  const skenovatelne = !!NEMOVITOST_MAP.get(property.type)?.srealityCesta;

  return (
    <>
      <Nav user={user} verze={<Verze />} />
      <main className="mx-auto max-w-[1400px] space-y-4 px-6 py-6">
        <div>
          <Link href={`/properties/${id}`} className="text-xs text-accent">← {property.name}</Link>
          <h1 className="mt-1 text-xl font-semibold">Ocenění a trh</h1>
          <p className="mt-1 text-sm text-ink-secondary">
            {property.city} · {nazevNemovitosti(property.type)}
            {property.disposition && ` · ${property.disposition}`} · {property.areaM2} m²
          </p>
        </div>

        <TrhNemovitosti propertyId={id} canEdit={canEdit} sledovat={property.sledovatTrh} skenovatelne={skenovatelne}
          poloha={property.latitude != null && property.longitude != null ? { lat: property.latitude, lon: property.longitude } : null}
          radky={radky} diag={diag} stareVyrazene={stareVyrazene.map((v) => ({ id: v.id, popis: v.popis, duvod: v.reason, kdy: v.createdAt.toISOString() }))} odhady={{ SALE: odhad("SALE"), RENT: odhad("RENT") }} />

        <Card title="Historie ocenění">
          <ValuationManager propertyId={id} valuations={property.valuations} areaM2={property.areaM2} canEdit={canEdit} vyrazene={[]} />
        </Card>
      </main>
    </>
  );
}
