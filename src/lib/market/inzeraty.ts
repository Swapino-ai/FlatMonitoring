/**
 * Databaze trhu: inzeraty, jejich historie cen a zarazeni k nemovitostem.
 *
 * Sken jen sbira a navrhuje. Do odhadu vstupuji jen inzeraty, ktere uzivatel
 * zaradil; odhad je median ceny za m² ze zarazenych za posledni 2 mesice krat plocha.
 */
import { prisma } from "../db";
import { okruhyProTyp } from "../geo";
import { denISO } from "../format";
import type { ScrapedListing } from "./types";
import { odhadZeZarazenych, ohodnot, median, vOkneOdhadu } from "./zarazeni";

/** Odhad z nabidek, ktere se objevily za posledni 2 mesice (ve dnech). */
export const OKNO_ODHADU = 61;

/** Nemovitost, jejiz zarazene nabidky se pouzivaji (propojene oceneni), jinak ona sama. */
export async function korenOceneni(propertyId: string): Promise<string> {
  const p = await prisma.property.findUnique({ where: { id: propertyId }, select: { oceneniPodle: true } });
  return p?.oceneniPodle ?? propertyId;
}

/** Vsechny nemovitosti oceňované spolecne s korenem (vcetne nej). */
export async function clenoveOceneni(koren: string): Promise<string[]> {
  const navazane = await prisma.property.findMany({ where: { oceneniPodle: koren }, select: { id: true } });
  return [koren, ...navazane.map((p) => p.id)];
}

/** Prepocita odhad prodeje i najmu u vsech propojenych nemovitosti. */
export async function aktualizujSkupinu(propertyId: string) {
  for (const id of await clenoveOceneni(await korenOceneni(propertyId))) {
    await aktualizujOdhad(id, "SALE");
    await aktualizujOdhad(id, "RENT");
  }
}

/** Ulozi vysledky skenu: novy inzerat zalozi, znamy aktualizuje (cena jen pri zmene). Vraci pocet novych. */
export async function ulozInzeraty(listings: ScrapedListing[], region?: string | null): Promise<{ novych: number; zmenCeny: number; ids: string[] }> {
  const ids: string[] = [];
  let novych = 0;
  let zmenCeny = 0;
  const ted = new Date();
  for (const l of listings) {
    if (!l.externalId) continue;
    const existujici = await prisma.inzerat.findUnique({ where: { source_externalId: { source: l.source, externalId: l.externalId } } });
    if (!existujici) {
      const novy = await prisma.inzerat.create({
        data: {
          source: l.source, externalId: l.externalId, dealType: l.dealType, category: l.category,
          city: l.city, region: region ?? null, district: l.district ?? null, disposition: l.disposition ?? null,
          areaM2: l.areaM2 ?? null, price: l.price, pricePerM2: l.pricePerM2 ?? null, url: l.url ?? null,
          latitude: l.latitude ?? null, longitude: l.longitude ?? null,
          ceny: { create: { price: l.price, pricePerM2: l.pricePerM2 ?? null } },
        },
      });
      ids.push(novy.id);
      novych++;
      continue;
    }
    const zmena = Math.abs(existujici.price - l.price) >= 1;
    await prisma.inzerat.update({
      where: { id: existujici.id },
      data: {
        lastSeenAt: ted, zmizelAt: null,
        ...(zmena ? { price: l.price, pricePerM2: l.pricePerM2 ?? existujici.pricePerM2, ceny: { create: { price: l.price, pricePerM2: l.pricePerM2 ?? null } } } : {}),
        // Odkaz a polohu doplnime, kdyz chybely; rucne urcenou polohu neprepisujeme
        ...(l.url && !existujici.url ? { url: l.url } : {}),
        ...(!existujici.polohaRucne && l.latitude != null ? { latitude: l.latitude, longitude: l.longitude ?? null } : {}),
      },
    });
    if (zmena) zmenCeny++;
    ids.push(existujici.id);
  }
  return { novych, zmenCeny, ids };
}

function rozdelMesta(seznam: string | null | undefined): string[] {
  return (seznam ?? "").split(",").map((m) => m.trim().toLowerCase()).filter(Boolean);
}

export interface StatistikaNavrhu {
  /** Kolik inzeratu prislo v uvahu (stejny druh, obec, kraj nebo nalezeno skenem teto nemovitosti) */
  kandidatu: number;
  /** O kterych uz je rozhodnuto (navrh, zarazeno, vyrazeno) */
  uzZname: number;
  novych: number;
  daleko: number;
  velikost: number;
  vylouceneObce: number;
  zmizelych: number;
}

/**
 * Navrhne nemovitosti inzeraty z databaze, o kterych jeste nerozhodla.
 * Kandidati: vse, co nasel sken teto nemovitosti (ids), plus stejny druh z obce nebo kraje.
 * S `zapsat: false` jen spocita, proc co (ne)prislo do navrhu — pro vysvetleni na strance.
 */
export async function navrhniProNemovitost(propertyId: string, o: { ids?: string[]; zapsat?: boolean } = {}): Promise<StatistikaNavrhu> {
  const st: StatistikaNavrhu = { kandidatu: 0, uzZname: 0, novych: 0, daleko: 0, velikost: 0, vylouceneObce: 0, zmizelych: 0 };
  const zapsat = o.zapsat !== false;
  const p = await prisma.property.findUnique({ where: { id: propertyId } });
  if (!p || (zapsat && !p.sledovatTrh)) return st;
  const okruhKm = p.scanRadiusKm ?? okruhyProTyp(p.type)[0];
  const vyloucene = rozdelMesta(p.excludedCities);

  const znamych = new Set((await prisma.zarazeniInzeratu.findMany({ where: { propertyId }, select: { inzeratId: true } })).map((z) => z.inzeratId));
  const kandidati = await prisma.inzerat.findMany({
    where: {
      OR: [
        ...(o.ids?.length ? [{ id: { in: o.ids } }] : []),
        { category: p.type, city: { equals: p.city, mode: "insensitive" as const } },
        ...(p.region ? [{ category: p.type, region: p.region }] : []),
      ],
    },
  });
  st.kandidatu = kandidati.length;

  for (const dealType of ["SALE", "RENT"] as const) {
    const zarazene = await prisma.zarazeniInzeratu.findMany({
      where: { propertyId, stav: "ZARAZENO", inzerat: { dealType } }, include: { inzerat: true },
    });
    const medianZar = zarazene.length ? median(zarazene.map((z) => z.inzerat.pricePerM2 ?? 0).filter((x) => x > 0)) : null;
    for (const i of kandidati.filter((k) => k.dealType === dealType)) {
      if (znamych.has(i.id)) { st.uzZname++; continue; }
      if (i.zmizelAt) { st.zmizelych++; continue; }
      if (vyloucene.some((m) => i.city.toLowerCase().includes(m))) { st.vylouceneObce++; continue; }
      const h = ohodnot(
        { areaM2: p.areaM2, disposition: p.disposition, latitude: p.latitude, longitude: p.longitude, city: p.city, okruhKm },
        i, medianZar || null,
      );
      if (h.mimo) { if (h.duvod.startsWith("plocha")) st.velikost++; else st.daleko++; continue; }
      if (zapsat) {
        await prisma.zarazeniInzeratu.create({
          data: { propertyId, inzeratId: i.id, stav: "NAVRH", skore: h.skore, doporuceno: h.doporuceno, duvod: h.duvod },
        });
      }
      st.novych++;
    }
  }
  return st;
}

/** Snimek nabidek pro zaznam oceneni (stejny tvar jako u starsich oceneni, at je zobrazi i mapa). */
function snimekNabidek(inzeraty: { source: string; externalId: string; disposition: string | null; areaM2: number | null; price: number; pricePerM2: number | null; district: string | null; city: string; url: string | null; latitude: number | null; longitude: number | null; lastSeenAt: Date }[]) {
  return inzeraty.map((i) => ({
    disposition: i.disposition, areaM2: i.areaM2, price: i.price, pricePerM2: i.pricePerM2 ?? 0,
    district: i.district ?? i.city, url: i.url, source: i.source, scrapedAt: i.lastSeenAt.toISOString(),
    klic: `${i.source}|${i.externalId}`, latitude: i.latitude, longitude: i.longitude, zLokality: true,
  }));
}

/**
 * Prepocita odhad ze zarazenych za posledni 2 mesice a zapise ho do historie (oceneni nebo
 * odhad najmu), kdyz se zmenil. Vraci novy odhad, nebo null, kdyz nic zarazeneho neni.
 */
export async function aktualizujOdhad(propertyId: string, dealType: "SALE" | "RENT") {
  const p = await prisma.property.findUnique({ where: { id: propertyId }, select: { areaM2: true } });
  if (!p) return null;
  // Propojene oceneni: nabidky se berou od korene, plocha je vlastni
  const zdroj = await korenOceneni(propertyId);
  const zarazene = await prisma.zarazeniInzeratu.findMany({
    where: { propertyId: zdroj, stav: "ZARAZENO", inzerat: { dealType } }, include: { inzerat: true },
  });
  const body = zarazene.map((z) => ({ datum: denISO(z.inzerat.firstSeenAt), pricePerM2: z.inzerat.pricePerM2 ?? 0, i: z.inzerat }));
  const odhad = odhadZeZarazenych(body, p.areaM2, OKNO_ODHADU);
  if (!odhad) return null;
  const pouzite = vOkneOdhadu(body, OKNO_ODHADU).map((b) => b.i);
  const perM2 = pouzite.map((i) => i.pricePerM2 ?? 0).sort((a, b) => a - b);
  const kvantil = (q: number) => perM2[Math.min(perM2.length - 1, Math.floor((perM2.length - 1) * q))];

  if (dealType === "SALE") {
    const posledni = await prisma.valuation.findFirst({ where: { propertyId }, orderBy: { date: "desc" } });
    if (posledni?.source === "VYBER" && Math.abs(posledni.value - odhad.hodnota) < 1 && posledni.sampleSize === odhad.pocet) return odhad;
    await prisma.valuation.create({
      data: {
        propertyId, value: odhad.hodnota, pricePerM2: odhad.perM2, source: "VYBER",
        confidence: odhad.pocet >= 5 ? "HIGH" : odhad.pocet >= 3 ? "MEDIUM" : "LOW",
        sampleSize: odhad.pocet, comparables: snimekNabidek(pouzite),
        notes: `Medián z ${odhad.pocet} zařazených nabídek za poslední 2 měsíce`,
      },
    });
  } else {
    const posledni = await prisma.rentEstimate.findFirst({ where: { propertyId }, orderBy: { date: "desc" } });
    if (posledni?.source === "VYBER" && Math.abs(posledni.monthlyRent - odhad.hodnota) < 1 && posledni.sampleSize === odhad.pocet) return odhad;
    await prisma.rentEstimate.create({
      data: {
        propertyId, monthlyRent: odhad.hodnota, rentPerM2: odhad.perM2, p25: kvantil(0.25), p75: kvantil(0.75),
        source: "VYBER", confidence: odhad.pocet >= 5 ? "HIGH" : odhad.pocet >= 3 ? "MEDIUM" : "LOW",
        sampleSize: odhad.pocet, comparables: snimekNabidek(pouzite),
        notes: `Medián z ${odhad.pocet} zařazených nabídek za poslední 2 měsíce`,
      },
    });
  }
  return odhad;
}
