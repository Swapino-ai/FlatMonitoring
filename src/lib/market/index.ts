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
  /** Kolik nabidek uzivatel z odhadu vyradil. */
  vyloucenoUzivatelem: number;
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

/**
 * Prepocita nejnovejsi oceneni a odhad najmu z jejich snimku bez vyrazenych
 * nabidek.
 *
 * Snimek zustava netknuty — je to doklad, ze ceho odhad vznikl, a prepisovat
 * ho zpetne by znamenalo menit historii. Meni se jen zaver: hodnota, cena za
 * m², velikost vzorku a spolehlivost.
 *
 * Bez toho by se vyrazeni projevilo az pri pristim skenu, coz je u rucniho
 * zasahu pozde — uzivatel chce videt dopad hned.
 */
export async function prepocitejPoVyrazeni(propertyId: string): Promise<{
  hodnota: number | null;
  najem: number | null;
  vyrazeno: number;
}> {
  const vyloucene = await nactiVyloucene(propertyId);
  const p = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { areaM2: true },
  });
  if (!p) return { hodnota: null, najem: null, vyrazeno: vyloucene.size };

  /** Z snimku vytahne ceny za m² nabidek, ktere uzivatel nevyradil. */
  function zbyleCeny(comparables: unknown): number[] {
    if (!Array.isArray(comparables)) return [];
    return comparables
      .filter((n) => {
        const x = n as { klic?: string | null; url?: string | null; source?: string };
        // Starsi snimky klic nemaji, ale id inzeratu je na konci adresy
        const klic = x.klic
          ?? (typeof x.url === "string"
            ? (() => { const m = x.url.match(/\/(\d+)\/?$/); return m ? `${x.source ?? "SREALITY"}|${m[1]}` : null; })()
            : null);
        return !klic || !vyloucene.has(klic);
      })
      .map((n) => Number((n as { pricePerM2?: number }).pricePerM2))
      .filter((c) => Number.isFinite(c) && c > 0)
      .sort((a, b) => a - b);
  }

  const vysledek: { hodnota: number | null; najem: number | null; vyrazeno: number } = {
    hodnota: null, najem: null, vyrazeno: vyloucene.size,
  };

  // Rucni vyber je rozhodnuti uzivatele, ne statisticky vzorek. Kdyz nechal
  // jedinou nabidku, protoze zna mistni trh, je to jeho odpovednost — nemame
  // duvod mu do toho mluvit. Bez zasahu drzime minimum tri.
  const minimum = vyloucene.size > 0 ? 1 : 3;

  // --- Odhad hodnoty ---
  // Puvodni zaver skenu nikdy neprepisujeme: korekce je samostatny zaznam,
  // aby v historii zustalo videt "sken rekl X, po me korekci Y". Opakovane
  // klikani ale historii nezaplavi — uprava se drzi v jedinem zaznamu.
  const rucniOceneni = await prisma.valuation.findFirst({
    where: { propertyId, confidence: "RUCNI" },
    orderBy: { date: "desc" },
  });
  const skenOceneni = await prisma.valuation.findFirst({
    where: { propertyId, source: "MARKET_SCAN", confidence: { not: "RUCNI" } },
    orderBy: { date: "desc" },
  });

  if (vyloucene.size === 0) {
    // Vsechny nabidky vraceny — korekce uz nema smysl a plati zase sken
    if (rucniOceneni) await prisma.valuation.delete({ where: { id: rucniOceneni.id } });
  } else if (skenOceneni) {
    const ceny = zbyleCeny(skenOceneni.comparables);
    if (ceny.length >= minimum) {
      const zaM2 = quantile(ceny, 0.5);
      const hodnota = Math.round(zaM2 * p.areaM2);
      const data = {
        propertyId,
        value: hodnota,
        pricePerM2: zaM2,
        source: "MARKET_SCAN",
        confidence: "RUCNI",
        sampleSize: ceny.length,
        // Snimek prebirame ze skenu — doklad musi zustat i u korekce
        comparables: skenOceneni.comparables as Prisma.InputJsonValue,
        notes: `Ručně upraveno — počítáno z ${ceny.length} ${ceny.length === 1 ? "vybrané nabídky" : "vybraných nabídek"}, ${vyloucene.size} vyřazeno. Sken bez korekce: ${skenOceneni.value.toLocaleString("cs-CZ")} Kč.`,
      };
      if (rucniOceneni) await prisma.valuation.update({ where: { id: rucniOceneni.id }, data });
      else await prisma.valuation.create({ data });
      vysledek.hodnota = hodnota;
    }
  }

  // --- Odhad najmu, stejnym pravidlem ---
  const rucniNajem = await prisma.rentEstimate.findFirst({
    where: { propertyId, confidence: "RUCNI" },
    orderBy: { date: "desc" },
  });
  const skenNajem = await prisma.rentEstimate.findFirst({
    where: { propertyId, source: "MARKET_SCAN", confidence: { not: "RUCNI" } },
    orderBy: { date: "desc" },
  });

  if (vyloucene.size === 0) {
    if (rucniNajem) await prisma.rentEstimate.delete({ where: { id: rucniNajem.id } });
  } else if (skenNajem) {
    const ceny = zbyleCeny(skenNajem.comparables);
    if (ceny.length >= 1) {
      const zaM2 = quantile(ceny, 0.5);
      const mesicne = Math.round(zaM2 * p.areaM2);
      const data = {
        propertyId,
        monthlyRent: mesicne,
        rentPerM2: zaM2,
        source: "MARKET_SCAN",
        confidence: "RUCNI",
        sampleSize: ceny.length,
        comparables: skenNajem.comparables as Prisma.InputJsonValue,
        notes: `Ručně upraveno — počítáno z ${ceny.length} ${ceny.length === 1 ? "vybrané nabídky" : "vybraných nabídek"}, ${vyloucene.size} vyřazeno. Sken bez korekce: ${skenNajem.monthlyRent.toLocaleString("cs-CZ")} Kč/měs.`,
      };
      if (rucniNajem) await prisma.rentEstimate.update({ where: { id: rucniNajem.id }, data });
      else await prisma.rentEstimate.create({ data });
      vysledek.najem = mesicne;
    }
  }

  return vysledek;
}

/**
 * Nabidky z okoli k nahlednuti, kdyz na odhad nestacily.
 *
 * Filtry jsou zamerne volnejsi nez u odhadu — dispozice se neresi a plocha ma
 * dvojnasobnou toleranci. Do vypoctu nevstupuji, jde jen o to videt, co na trhu
 * je: "neni dost srovnatelnych nabidek" bez seznamu je tvrzeni, ktere si nejde
 * overit.
 */
export async function nabidkyVOkoli(
  propertyId: string,
  dealType: "SALE" | "RENT" = "SALE",
  limit = 12,
): Promise<SrovnatelnaNabidka[]> {
  const p = await prisma.property.findUnique({ where: { id: propertyId } });
  if (!p) return [];

  const since = new Date();
  since.setDate(since.getDate() - (dealType === "RENT" ? 30 : 60));
  const tol = Math.max(20, p.areaM2 * 0.5);
  const stred = p.latitude != null && p.longitude != null
    ? { latitude: p.latitude, longitude: p.longitude }
    : null;
  const obalka = stred ? obalkaOkruhu(stred, MAX_OKRUH_KM) : null;

  const rows = await prisma.marketListing.findMany({
    where: {
      dealType,
      category: p.type,
      scrapedAt: { gte: since },
      areaM2: { gte: p.areaM2 - tol, lte: p.areaM2 + tol },
      pricePerM2: { not: null },
      ...(obalka
        ? { latitude: { gte: obalka.latMin, lte: obalka.latMax }, longitude: { gte: obalka.lonMin, lte: obalka.lonMax } }
        : p.region
          ? { OR: [{ city: p.city }, { region: p.region }] }
          : { city: p.city }),
    },
    select: {
      externalId: true, pricePerM2: true, price: true, areaM2: true, disposition: true,
      district: true, url: true, source: true, scrapedAt: true, latitude: true, longitude: true,
    },
    orderBy: { scrapedAt: "desc" },
  });

  const videne = new Set<string>();
  const vychozi = okruhyProTyp(p.type)[0];

  return rows
    .filter((r) => {
      const klic = r.externalId ? `${r.source}|${r.externalId}` : `${r.source}|${r.price}|${r.areaM2}`;
      if (videne.has(klic)) return false;
      videne.add(klic);
      return true;
    })
    .map((r) => {
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
        klic: r.externalId ? `${r.source}|${r.externalId}` : null,
        vzdalenostKm: km == null ? null : Math.round(km * 10) / 10,
        zLokality: km != null && km <= vychozi,
      };
    })
    // Nejblizsi napred; bez souradnic az za nimi
    .sort((a, b) => (a.vzdalenostKm ?? 1e9) - (b.vzdalenostKm ?? 1e9))
    .slice(0, limit);
}

export interface KrokDiagnostiky {
  popis: string;
  pocet: number;
  /** Tady se vzorek ztratil — krok, po kterem uz nezbyly tri nabidky. */
  zlom: boolean;
}

/**
 * Proc u teto nemovitosti nevzniklo oceneni.
 *
 * Misto obecneho "malo nabidek" ukaze, kolik jich zbyva po kazdem filtru —
 * z toho je hned videt, jestli vadi plocha, dispozice, stari dat nebo to, ze
 * sken v obci nic nenasel.
 */
export async function diagnostikaOceneni(propertyId: string, dealType: "SALE" | "RENT" = "SALE"): Promise<KrokDiagnostiky[]> {
  const p = await prisma.property.findUnique({ where: { id: propertyId } });
  if (!p) return [];

  const since = new Date();
  since.setDate(since.getDate() - (dealType === "RENT" ? 30 : 60));
  const tol = Math.max(10, p.areaM2 * 0.25);
  const vyloucene = await nactiVyloucene(propertyId);

  const zaklad = { dealType, category: p.type };
  const kroky: KrokDiagnostiky[] = [];
  const pridej = async (popis: string, where: Prisma.MarketListingWhereInput) => {
    kroky.push({ popis, pocet: await prisma.marketListing.count({ where }), zlom: false });
  };

  await pridej(`Nabídky v kategorii ${p.type}`, zaklad);
  await pridej(`…z posledních ${dealType === "RENT" ? 30 : 60} dnů`, { ...zaklad, scrapedAt: { gte: since } });

  const mistni: Prisma.MarketListingWhereInput = {
    ...zaklad, scrapedAt: { gte: since },
    ...(p.latitude != null ? {} : p.region ? { OR: [{ city: p.city }, { region: p.region }] } : { city: p.city }),
  };
  await pridej(p.latitude != null ? "…se souřadnicemi (okruh se řeší až v paměti)" : `…z ${p.city}${p.region ? ` nebo kraje` : ""}`, mistni);

  await pridej(`…s plochou ${Math.round(p.areaM2 - tol)}–${Math.round(p.areaM2 + tol)} m²`, {
    ...mistni, areaM2: { gte: p.areaM2 - tol, lte: p.areaM2 + tol }, pricePerM2: { not: null },
  });

  if (p.disposition) {
    await pridej(`…s dispozicí ${p.disposition}`, {
      ...mistni, areaM2: { gte: p.areaM2 - tol, lte: p.areaM2 + tol },
      pricePerM2: { not: null }, disposition: p.disposition,
    });
  }

  if (vyloucene.size > 0) {
    kroky.push({ popis: `…mínus ${vyloucene.size} vyřazených`, pocet: -1, zlom: false });
  }

  // Zlom je prvni krok, po kterem uz nezbyly tri nabidky
  const i = kroky.findIndex((k) => k.pocet >= 0 && k.pocet < 3);
  if (i >= 0) kroky[i].zlom = true;

  return kroky;
}

/** Nabidky, ktere uzivatel u teto nemovitosti z odhadu vyradil. */
export async function nactiVyloucene(propertyId: string): Promise<Set<string>> {
  const r = await prisma.excludedListing.findMany({
    where: { propertyId },
    select: { source: true, externalId: true },
  });
  return new Set(r.map((x) => `${x.source}|${x.externalId}`));
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
  /** Klic pro vyrazeni z odhadu, "ZDROJ|externiId". Null u starsich snimku. */
  klic: string | null;
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
  /**
   * Nabídky, které uživatel z odhadu vyřadil, ve tvaru "ZDROJ|externiId".
   * Nejbližší nabídka nemusí být srovnatelná a rozhodnout to umí jen člověk,
   * který to místo zná.
   */
  vyloucene?: Set<string>;
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

  const pocetPredVyrazenim = { hodnota: 0 };

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
    // Vyrazene nabidky do odhadu nevstupuji vubec
    if (r.externalId && opts.vyloucene?.has(`${r.source}|${r.externalId}`)) {
      pocetPredVyrazenim.hodnota++;
      return false;
    }
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
    vyloucenoUzivatelem: pocetPredVyrazenim.hodnota,
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
      klic: r.externalId ? `${r.source}|${r.externalId}` : null,
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

  const vyloucene = await nactiVyloucene(p.id);

  const stats = await comparableStats({
    city: p.city,
    district: p.district,
    dealType: "SALE",
    vyloucene,
    // Rucni vyber respektujeme i pri nocnim skenu — jinak by odhad znovu
    // spadl na "malo nabidek" a uzivateluv zasah by prisel vnivec
    minVzorek: vyloucene.size > 0 ? 1 : 3,
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

  const vyloucene = await nactiVyloucene(p.id);

  const stats = await comparableStats({
    city: p.city,
    district: p.district,
    dealType: "RENT",
    vyloucene,
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
