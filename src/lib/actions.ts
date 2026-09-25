"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "./db";
import { getSession } from "./auth";
import { prepocitejPoVyrazeni, rozdelMesta } from "./market";

const numberish = (fallback = 0) =>
  z.preprocess((v) => {
    if (v === "" || v == null) return fallback;
    const n = Number(String(v).replace(/[\s ]/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : fallback;
  }, z.number());

const optionalNumber = z.preprocess((v) => {
  if (v === "" || v == null) return null;
  const n = Number(String(v).replace(/[\s ]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}, z.number().nullable());

const optionalString = z.preprocess((v) => (v === "" || v == null ? null : String(v)), z.string().nullable());

const propertySchema = z.object({
  type: z.string().min(1),
  name: z.string().min(1, "Zadej název"),
  street: z.string().min(1, "Zadej ulici"),
  city: z.string().min(1, "Zadej město"),
  zip: z.string().min(1, "Zadej PSČ"),
  district: optionalString,
  // Souradnice plni naseptavac adres; rucne vyplnena adresa je nema
  latitude: optionalNumber,
  longitude: optionalNumber,
  // Kraj — zaloha pro obce, ktere na Sreality vlastni vypis nemaji
  region: optionalString,
  // Nastaveni srovnavani u teto jednotky
  scanRadiusKm: optionalNumber,
  excludedCities: optionalString,
  disposition: optionalString,
  areaM2: numberish().refine((v) => v > 0, "Plocha musí být větší než nula"),
  floor: optionalNumber,
  buildYear: optionalNumber,
  cadastralNo: optionalString,
  hasBalcony: z.coerce.boolean(),
  hasCellar: z.coerce.boolean(),
  hasParking: z.coerce.boolean(),
  purchaseDate: z.string().min(1, "Zadej datum pořízení"),
  purchasePrice: numberish().refine((v) => v > 0, "Kupní cena musí být větší než nula"),
  acquisitionCosts: numberish(),
  renovationCosts: numberish(),
  landShareValue: numberish(),
  depreciationGroup: numberish(5),
  depreciationMethod: z.enum(["STRAIGHT", "ACCELERATED"]),
  status: z.enum(["RENTED", "VACANT", "RENOVATION", "FOR_SALE", "SOLD"]),
  notes: optionalString,
  // Jen pri zakladani — u uprav se vlastnici resi vlastni sekci
  ownerId: optionalString,
  ownerShare: numberish(100),
});

export interface FormState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

function parse(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  return propertySchema.safeParse({
    ...raw,
    hasBalcony: raw.hasBalcony === "on",
    hasCellar: raw.hasCellar === "on",
    hasParking: raw.hasParking === "on",
  });
}

function toFieldErrors(issues: z.ZodIssue[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) out[String(i.path[0])] = i.message;
  return out;
}

export async function saveProperty(id: string | null, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getSession();
  if (!user) return { error: "Nejsi přihlášen." };
  if (user.role !== "OWNER") return { error: "Jen majitel může upravovat nemovitosti." };

  const parsed = parse(formData);
  if (!parsed.success) {
    return { error: "Zkontroluj vyplněná pole.", fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const d = parsed.data;
  const data = {
    type: d.type,
    name: d.name, street: d.street, city: d.city, zip: d.zip, district: d.district,
    latitude: d.latitude, longitude: d.longitude, region: d.region,
    scanRadiusKm: d.scanRadiusKm, excludedCities: d.excludedCities,
    disposition: d.disposition, areaM2: d.areaM2, floor: d.floor, buildYear: d.buildYear,
    cadastralNo: d.cadastralNo, hasBalcony: d.hasBalcony, hasCellar: d.hasCellar, hasParking: d.hasParking,
    purchaseDate: new Date(d.purchaseDate),
    purchasePrice: d.purchasePrice, acquisitionCosts: d.acquisitionCosts,
    renovationCosts: d.renovationCosts, landShareValue: d.landShareValue,
    depreciationGroup: d.depreciationGroup, depreciationMethod: d.depreciationMethod,
    depreciationStart: new Date(d.purchaseDate).getFullYear(),
    status: d.status, notes: d.notes,
  };

  let saved;
  if (id) {
    saved = await prisma.property.update({ where: { id }, data });
  } else {
    saved = await prisma.property.create({ data });

    // Pri zakladani se vlastnik vybira — nemusi jim byt ten, kdo zaznam vytvoril
    if (d.ownerId) {
      const podil = Math.max(0, Math.min(100, d.ownerShare || 100));
      await prisma.propertyOwner.create({
        data: { propertyId: saved.id, userId: d.ownerId, share: podil },
      });
    }
  }

  revalidatePath("/");
  revalidatePath("/properties");
  redirect(`/properties/${saved.id}`);
}

export async function deleteProperty(id: string): Promise<void> {
  const user = await getSession();
  if (!user || user.role !== "OWNER") throw new Error("Nedostatečné oprávnění");

  await prisma.property.delete({ where: { id } });
  revalidatePath("/");
  revalidatePath("/properties");
  redirect("/properties");
}

/**
 * Vyradi nabidku z odhadu, nebo ji zase vrati.
 *
 * Nejblizsi nabidka nemusi byt srovnatelna — byt v Bohusovicich se poměřuje
 * s Roudnici, ktera je drazsi, a odhad to zvedne. Rozhodnout, co do porovnani
 * nepatri, umi jen clovek, ktery to misto zna.
 */
export async function prepniVyrazeni(
  propertyId: string,
  klic: string,
  popis: string,
): Promise<void> {
  const user = await getSession();
  if (!user || user.role !== "OWNER") throw new Error("Nedostatečné oprávnění");

  const [source, externalId] = klic.split("|");
  if (!source || !externalId) throw new Error("Neplatná nabídka");

  const existujici = await prisma.excludedListing.findUnique({
    where: { propertyId_source_externalId: { propertyId, source, externalId } },
  });

  if (existujici) {
    await prisma.excludedListing.delete({ where: { id: existujici.id } });
  } else {
    await prisma.excludedListing.create({
      // Popis si drzime, protoze inzerat casem z trhu zmizi a uzivatel by
      // pak nepoznal, co vlastne vyradil
      data: { propertyId, source, externalId, popis: popis.slice(0, 200) },
    });
  }

  // Prepocitame hned — cekat na nocni sken by u rucniho zasahu bylo pozde.
  // Snimek zustava netknuty, meni se jen zaver.
  await prepocitejPoVyrazeni(propertyId);

  revalidatePath(`/properties/${propertyId}`);
  revalidatePath("/");
  revalidatePath("/properties");
}

/** Co se ma pri uklidu smazat. */
export type RozsahUklidu = "vse" | "nesouvisejici";

export interface VysledekUklidu {
  oceneni: number;
  najmy: number;
  nabidky: number;
  skeny: number;
  denik: number;
}

/**
 * Uklid dat z trhu.
 *
 * "vse" smaze vsechny odhady i stazene nabidky — hodi se, kdyz se zmenila
 * pravidla srovnavani a stara data uz jen matou. Rucne zadana oceneni
 * zustavaji vzdy: ta aplikace nevyrobila a nema pravo je zahodit.
 *
 * "nesouvisejici" nechá data, ktera k necemu patri, a smaze zbytek: nabidky
 * z obci, ktere si uzivatel u sve nemovitosti zakazal, nabidky z kategorii
 * a mest, ktera uz zadna nemovitost nema, a odhady po smazanych jednotkach.
 */
export async function uklidTrznichDat(rozsah: RozsahUklidu): Promise<VysledekUklidu> {
  const user = await getSession();
  if (!user || user.role !== "OWNER") throw new Error("Nedostatečné oprávnění");

  const vysledek: VysledekUklidu = { oceneni: 0, najmy: 0, nabidky: 0, skeny: 0, denik: 0 };

  if (rozsah === "vse") {
    // Rucni a znalecka oceneni nechavame — aplikace je nevyrobila
    vysledek.oceneni = (await prisma.valuation.deleteMany({ where: { source: "MARKET_SCAN" } })).count;
    vysledek.najmy = (await prisma.rentEstimate.deleteMany({ where: { source: "MARKET_SCAN" } })).count;
    vysledek.nabidky = (await prisma.marketListing.deleteMany({})).count;
    vysledek.skeny = (await prisma.marketScan.deleteMany({})).count;
    revalidatePath("/");
    revalidatePath("/properties");
    revalidatePath("/market");
    return vysledek;
  }

  const nemovitosti = await prisma.property.findMany({
    select: { id: true, city: true, type: true, excludedCities: true },
  });

  // Nabidky z obci, ktere si uzivatel zakazal, uz do zadneho odhadu nevstoupi
  const zakazane = new Set<string>();
  for (const p of nemovitosti) {
    for (const m of rozdelMesta(p.excludedCities)) zakazane.add(m.toLowerCase());
  }
  if (zakazane.size > 0) {
    const kandidati = await prisma.marketListing.findMany({ select: { id: true, city: true, district: true } });
    const kSmazani = kandidati
      .filter((n) => {
        const kde = `${n.city} ${n.district ?? ""}`.toLowerCase();
        return [...zakazane].some((z) => kde.includes(z));
      })
      .map((n) => n.id);
    if (kSmazani.length > 0) {
      vysledek.nabidky += (await prisma.marketListing.deleteMany({ where: { id: { in: kSmazani } } })).count;
    }
  }

  // Nabidky v kategoriich, ktere uz zadna nemovitost nema
  const kategorie = [...new Set(nemovitosti.map((p) => p.type))];
  vysledek.nabidky += (await prisma.marketListing.deleteMany({
    where: { category: { notIn: kategorie.length ? kategorie : ["—"] } },
  })).count;

  // Skeny, po kterych uz nezbyla zadna nabidka
  vysledek.skeny = (await prisma.marketScan.deleteMany({ where: { listings: { none: {} } } })).count;

  // Denik starsi 30 dnu — provozni zaznam, ne data
  const hranice = new Date();
  hranice.setDate(hranice.getDate() - 30);
  vysledek.denik = (await prisma.scanRun.deleteMany({ where: { startedAt: { lt: hranice } } })).count;

  revalidatePath("/");
  revalidatePath("/properties");
  revalidatePath("/market");
  revalidatePath("/sprava");
  return vysledek;
}
