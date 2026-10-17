/**
 * Sken jedne sledovane nemovitosti: stahne prodejni i najemni nabidky ze Sreality,
 * ulozi je do databaze trhu, navrhne nove k zarazeni a prepocita odhad ze zarazenych.
 * Nikdy neoceňuje z nevybranych nabidek.
 */
import { prisma } from "../db";
import { srealitySource } from "./sreality";
import { ulozInzeraty, navrhniProNemovitost, aktualizujOdhad } from "./inzeraty";
import { zacniBeh, ukonciBeh, type Spoust } from "../scanLog";

export interface VysledekSkenu {
  dealType: "SALE" | "RENT";
  nalezeno: number;
  novych: number;
  zmenCeny: number;
  chyba?: string;
}

export async function skenujNemovitost(
  propertyId: string, spoust: Spoust, dealTypes: ("SALE" | "RENT")[] = ["SALE", "RENT"],
): Promise<{ vysledky: VysledekSkenu[]; navrhu: number }> {
  const p = await prisma.property.findUnique({ where: { id: propertyId } });
  if (!p) throw new Error("Nemovitost neexistuje.");
  const vysledky: VysledekSkenu[] = [];

  for (const dealType of dealTypes) {
    const beh = await zacniBeh({ trigger: spoust, dealType, propertyId: p.id, propertyName: p.name, city: p.city, category: p.type });
    try {
      // Sirsi zaber nez driv: dispozici ani uzkou plochu nefiltrujeme, o podobnosti
      // rozhoduje hodnoceni navrhu a hlavne uzivatel
      const nabidky = await srealitySource.fetchListings({
        city: p.city, district: p.district ?? undefined, region: p.region ?? undefined,
        category: p.type, dealType, areaM2: p.areaM2, toleranceM2: Math.max(15, p.areaM2 * 0.4),
        targetSample: 40, maxPages: 8,
      });
      const { novych, zmenCeny } = await ulozInzeraty(nabidky, p.region);
      vysledky.push({ dealType, nalezeno: nabidky.length, novych, zmenCeny });
      await ukonciBeh(beh, { status: nabidky.length ? "OK" : "PRAZDNY", listingsFound: nabidky.length, result: `${nabidky.length} nabídek, ${novych} nových, ${zmenCeny} změn ceny` });
    } catch (e) {
      const zprava = e instanceof Error ? e.message : String(e);
      vysledky.push({ dealType, nalezeno: 0, novych: 0, zmenCeny: 0, chyba: zprava });
      await ukonciBeh(beh, { status: "SELHALO", message: zprava });
    }
  }

  const navrhu = await navrhniProNemovitost(p.id);
  // Ceny zarazenych se mohly zmenit — odhad se prepocita jen z nich
  await aktualizujOdhad(p.id, "SALE");
  await aktualizujOdhad(p.id, "RENT");
  return { vysledky, navrhu };
}
