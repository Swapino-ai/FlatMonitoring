import Link from "next/link";
import { notFound } from "next/navigation";
import { page } from "@/lib/guard";
import { Nav } from "@/components/Nav";
import { Verze } from "@/components/Verze";
import { Card, Stat, StatGrid } from "@/components/Stat";
import { ValuationManager } from "@/components/ValuationManager";
import { RentHistory } from "@/components/RentHistory";
import { RentScanButton } from "@/components/RentScanButton";
import { VyrazeneNabidky } from "@/components/VyrazeneNabidky";
import { NabidkyVOkoli } from "@/components/NabidkyVOkoli";
import { JakVznikaOdhad } from "@/components/JakVznikaOdhad";
import { prisma } from "@/lib/db";
import { loadProperty } from "@/lib/portfolio";
import { diagnostikaOceneni, nabidkyVOkoli } from "@/lib/market";
import { NEMOVITOST_MAP, nazevNemovitosti } from "@/lib/catalogs";
import { czk, dateCz } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Vsechno kolem skenu trhu na jedne strance.
 *
 * V detailu nemovitosti to zabiralo vic mista nez cisla, kvuli kterym se tam
 * chodi. Kdo resi, proc odhad vysel takhle, jde sem; kdo chce videt vykonnost,
 * zustane v detailu.
 */
export default async function TrhPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await page();
  const { id } = await params;
  const property = await loadProperty(id);
  if (!property) notFound();

  const canEdit = user.role === "OWNER";

  const [odhadyNajmu, vyrazene] = await Promise.all([
    prisma.rentEstimate.findMany({ where: { propertyId: id }, orderBy: { date: "desc" }, take: 60 }),
    prisma.excludedListing.findMany({ where: { propertyId: id }, orderBy: { createdAt: "desc" } }),
  ]);
  const vyrazeneKlice = vyrazene.map((v) => `${v.source}|${v.externalId}`);
  const smluvniNajem = property.leases.find((l) => l.isActive)?.rentMonthly ?? 0;

  const oceneni = property.valuations[0];
  const najem = odhadyNajmu[0];
  const skenovatelne = !!NEMOVITOST_MAP.get(property.type)?.srealityCesta;

  // Podklady k nahlednuti jen kdyz odhad nevznikl — jinak je uzivatel nepotrebuje
  const okoli = oceneni
    ? { nabidky: [], kroky: [] }
    : { nabidky: await nabidkyVOkoli(id), kroky: await diagnostikaOceneni(id) };

  return (
    <>
      <Nav user={user} verze={<Verze />} />
      <main className="mx-auto max-w-[1400px] space-y-4 px-6 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link href={`/properties/${id}`} className="text-xs text-accent">← {property.name}</Link>
            <h1 className="mt-1 text-xl font-semibold">Ocenění a trh</h1>
            <p className="mt-1 text-sm text-ink-secondary">
              {property.city} · {nazevNemovitosti(property.type)}
              {property.disposition && ` · ${property.disposition}`} · {property.areaM2} m²
            </p>
          </div>
          {canEdit && skenovatelne && <RentScanButton propertyId={id} />}
        </div>

        <StatGrid>
          <Stat label="Odhad hodnoty" value={oceneni ? czk(oceneni.value) : "—"}
            sub={oceneni ? `z ${oceneni.sampleSize ?? "?"} nabídek · ${dateCz(oceneni.date)}` : "zatím nevznikl"}
            tone={oceneni?.confidence === "KVALIFIKOVANY" ? "good" : "neutral"} />
          <Stat label="Odhad nájmu" value={najem ? `${czk(najem.monthlyRent)}/měs.` : "—"}
            sub={najem ? `z ${najem.sampleSize ?? "?"} nabídek · ${dateCz(najem.date)}` : "zatím nevznikl"} />
          <Stat label="Spolehlivost"
            value={oceneni?.confidence === "KVALIFIKOVANY" ? "kvalifikovaný"
              : oceneni?.confidence === "RUCNI" ? "ručně upraveno"
                : oceneni?.confidence === "HIGH" ? "vysoká"
                  : oceneni?.confidence === "MEDIUM" ? "střední"
                    : oceneni?.confidence ? "nízká" : "—"}
            sub={oceneni?.confidence === "KVALIFIKOVANY" ? "jen nabídky z této obce" : "viz postup níž"}
            tone={oceneni?.confidence === "KVALIFIKOVANY" ? "good" : "neutral"} />
          <Stat label="Vyřazeno ručně" value={vyrazene.length}
            sub={vyrazene.length ? "nevstupuje do odhadu" : "nic"} />
        </StatGrid>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            <Card title="Historie ocenění">
              <ValuationManager
                propertyId={id}
                valuations={property.valuations}
                areaM2={property.areaM2}
                canEdit={canEdit}
                vyrazene={vyrazeneKlice}
              />
              <VyrazeneNabidky propertyId={id} polozky={vyrazene} canEdit={canEdit} />
              {!oceneni && (
                <>
                  <p className="mt-3 rounded-lg bg-warn/10 px-3 py-2.5 text-sm text-warn">
                    {skenovatelne
                      ? "Odhad zatím nevznikl. Níž je vidět, kde se vzorek ztratil a co sken v okolí našel."
                      : "Tenhle druh nemovitosti se na Sreality neskenuje — hodnotu zadej ručně."}
                  </p>
                  <NabidkyVOkoli nabidky={okoli.nabidky} kroky={okoli.kroky} />
                </>
              )}
            </Card>

            <Card title="Vývoj tržního nájmu">
              <RentHistory odhady={odhadyNajmu} smluvniNajem={smluvniNajem} areaM2={property.areaM2}
                propertyId={id} vyrazene={vyrazeneKlice} canEdit={canEdit} />
            </Card>
          </div>

          <Card title="Jak odhad vzniká" action={
            canEdit ? <Link href={`/properties/${id}/edit`} className="text-xs text-accent">Nastavení →</Link> : null
          }>
            <JakVznikaOdhad nastaveniJednotky={{
              okruhKm: property.scanRadiusKm,
              vyloucenaMesta: property.excludedCities,
            }} />
          </Card>
        </div>
      </main>
    </>
  );
}
