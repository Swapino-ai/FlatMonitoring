import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { MAX_OKRUH_KM, obalkaOkruhu, okruhyProTyp, vzdalenostKm } from "../geo";
import { srealitySource } from "./sreality";
import type { MarketSource, ScanQuery, ScrapedListing } from "./types";

/**
 * Bezrealitky mezi zdroji nejsou zamerne. Jejich vypis se sklada az v prohlizeci
 * z mapy — server vraci pod kazdou adresou tychz patnact zahranicnich nabidek
 * v eurech (overeno peti variantami dotazu). Z HTML z nich ceske nabidky nedostaneme.
 */
export const SOURCES: MarketSource[] = [srealitySource];

export interface ScanResult {
  source: string;
  status: "OK" | "PARTIAL" | "FAILED";
  count: number;
  message?: string;
}

/** Spusti sken pro jednu poptavku napric vsemi zdroji a ulozi vysledky. */
export async function runScan(query: ScanQuery): Promise<ScanResult[]> {
  const results: ScanResult[] = [];

  for (const source of SOURCES) {
    try {
      const listings = await source.fetchListings(query);
      const status = listings.length === 0 ? "PARTIAL" : "OK";
      await persist(source.name, status, listings, listings.length === 0 ? "Zdroj nevrátil žádné nabídky — v této obci a kategorii buď nic není, nebo se změnila struktura webu." : undefined, query.region);
      results.push({ source: source.name, status, count: listings.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await persist(source.name, "FAILED", [], message, query.region);
      results.push({ source: source.name, status: "FAILED", count: 0, message });
    }
  }

  return results;
}

async function persist(source: string, status: string, listings: ScrapedListing[], message?: string, region?: string) {
  await prisma.marketScan.create({
    data: {
      source,
      status,
      message,
      listings: {
        create: listings.map((l) => ({
          source: l.source,
          externalId: l.externalId,
          dealType: l.dealType,
          category: l.category,
          city: l.city,
          region: region ?? null,
          district: l.district,
          disposition: l.disposition,
          areaM2: l.areaM2,
          price: l.price,
          pricePerM2: l.pricePerM2,
          url: l.url,
          latitude: l.latitude,
          longitude: l.longitude,
        })),
      },
    },
  });
}

export interface ComparableStats {
  count: number;
  medianPricePerM2: number;
  p25: number;
  p75: number;
  medianPrice: number;
  /** Konkretni nabidky, ze kterych medián vznikl — kvuli dolozitelnosti. */
  listings: SrovnatelnaNabidka[];
  /** V jakem okruhu se nakonec hledalo. Null = hledalo se podle mesta. */
  okruhKm: number | null;
  /**
   * Neslo najit dost nabidek se stejnou dispozici, takze se porovnavalo jen
   * podle plochy. Odhad tim ztraci presnost a musi to byt videt.
   */
  dispoziceUvolnena: boolean;
  /** Nejblizsi vychozi okruh pro dany druh — proti nemu se pozna rozsireni. */
  vychoziOkruhKm: number | null;
}

/** Snimek jedne nabidky ukladany k oceneni. */
export interface SrovnatelnaNabidka {
  disposition: string | null;
  areaM2: number | null;
  price: number;
  pricePerM2: number;
  district: string | null;
  url: string | null;
  source: string;
  scrapedAt: string;
  /** Vzdusna vzdalenost od nemovitosti. Null = nabidka nema souradnice. */
  vzdalenostKm: number | null;
  /**
   * Je nabidka primo z lokality, nebo az z rozsireneho okruhu? Pocita se pri
   * skenu a uklada do snimku — pozdeji uz vychozi okruh znat nemusime.
   */
  zLokality: boolean;
}

/** Statistika srovnatelnych nabidek z poslednich skenu. */
export async function comparableStats(opts: {
  city: string;
  district?: string | null;
  dealType: "SALE" | "RENT";
  /** Bez ni by se do mediánu bytu dostala garáž podobné plochy. */
  category?: string;
  areaM2: number;
  disposition?: string | null;
  sinceDays?: number;
  /**
   * Kolik nabidek staci. Tri jsou minimum, aby median neco znamenal — u najmu
   * v malem meste ale i jedina nabidka nese informaci, kterou si chce clovek
   * prokliknout. Kdo snizi prah, musi vysledek podle toho i oznacit.
   */
  minVzorek?: number;
  /**
   * Souradnice nemovitosti. Kdyz je mame, hledame v okruhu misto podle nazvu
   * ctvrti — byt na hranici dvou ctvrti ma bliz k nabidkam za rohem nez
   * k druhemu konci "sve" ctvrti.
   */
  latitude?: number | null;
  longitude?: number | null;
  /** Kraj — záchrana pro nemovitost bez souřadnic, když se skenoval kraj. */
  region?: string | null;
  okruhKm?: number;
  /**
   * Kolik nabidek staci, aby se okruh dal prestat rozsirovat. Sken zacne
   * u nejuzsiho okruhu pro dany druh a rozsiruje, dokud jich tolik nema.
   */
  cilovyVzorek?: number;
}): Promise<ComparableStats | null> {
  const since = new Date();
  since.setDate(since.getDate() - (opts.sinceDays ?? 60));

  const tol = Math.max(10, opts.areaM2 * 0.25);

  // Hledani v okruhu: nejdriv hrubý předvýběr obdélníkem v databázi, přesný
  // kruh se dofiltruje až v paměti. Město ani čtvrť se pak nefiltrují —
  // sousední obec za hranicí je srovnatelnější než druhý konec toho samého
  // města.
  const stred = opts.latitude != null && opts.longitude != null
    ? { latitude: opts.latitude, longitude: opts.longitude }
    : null;
  // Pevny okruh jen kdyz si ho nekdo vyslovne vyzada; jinak zacneme u toho
  // nejuzsiho a rozsirujeme, dokud neni z ceho pocitat.
  const kroky = opts.okruhKm ? [opts.okruhKm] : okruhyProTyp(opts.category ?? "BYT");
  const nejsirsi = kroky[kroky.length - 1];
  // Stahneme jednou v nejsirsi obalce a zuzujeme az v pameti — opakovane
  // dotazy do databaze by delaly totez, jen pomaleji.
  const obalka = stred ? obalkaOkruhu(stred, nejsirsi) : null;

  const rows = await prisma.marketListing.findMany({
    where: {
      dealType: opts.dealType,
      category: opts.category ?? "BYT",
      scrapedAt: { gte: since },
      ...(obalka
        ? {
            latitude: { gte: obalka.latMin, lte: obalka.latMax },
            longitude: { gte: obalka.lonMin, lte: obalka.lonMax },
          }
        : opts.region
          // Kdyz se stahoval kraj misto obce, nabidky nesou jina mesta nez
          // nemovitost — shoda mesta by je vsechny zahodila.
          ? { OR: [{ city: opts.city }, { region: opts.region }] }
          : {
              city: opts.city,
              ...(opts.district ? { district: { contains: opts.district } } : {}),
            }),
      areaM2: { gte: opts.areaM2 - tol, lte: opts.areaM2 + tol },
      pricePerM2: { not: null },
    },
    select: {
      externalId: true, pricePerM2: true, price: true, areaM2: true, disposition: true,
      district: true, url: true, source: true, scrapedAt: true,
      latitude: true, longitude: true,
    },
    orderBy: { scrapedAt: "desc" },
  });

  // Kazdy sken uklada nove radky, takze tataz nabidka lezi v tabulce tolikrat,
  // kolikrat sken bezel — a do medianu by vstupovala tolikrat taky. Bereme
  // z kazde nabidky jen nejnovejsi zaznam (dotaz je razeny od nejnovejsiho).
  const videne = new Set<string>();
  const vsechny = rows.filter((r) => {
    // Bez externalId nezbyva nez identita podle ceny, plochy a ctvrti
    const klic = r.externalId
      ? `${r.source}|${r.externalId}`
      : `${r.source}|${r.price}|${r.areaM2}|${r.district}`;
    if (videne.has(klic)) return false;
    videne.add(klic);
    return true;
  });

  // Rozsirovani okruhu: bereme nejuzsi, ve kterem uz je dost nabidek. Kdyz se
  // nedosahne cile ani v nejsirsim, zustane nejsirsi — lepsi hruby odhad
  // z okoli nez zadny, jen to musi byt videt.
  const minimum = opts.minVzorek ?? 3;
  const cil = Math.max(minimum, opts.cilovyVzorek ?? 8);

  /** Projde okruhy od nejuzsiho a vrati ten, ve kterem uz je dost nabidek. */
  function vyberOkruh(kandidati: typeof vsechny) {
    if (!stred) return { vybrane: kandidati, okruh: null as number | null };

    const sVzdalenosti = kandidati
      .filter((r) => r.latitude != null && r.longitude != null)
      .map((r) => ({ r, km: vzdalenostKm(stred, { latitude: r.latitude!, longitude: r.longitude! }) }));

    let vybrane = sVzdalenosti;
    for (const k of kroky) {
      const v = sVzdalenosti.filter((x) => x.km <= k);
      vybrane = v;
      if (v.length >= cil) break;
    }

    // Hlasime nejuzsi okruh, ktery vybrane nabidky opravdu obsahuje. Kdyz se
    // cile nedosahne ani v nejsirsim, dobehl by cyklus do 50 km a tvrdil bychom
    // "rozsireno na 50 km", i kdyz vsechny nabidky lezi do tri.
    const nejdal = vybrane.reduce((m, x) => Math.max(m, x.km), 0);
    const okruh = kroky.find((k) => k >= nejdal) ?? kroky[kroky.length - 1];

    return { vybrane: vybrane.map((x) => x.r), okruh };
  }

  // Nejdriv zkusime shodnou dispozici. Kdyz se nic nenajde — treba 3+kk
  // v obci, kde zadne jine 3+kk na prodej neni — je lepsi porovnat podle
  // metru nez nemit odhad vubec. Uvolneni se ale musi ukazat.
  const shodnaDispozice = opts.disposition
    ? vsechny.filter((r) => r.disposition === opts.disposition)
    : vsechny;

  let { vybrane: unikatni, okruh: pouzityOkruh } = vyberOkruh(shodnaDispozice);
  let dispoziceUvolnena = false;

  if (unikatni.length < minimum && opts.disposition) {
    const sirsi = vyberOkruh(vsechny);
    if (sirsi.vybrane.length >= minimum) {
      unikatni = sirsi.vybrane;
      pouzityOkruh = sirsi.okruh;
      dispoziceUvolnena = true;
    }
  }

  if (unikatni.length < minimum) return null;

  const perM2 = unikatni.map((r) => r.pricePerM2!).sort((a, b) => a - b);
  const prices = unikatni.map((r) => r.price).sort((a, b) => a - b);

  return {
    count: unikatni.length,
    okruhKm: pouzityOkruh,
    vychoziOkruhKm: stred ? kroky[0] : null,
    dispoziceUvolnena,
    medianPricePerM2: quantile(perM2, 0.5),
    p25: quantile(perM2, 0.25),
    p75: quantile(perM2, 0.75),
    medianPrice: quantile(prices, 0.5),
    listings: [...unikatni].sort((a, b) => a.pricePerM2! - b.pricePerM2!).map((r) => {
      const km = stred && r.latitude != null && r.longitude != null
        ? vzdalenostKm(stred, { latitude: r.latitude, longitude: r.longitude })
        : null;
      return {
      disposition: r.disposition,
      areaM2: r.areaM2,
      price: r.price,
      pricePerM2: r.pricePerM2!,
      district: r.district,
      url: r.url,
      source: r.source,
      scrapedAt: r.scrapedAt.toISOString(),
      vzdalenostKm: km == null ? null : Math.round(km * 10) / 10,
      // Bez souradnic nevime, kde nabidka je — radsi ji za "z lokality"
      // nevydavame, nez bychom tvrdili neco, co nemuzeme doložit
      zLokality: km != null && kroky[0] != null && km <= kroky[0],
      };
    }),
  };
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
}

/**
 * Z medianu ceny za m² udela odhad hodnoty a ulozi jako Valuation.
 *
 * Zapisuje se jen pri zmene — sken bezi kazdou noc a shodne odhady by za rok
 * vyrobily 365 skoro stejnych radku, ve kterych by se skutecny vyvoj ztratil.
 */
export async function valuateFromMarket(
  propertyId: string,
  tolerancePct = 0.5,
): Promise<{ value: number; stats: ComparableStats; zapsano: boolean; duvod: string } | null> {
  const p = await prisma.property.findUnique({ where: { id: propertyId } });
  if (!p) return null;

  const stats = await comparableStats({
    city: p.city,
    district: p.district,
    dealType: "SALE",
    category: p.type,
    latitude: p.latitude,
    longitude: p.longitude,
    region: p.region,
    areaM2: p.areaM2,
    disposition: p.disposition ?? undefined,
  });
  if (!stats) return null;

  const value = Math.round(stats.medianPricePerM2 * p.areaM2);

  const posledni = await prisma.valuation.findFirst({
    where: { propertyId, source: "MARKET_SCAN" },
    orderBy: { date: "desc" },
  });

  if (posledni) {
    const zmena = Math.abs((value - posledni.value) / posledni.value) * 100;
    const stejnyDen = posledni.date.toDateString() === new Date().toDateString();
    if (stejnyDen || zmena < tolerancePct) {
      return {
        value, stats, zapsano: false,
        duvod: stejnyDen ? "dnes už oceněno" : `změna jen ${zmena.toFixed(2)} %`,
      };
    }
  }

  await prisma.valuation.create({
    data: {
      propertyId: p.id,
      value,
      pricePerM2: stats.medianPricePerM2,
      source: "MARKET_SCAN",
      confidence: spolehlivost(stats.count, stats.okruhKm, stats.vychoziOkruhKm, stats.dispoziceUvolnena),
      sampleSize: stats.count,
      // Snimek necháváme u oceneni — inzeraty z trhu casem zmizi, doklad musi zustat
      comparables: stats.listings as unknown as Prisma.InputJsonValue,
      notes: `Medián ${Math.round(stats.medianPricePerM2).toLocaleString("cs-CZ")} Kč/m² z ${stats.count} nabídek (mezikvartilové rozpětí ${Math.round(stats.p25).toLocaleString("cs-CZ")}–${Math.round(stats.p75).toLocaleString("cs-CZ")} Kč/m²). Nabídkové ceny, realizované bývají nižší.` + okruhPopis(stats),
    },
  });

  return { value, stats, zapsano: true, duvod: posledni ? "změna nad tolerancí" : "první ocenění" };
}

export type { ScanQuery, ScrapedListing } from "./types";


/**
 * Odhad trzniho najemneho ze srovnatelnych nabidek a jeho zapis do historie.
 *
 * Najem se sleduje denne, protoze na rozdil od prodejni ceny reaguje rychle
 * — sezonne i na zmeny nabidky ve ctvrti.
 *
 * Zapisuje se jen pri zmene — jinak by denni sken za rok vyrobil 365 shodnych
 * radku a historie by se v nich ztratila.
 */
/**
 * Pod tri nabidky uz to neni odhad, jen ukazka — at to karta rekne nahlas.
 * Siroky okruh spolehlivost snizuje: nabidky dvacet kilometru daleko uz
 * nevypovidaji o teto ctvrti, i kdyz jich je hodne.
 */
function spolehlivost(pocet: number, okruhKm?: number | null, vychozi?: number | null, dispoziceUvolnena = false): string {
  let stupen = pocet >= 15 ? 3 : pocet >= 7 ? 2 : pocet >= 3 ? 1 : 0;
  if (dispoziceUvolnena) stupen -= 1;
  if (okruhKm != null && vychozi != null && okruhKm >= vychozi * 4) stupen -= 1;
  else if (okruhKm != null && vychozi != null && okruhKm >= vychozi * 2) stupen = Math.min(stupen, 2);
  return ["ORIENTACNI", "LOW", "MEDIUM", "HIGH"][Math.max(0, stupen)];
}

/** Doveta o okruhu do poznamky — at je z historie poznat, odkud se bralo. */
function okruhPopis(stats: ComparableStats): string {
  const dispozice = stats.dispoziceUvolnena
    ? " Se stejnou dispozicí se nic nenašlo, porovnává se jen podle plochy."
    : "";
  if (stats.okruhKm == null) return dispozice;
  const siroky = stats.vychoziOkruhKm != null && stats.okruhKm > stats.vychoziOkruhKm;
  return (siroky
    ? ` Okruh rozšířen na ${stats.okruhKm} km, protože blíž nebylo dost nabídek.`
    : ` Okruh ${stats.okruhKm} km.`) + dispozice;
}

export async function odhadniNajemPriZmene(
  propertyId: string,
  tolerancePct = 1,
): Promise<{ monthlyRent: number; stats: ComparableStats; zapsano: boolean; duvod: string } | null> {
  const p = await prisma.property.findUnique({ where: { id: propertyId } });
  if (!p) return null;

  const stats = await comparableStats({
    city: p.city,
    district: p.district,
    dealType: "RENT",
    category: p.type,
    latitude: p.latitude,
    longitude: p.longitude,
    region: p.region,
    areaM2: p.areaM2,
    disposition: p.disposition ?? undefined,
    sinceDays: 30, // najem se meni rychleji nez prodejni cena
    // I jedina nabidka je zaznam, ktery si chce clovek prokliknout. Ze z toho
    // median nevznikne, rekne spolehlivost nize.
    minVzorek: 1,
  });
  if (!stats) return null;

  // Median za m² nasobime plochou — je stabilnejsi nez median celkoveho najmu,
  // protoze srovnatelne byty se ve velikosti stejne lisi
  const monthlyRent = Math.round(stats.medianPricePerM2 * p.areaM2);

  const posledni = await prisma.rentEstimate.findFirst({
    where: { propertyId, source: "MARKET_SCAN" },
    orderBy: { date: "desc" },
  });

  if (posledni) {
    const zmena = Math.abs((monthlyRent - posledni.monthlyRent) / posledni.monthlyRent) * 100;
    const stejnyDen = posledni.date.toDateString() === new Date().toDateString();
    if (stejnyDen || zmena < tolerancePct) {
      return {
        monthlyRent,
        stats,
        zapsano: false,
        duvod: stejnyDen ? "dnes už zapsáno" : `změna jen ${zmena.toFixed(2)} %`,
      };
    }
  }

  await prisma.rentEstimate.create({
    data: {
      propertyId: p.id,
      monthlyRent,
      rentPerM2: stats.medianPricePerM2,
      p25: stats.p25,
      p75: stats.p75,
      source: "MARKET_SCAN",
      sampleSize: stats.count,
      confidence: spolehlivost(stats.count, stats.okruhKm, stats.vychoziOkruhKm, stats.dispoziceUvolnena),
      comparables: stats.listings as unknown as Prisma.InputJsonValue,
      notes: (stats.count < 3
        ? `Jen ${stats.count === 1 ? "jediná nabídka" : `${stats.count} nabídky`} — na odhad je to málo, ber to jako ukázku trhu, ne jako cenu.`
        : `Medián ${Math.round(stats.medianPricePerM2).toLocaleString("cs-CZ")} Kč/m² měsíčně z ${stats.count} nabídek.`)
        + okruhPopis(stats),
    },
  });

  return { monthlyRent, stats, zapsano: true, duvod: posledni ? "změna nad tolerancí" : "první odhad" };
}
