/**
 * Dohledani kraje a souradnic k adrese, ktera je uz v databazi.
 *
 * Nemovitosti zalozene pred naseptavacem kraj nemaji, a bez nej nefunguje
 * zaloha pro male obce, ktere na Sreality vlastni vypis nemaji. Nutit
 * uzivatele prepsat adresu u kazde nemovitosti by bylo zbytecne — adresu uz
 * zadal jednou.
 *
 * Bezi jen na serveru, protoze pouziva klic k Mapy.cz.
 */
import { prisma } from "./db";
import { slugMesta } from "./market/util";

interface MapyPolozka {
  position?: { lat?: number; lon?: number };
  regionalStructure?: { name?: string; type?: string }[];
}

export interface Dohledano {
  latitude: number | null;
  longitude: number | null;
  /** Kraj ve tvaru pro adresu Sreality, napr. "ustecky-kraj". */
  region: string | null;
}

/** Z adresy udela souradnice a kraj. Null = nepodarilo se. */
export async function dohledejAdresu(adresa: {
  street?: string | null; city: string; zip?: string | null;
}): Promise<Dohledano | null> {
  const klic = process.env.MAPY_API_KEY;
  if (!klic) return null;

  // Ulice bez mesta je nejednoznacna, mesto bez ulice staci — kraj urcuje obec
  const dotaz = [adresa.street, adresa.zip, adresa.city].filter(Boolean).join(", ");

  const url = "https://api.mapy.cz/v1/geocode?" + new URLSearchParams({
    query: dotaz, lang: "cs", limit: "1", locality: "cz", apikey: klic,
  });

  try {
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) return null;
    const data = (await r.json()) as { items?: MapyPolozka[] };
    const p = data.items?.[0];
    if (!p) return null;

    const kraj = p.regionalStructure?.find((c) => c.type === "regional.region")?.name;
    return {
      latitude: p.position?.lat ?? null,
      longitude: p.position?.lon ?? null,
      region: kraj ? slugMesta(kraj) : null,
    };
  } catch {
    return null;
  }
}

/**
 * Doplni nemovitosti kraj a souradnice, kdyz chybi, a rovnou je ulozi —
 * priste uz se dohledavat nemusi.
 */
export async function doplnPolohu(propertyId: string): Promise<Dohledano | null> {
  const p = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { id: true, street: true, city: true, zip: true, latitude: true, longitude: true, region: true },
  });
  if (!p) return null;
  if (p.region && p.latitude != null) {
    return { latitude: p.latitude, longitude: p.longitude, region: p.region };
  }

  const nalez = await dohledejAdresu(p);
  if (!nalez) return null;

  // Rucne zadanou polohu neprepisujeme — uzivatel ji mohl upresnit klepnutim
  const data = {
    region: p.region ?? nalez.region,
    latitude: p.latitude ?? nalez.latitude,
    longitude: p.longitude ?? nalez.longitude,
  };
  await prisma.property.update({ where: { id: p.id }, data });
  return data;
}
