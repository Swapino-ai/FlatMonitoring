/**
 * Prevod drive vyrazenych nabidek (stara tabulka ExcludedListing) do nove databaze trhu.
 * Bezi pri otevreni stranky trhu, ne az v noci: vyrazene musi byt videt hned.
 * Uz rozhodnute zarazeni neprepisuje.
 */
import { prisma } from "../db";

export interface StaraVyrazena { id: string; popis: string; reason: string | null; createdAt: Date }

/** Vrati vyrazene, ke kterym uz nejsou data nabidky (zbyl jen popis). */
export async function prevedVyrazene(propertyId: string): Promise<StaraVyrazena[]> {
  const stare = await prisma.excludedListing.findMany({ where: { propertyId }, orderBy: { createdAt: "desc" } });
  const bezDat: StaraVyrazena[] = [];
  for (const v of stare) {
    let i = await prisma.inzerat.findUnique({ where: { source_externalId: { source: v.source, externalId: v.externalId } } });
    if (!i) {
      const m = await prisma.marketListing.findFirst({ where: { source: v.source, externalId: v.externalId }, orderBy: { scrapedAt: "desc" } });
      if (!m) { bezDat.push({ id: v.id, popis: v.popis, reason: v.reason, createdAt: v.createdAt }); continue; }
      i = await prisma.inzerat.create({
        data: {
          source: m.source, externalId: v.externalId, dealType: m.dealType, category: m.category, city: m.city,
          region: m.region, district: m.district, disposition: m.disposition, areaM2: m.areaM2, price: m.price,
          pricePerM2: m.pricePerM2, url: m.url, latitude: m.latitude, longitude: m.longitude,
          firstSeenAt: m.scrapedAt, lastSeenAt: m.scrapedAt,
          ceny: { create: { price: m.price, pricePerM2: m.pricePerM2, at: m.scrapedAt } },
        },
      });
    }
    const zarazeni = await prisma.zarazeniInzeratu.findUnique({ where: { propertyId_inzeratId: { propertyId, inzeratId: i.id } } });
    if (!zarazeni) {
      await prisma.zarazeniInzeratu.create({
        data: { propertyId, inzeratId: i.id, stav: "VYRAZENO", duvod: v.reason ?? "vyřazeno dříve", rozhodnutoAt: v.createdAt },
      });
    }
  }
  return bezDat;
}
