import type { MarketSource, ScanQuery, ScrapedListing } from "./types";
import { normalizeDisposition } from "./types";

/**
 * Sreality vystavuje verejne JSON API, ktere pohani jejich vlastni frontend.
 * Je stabilnejsi nez parsovani HTML, ale neni verejne dokumentovane — pri zmene
 * struktury sken skonci jako PARTIAL/FAILED a zapise se do logu, aplikace nespadne.
 */
const API = "https://www.sreality.cz/api/cs/v2/estates";

const CATEGORY_TYPE = { SALE: 1, RENT: 2 } as const; // prodej / pronajem
const CATEGORY_MAIN = 1; // byty
const PER_PAGE = 60;

export const srealitySource: MarketSource = {
  name: "SREALITY",

  async fetchListings(query: ScanQuery): Promise<ScrapedListing[]> {
    const out: ScrapedListing[] = [];
    const maxPages = query.maxPages ?? 3;

    for (let page = 1; page <= maxPages; page++) {
      const params = new URLSearchParams({
        category_main_cb: String(CATEGORY_MAIN),
        category_type_cb: String(CATEGORY_TYPE[query.dealType]),
        locality: query.district ? `${query.city} ${query.district}` : query.city,
        per_page: String(PER_PAGE),
        page: String(page),
        tms: String(Date.now()),
      });
      if (query.disposition) {
        const sub = dispositionToSubCategory(query.disposition);
        if (sub) params.set("category_sub_cb", String(sub));
      }

      const res = await fetch(`${API}?${params}`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; FlatMonitoring/0.1; osobni evidence nemovitosti)",
          Accept: "application/json",
        },
      });
      if (!res.ok) throw new Error(`Sreality vrátila HTTP ${res.status}`);

      const data = (await res.json()) as SrealityResponse;
      const estates = data?._embedded?.estates ?? [];
      if (estates.length === 0) break;

      for (const e of estates) {
        const areaM2 = extractArea(e.name);
        const price = Number(e.price ?? e.price_czk?.value_raw ?? 0);
        if (!price || price <= 0) continue;

        out.push({
          source: "SREALITY",
          externalId: e.hash_id ? String(e.hash_id) : undefined,
          dealType: query.dealType,
          city: query.city,
          district: e.locality ?? query.district,
          disposition: normalizeDisposition(e.name),
          areaM2,
          price,
          pricePerM2: areaM2 ? price / areaM2 : undefined,
          url: e.hash_id ? `https://www.sreality.cz/detail/${query.dealType === "SALE" ? "prodej" : "pronajem"}/byt/x/x/${e.hash_id}` : undefined,
        });
      }

      if (estates.length < PER_PAGE) break;
      await sleep(1200); // ohleduplne tempo — nechceme dodavatele zatezovat
    }

    return filterComparable(out, query);
  },
};

/** "Prodej bytu 2+kk 56 m²" → 56 */
function extractArea(name: string | undefined): number | undefined {
  if (!name) return undefined;
  const m = name.match(/(\d+(?:[.,]\d+)?)\s*m²/);
  return m ? Number(m[1].replace(",", ".")) : undefined;
}

function dispositionToSubCategory(d: string): number | null {
  const map: Record<string, number> = {
    "1+kk": 2, "1+1": 3, "2+kk": 4, "2+1": 5, "3+kk": 6, "3+1": 7, "4+kk": 8, "4+1": 9,
  };
  return map[d] ?? null;
}

export function filterComparable(listings: ScrapedListing[], query: ScanQuery): ScrapedListing[] {
  if (!query.areaM2) return listings;
  const tol = query.toleranceM2 ?? Math.max(10, query.areaM2 * 0.25);
  return listings.filter((l) => l.areaM2 != null && Math.abs(l.areaM2 - query.areaM2!) <= tol);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface SrealityResponse {
  _embedded?: {
    estates?: {
      hash_id?: number;
      name?: string;
      locality?: string;
      price?: number;
      price_czk?: { value_raw?: number };
    }[];
  };
}
