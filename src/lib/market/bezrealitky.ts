import type { MarketSource, ScanQuery, ScrapedListing } from "./types";
import { filtrujSrovnatelne, nactiNextData, slugMesta, sleep } from "./util";

/**
 * Bezrealitky bezi na Next.js a inzeraty vklada do Apollo cache pod klice
 * "Advert:<id>". Neni to pole, ale mapa — proto je hledame podle tvaru klice.
 *
 * Dve vaznejsi uskali, obe overena na skutecnych datech:
 *  - Vypis obsahuje i zahranicni nabidky (napr. byt v Nemecku v EUR), protoze
 *    filtr mesta v adrese neni spolehlivy. Proto trvame na CZK a shode adresy.
 *  - Dispozice je v kodech typu "DISP_2_KK".
 */

interface Advert {
  id?: string;
  uri?: string;
  estateType?: string;
  offerType?: string;
  disposition?: string;
  surface?: number | null;
  price?: number | null;
  currency?: string;
  [klic: string]: unknown;
}

const DISPOZICE: Record<string, string> = {
  DISP_1_KK: "1+kk", DISP_1_1: "1+1",
  DISP_2_KK: "2+kk", DISP_2_1: "2+1",
  DISP_3_KK: "3+kk", DISP_3_1: "3+1",
  DISP_4_KK: "4+kk", DISP_4_1: "4+1",
  DISP_5_KK: "5+kk", DISP_5_1: "5+1",
};

export const bezrealitkySource: MarketSource = {
  name: "BEZREALITKY",

  async fetchListings(query: ScanQuery): Promise<ScrapedListing[]> {
    const out: ScrapedListing[] = [];
    const maxPages = query.maxPages ?? 2;
    const offerType = query.dealType === "SALE" ? "PRODEJ" : "PRONAJEM";

    for (let strana = 1; strana <= maxPages; strana++) {
      const params = new URLSearchParams({
        offerType,
        estateType: "BYT",
        location: query.city,
        page: String(strana),
      });
      const data = await nactiNextData(`https://www.bezrealitky.cz/vyhledat?${params}`);

      const inzeraty = najdiInzeraty(data);
      if (inzeraty.length === 0) break;

      for (const a of inzeraty) {
        const cena = Number(a.price ?? 0);
        if (!cena || cena <= 0) continue;

        // Zahranicni nabidky v jine mene do ceskeho medianu nepatri
        if (a.currency && a.currency !== "CZK") continue;
        if (a.estateType && a.estateType !== "BYT") continue;

        const adresa = textAdresy(a);
        if (!sedíMesto(adresa, query.city)) continue;

        const plocha = Number(a.surface ?? 0) || undefined;

        out.push({
          source: "BEZREALITKY",
          externalId: a.id ? String(a.id) : undefined,
          dealType: query.dealType,
          city: query.city,
          district: adresa || query.district,
          disposition: a.disposition ? DISPOZICE[a.disposition] : undefined,
          areaM2: plocha,
          price: cena,
          pricePerM2: plocha ? cena / plocha : undefined,
          url: a.uri ? `https://www.bezrealitky.cz/nemovitosti-byty-domy/${a.uri}` : undefined,
        });
      }

      if (strana < maxPages) await sleep(2000);
    }

    return filtrujSrovnatelne(out, query);
  },
};

/** Apollo cache klicuje inzeraty jako "Advert:1069391". */
function najdiInzeraty(data: unknown): Advert[] {
  const cache = (data as any)?.props?.pageProps?.apolloCache;
  if (!cache || typeof cache !== "object") return [];

  return Object.entries(cache as Record<string, unknown>)
    .filter(([k, v]) => /^Advert:/.test(k) && v && typeof v === "object")
    .map(([, v]) => v as Advert);
}

/** Adresa je pod klicem s argumenty dotazu, napr. address({"locale":"CS"}). */
function textAdresy(a: Advert): string {
  const klic = Object.keys(a).find((k) => k.startsWith("address"));
  const hodnota = klic ? a[klic] : undefined;
  return typeof hodnota === "string" ? hodnota : "";
}

/** Vypis vraci i nabidky mimo hledane mesto — porovname pres slug bez diakritiky. */
function sedíMesto(adresa: string, mesto: string): boolean {
  if (!adresa) return false;
  return slugMesta(adresa).includes(slugMesta(mesto));
}
