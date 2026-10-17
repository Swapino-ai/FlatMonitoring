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
import { profilTypu } from "./profily";
import { PRAH_SHODY, podlaziZUdaju, podobnostBytu, type InzeratProShodu } from "./shody";
import { cenaVJednotce, jednotkaOdhadu, odhadNaM2, odhadZeZarazenych, ohodnot, median, vOkneOdhadu, vahaZarazeni } from "./zarazeni";

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
  // Kazda nemovitost a typ nabidky nezavisle — soubezne, at uprava na strance neceka
  const clenove = await clenoveOceneni(await korenOceneni(propertyId));
  await Promise.all(clenove.flatMap((id) => [aktualizujOdhad(id, "SALE"), aktualizujOdhad(id, "RENT")]));
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

/**
 * Okruh hledani: zaklad a tvrda hranice. Rucne nastaveny okruh je pevny; automaticky
 * zacina podle druhu (byt 3 km) a smi se rozsirit nejvys na 4× (max. 15 km).
 */
export function okruhNemovitosti(p: { type: string; scanRadiusKm: number | null }): { zaklad: number; max: number; pevny: boolean } {
  if (p.scanRadiusKm) return { zaklad: p.scanRadiusKm, max: p.scanRadiusKm, pevny: true };
  const zaklad = okruhyProTyp(p.type)[0];
  return { zaklad, max: Math.min(15, zaklad * 4), pevny: false };
}

export interface StatistikaNavrhu {
  /** Kolik inzeratu prislo v uvahu */
  kandidatu: number;
  /** O kterych uz je rozhodnuto (navrh, zarazeno, vyrazeno) */
  uzZname: number;
  novych: number;
  daleko: number;
  velikost: number;
  jinaDispozice: number;
  vylouceneObce: number;
  zmizelych: number;
  /** Starsi navrhy, ktere uz pravidlum nevyhovuji, smazane */
  odebrano: number;
}

/**
 * Navrhne nemovitosti inzeraty z databaze, o kterych jeste nerozhodla.
 * Pravidla: stejny druh i dispozice, plocha ±25 %, do okruhu (bez polohy jen stejna obec),
 * ne z vyloucenych obci. Starsi navrhy, ktere uz nevyhovuji, se pri tom odeberou.
 * S `zapsat: false` jen spocita, proc co (ne)prislo do navrhu.
 */
export async function navrhniProNemovitost(propertyId: string, o: { ids?: string[]; zapsat?: boolean } = {}): Promise<StatistikaNavrhu> {
  const st: StatistikaNavrhu = { kandidatu: 0, uzZname: 0, novych: 0, daleko: 0, velikost: 0, jinaDispozice: 0, vylouceneObce: 0, zmizelych: 0, odebrano: 0 };
  const zapsat = o.zapsat !== false;
  const p = await prisma.property.findUnique({ where: { id: propertyId } });
  if (!p || (zapsat && !p.sledovatTrh)) return st;
  const { zaklad, max } = okruhNemovitosti(p);
  const vyloucene = rozdelMesta(p.excludedCities);
  // Pravidla podle profilu typu: dispozice jen u bytu, tolerance plochy podle typu
  const profil = profilTypu(p.type);
  const { zaKus } = jednotkaOdhadu(p.type, p.areaM2);
  const nem = {
    areaM2: p.areaM2, disposition: p.disposition, latitude: p.latitude, longitude: p.longitude, city: p.city, okruhKm: zaklad, maxKm: max,
    tolerancePlochy: profil.tolerancePlochy, stejnaDispozice: profil.stejnaDispozice,
  };

  const zname = await prisma.zarazeniInzeratu.findMany({ where: { propertyId }, include: { inzerat: true } });
  // Uklid: navrhy, ktere uz pravidlum nevyhovuji (zprisnena pravidla, vyloucena obec), zmizi
  const neplatne = zname.filter((z) => z.stav === "NAVRH" && (
    vyloucene.some((m) => z.inzerat.city.toLowerCase().includes(m)) || ohodnot(nem, z.inzerat, null).mimo
  ));
  if (zapsat && neplatne.length) {
    await prisma.zarazeniInzeratu.deleteMany({ where: { id: { in: neplatne.map((z) => z.id) } } });
    st.odebrano = neplatne.length;
  }
  const znamych = new Set(zname.filter((z) => !neplatne.includes(z) || !zapsat).map((z) => z.inzeratId));

  // Kandidati: co nasel sken teto nemovitosti, plus stejny druh z obce nebo s polohou (vzdalenost rozhodne)
  const kandidati = await prisma.inzerat.findMany({
    where: {
      OR: [
        ...(o.ids?.length ? [{ id: { in: o.ids } }] : []),
        { category: p.type, city: { equals: p.city, mode: "insensitive" as const } },
        ...(p.latitude != null ? [{ category: p.type, latitude: { not: null } }] : []),
      ],
    },
  });

  st.kandidatu = kandidati.length;
  for (const dealType of ["SALE", "RENT"] as const) {
    const zarazene = zname.filter((z) => z.stav === "ZARAZENO" && z.inzerat.dealType === dealType);
    // Extremni cena proti zarazenym — u garazi za kus, jinak za m²
    const medianZar = zarazene.length ? median(zarazene.map((z) => cenaVJednotce(z.inzerat, zaKus)).filter((x) => x > 0)) : null;
    for (const i of kandidati.filter((k) => k.dealType === dealType)) {
      if (znamych.has(i.id)) { st.uzZname++; continue; }
      if (i.zmizelAt) { st.zmizelych++; continue; }
      if (vyloucene.some((m) => i.city.toLowerCase().includes(m))) { st.vylouceneObce++; continue; }
      const h = ohodnot(nem, { ...i, pricePerM2: cenaVJednotce(i, zaKus) }, medianZar || null);
      if (h.mimo) {
        if (h.duvod.startsWith("plocha")) st.velikost++;
        else if (h.duvod.startsWith("dispozice")) st.jinaDispozice++;
        else st.daleko++;
        continue;
      }
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
function snimekNabidek(inzeraty: { source: string; externalId: string; disposition: string | null; areaM2: number | null; price: number; pricePerM2: number | null; district: string | null; city: string; url: string | null; latitude: number | null; longitude: number | null; lastSeenAt: Date; fotkyUrl: string[]; vaha: number }[]) {
  return inzeraty.map((i) => ({
    fotka: i.fotkyUrl[0] ?? null, vaha: i.vaha,
    disposition: i.disposition, areaM2: i.areaM2, price: i.price, pricePerM2: i.pricePerM2 ?? 0,
    district: i.district ?? i.city, url: i.url, source: i.source, scrapedAt: i.lastSeenAt.toISOString(),
    klic: `${i.source}|${i.externalId}`, latitude: i.latitude, longitude: i.longitude, zLokality: true,
  }));
}

/**
 * Prepocita odhad ze zarazenych za posledni 2 mesice a zapise ho do historie (oceneni nebo
 * odhad najmu), kdyz se zmenil. Vraci novy odhad, nebo null, kdyz nic zarazeneho neni.
 */
/** Zarazene nabidky nemovitosti (u propojeneho oceneni od korene) s vahami pro odhad. */
async function bodyOdhadu(propertyId: string, dealType: "SALE" | "RENT") {
  const p = await prisma.property.findUnique({ where: { id: propertyId }, select: { areaM2: true, type: true, typDomu: true, stavBytu: true, vlastnosti: true, city: true, latitude: true, longitude: true } });
  if (!p) return null;
  const { zaKus, plocha } = jednotkaOdhadu(p.type, p.areaM2);
  // Propojene oceneni: nabidky se berou od korene, plocha je vlastni
  const zdroj = await korenOceneni(propertyId);
  const zarazene = await prisma.zarazeniInzeratu.findMany({
    where: { propertyId: zdroj, stav: "ZARAZENO", inzerat: { dealType } }, include: { inzerat: true },
  });
  const body = zarazene.map((z) => ({
    datum: denISO(z.inzerat.firstSeenAt), pricePerM2: cenaVJednotce(z.inzerat, zaKus), i: z.inzerat,
    vaha: vahaZarazeni(p, z, z.inzerat),
  }));
  return { p, body, zaKus, plocha };
}

/** Aktualni odhad ze zarazenych nabidek (vazeny prumer i median), bez ukladani. */
export async function odhadNemovitosti(propertyId: string, dealType: "SALE" | "RENT") {
  const b = await bodyOdhadu(propertyId, dealType);
  return b ? odhadNaM2(odhadZeZarazenych(b.body, b.plocha, OKNO_ODHADU), b.zaKus, b.p.areaM2) : null;
}

export async function aktualizujOdhad(propertyId: string, dealType: "SALE" | "RENT") {
  const b = await bodyOdhadu(propertyId, dealType);
  if (!b) return null;
  const { p, body, zaKus, plocha } = b;
  const odhad = odhadZeZarazenych(body, plocha, OKNO_ODHADU);
  if (!odhad) return null;
  const pouzite = vOkneOdhadu(body, OKNO_ODHADU).map((b) => ({ ...b.i, vaha: b.vaha }));
  const perM2 = pouzite.map((i) => cenaVJednotce(i, zaKus)).sort((a, b) => a - b);
  // Do historie vzdy i skutecna cena za m² (u garaze z odhadu za kus)
  const naM2 = zaKus ? odhad.hodnota / (p.areaM2 || 1) : odhad.perM2;
  const kvantil = (q: number) => perM2[Math.min(perM2.length - 1, Math.floor((perM2.length - 1) * q))];

  // Jeden zaznam za den: behem dne (vic swipnuti) se dnesni zaznam jen prepisuje
  const zacatekDne = new Date(`${denISO(new Date())}T00:00:00Z`);
  const spolecne = {
    confidence: odhad.pocet >= 5 ? "HIGH" : odhad.pocet >= 3 ? "MEDIUM" : "LOW",
    sampleSize: odhad.pocet, comparables: snimekNabidek(pouzite),
    notes: zaKus
      ? `Vážený průměr cen za kus z ${odhad.pocet} zařazených nabídek za poslední 2 měsíce; vážený medián ${Math.round(odhad.median.hodnota).toLocaleString("cs-CZ")} Kč`
      : `Vážený průměr z ${odhad.pocet} zařazených nabídek za poslední 2 měsíce; vážený medián ${Math.round(odhad.median.hodnota).toLocaleString("cs-CZ")} Kč (${Math.round(odhad.median.perM2).toLocaleString("cs-CZ")} Kč/m²)`,
  };

  if (dealType === "SALE") {
    const dnesni = await prisma.valuation.findMany({ where: { propertyId, source: "VYBER", date: { gte: zacatekDne } }, orderBy: { date: "desc" } });
    if (dnesni.length) {
      await prisma.valuation.update({ where: { id: dnesni[0].id }, data: { value: odhad.hodnota, pricePerM2: naM2, date: new Date(), ...spolecne } });
      if (dnesni.length > 1) await prisma.valuation.deleteMany({ where: { id: { in: dnesni.slice(1).map((v) => v.id) } } });
      return odhad;
    }
    const posledni = await prisma.valuation.findFirst({ where: { propertyId }, orderBy: { date: "desc" } });
    if (posledni?.source === "VYBER" && Math.abs(posledni.value - odhad.hodnota) < 1 && posledni.sampleSize === odhad.pocet) return odhad;
    await prisma.valuation.create({ data: { propertyId, value: odhad.hodnota, pricePerM2: naM2, source: "VYBER", ...spolecne } });
  } else {
    const data = { monthlyRent: odhad.hodnota, rentPerM2: naM2, p25: kvantil(0.25), p75: kvantil(0.75), ...spolecne };
    const dnesni = await prisma.rentEstimate.findMany({ where: { propertyId, source: "VYBER", date: { gte: zacatekDne } }, orderBy: { date: "desc" } });
    if (dnesni.length) {
      await prisma.rentEstimate.update({ where: { id: dnesni[0].id }, data: { ...data, date: new Date() } });
      if (dnesni.length > 1) await prisma.rentEstimate.deleteMany({ where: { id: { in: dnesni.slice(1).map((v) => v.id) } } });
      return odhad;
    }
    const posledni = await prisma.rentEstimate.findFirst({ where: { propertyId }, orderBy: { date: "desc" } });
    if (posledni?.source === "VYBER" && Math.abs(posledni.monthlyRent - odhad.hodnota) < 1 && posledni.sampleSize === odhad.pocet) return odhad;
    await prisma.rentEstimate.create({ data: { propertyId, source: "VYBER", ...data } });
  }
  return odhad;
}

/** Udaje inzeratu pro porovnani "stejny byt" (patro a podlazi z AI parametru). */
function proShodu(i: { category: string; disposition: string | null; areaM2: number | null; city: string; district: string | null; latitude: number | null; longitude: number | null; parametry: unknown }): InzeratProShodu {
  const p = (i.parametry ?? {}) as { hodnoty?: { patro?: string }; patro?: string; info?: unknown; podlazi?: number };
  return {
    category: i.category, disposition: i.disposition, areaM2: i.areaM2, city: i.city, district: i.district,
    latitude: i.latitude, longitude: i.longitude,
    patro: p.hodnoty?.patro ?? null,
    podlazi: typeof p.podlazi === "number" ? p.podlazi : podlaziZUdaju(p.info),
  };
}

/**
 * Hleda, jestli se navrzene nebo zarazene nabidky uz nekdy neobjevily jako jiny inzerat
 * (stejny byt). Porovnava se vsemi inzeraty v databazi, i zmizelymi. Nove pravdepodobne
 * shody ulozi jako navrh ke schvaleni; o jednou rozhodnutych parech uz znovu nenavrhuje.
 */
export async function najdiShody(): Promise<{ porovnano: number; novych: number }> {
  const sledovane = await prisma.inzerat.findMany({ where: { zarazeni: { some: { stav: { in: ["NAVRH", "ZARAZENO"] } } }, areaM2: { not: null } } });
  const znamePary = new Set((await prisma.shodaInzeratu.findMany({ select: { inzeratId: true, drivejsiId: true } }))
    .flatMap((s) => [`${s.inzeratId}|${s.drivejsiId}`, `${s.drivejsiId}|${s.inzeratId}`]));
  let porovnano = 0, novych = 0;
  for (const a of sledovane) {
    const plocha = a.areaM2!;
    const kandidati = await prisma.inzerat.findMany({
      where: {
        id: { not: a.id }, category: a.category,
        ...(a.disposition ? { OR: [{ disposition: a.disposition }, { disposition: null }] } : {}),
        areaM2: { gte: plocha * 0.96, lte: plocha * 1.04 },
        AND: [{
          OR: [
            { city: { equals: a.city, mode: "insensitive" as const } },
            ...(a.latitude != null && a.longitude != null
              ? [{ latitude: { gte: a.latitude - 0.005, lte: a.latitude + 0.005 }, longitude: { gte: a.longitude - 0.008, lte: a.longitude + 0.008 } }]
              : []),
          ],
        }],
      },
    });
    for (const b of kandidati) {
      if (znamePary.has(`${a.id}|${b.id}`)) continue;
      porovnano++;
      const s = podobnostBytu(proShodu(a), proShodu(b));
      if (!s || s.skore < PRAH_SHODY) continue;
      // "Drivejsi" je ten, ktery se na trhu objevil driv
      const [novy, drivejsi] = a.firstSeenAt >= b.firstSeenAt ? [a, b] : [b, a];
      await prisma.shodaInzeratu.create({ data: { inzeratId: novy.id, drivejsiId: drivejsi.id, skore: s.skore, duvod: s.duvod } });
      znamePary.add(`${a.id}|${b.id}`); znamePary.add(`${b.id}|${a.id}`);
      novych++;
    }
  }
  return { porovnano, novych };
}
