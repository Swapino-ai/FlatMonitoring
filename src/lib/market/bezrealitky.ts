import * as cheerio from "cheerio";
import type { MarketSource, ScanQuery, ScrapedListing } from "./types";
import { normalizeDisposition } from "./types";
import { filterComparable, sleep } from "./sreality";

/**
 * Bezrealitky nemaji verejne API — parsujeme vypis inzeratu.
 * Selektory se obcas meni; pri neuspechu vraci prazdno a sken se ulozi jako PARTIAL.
 */
const BASE = "https://www.bezrealitky.cz/vyhledat";

export const bezrealitkySource: MarketSource = {
  name: "BEZREALITKY",

  async fetchListings(query: ScanQuery): Promise<ScrapedListing[]> {
    const out: ScrapedListing[] = [];
    const maxPages = query.maxPages ?? 2;

    for (let page = 1; page <= maxPages; page++) {
      const params = new URLSearchParams({
        offerType: query.dealType === "SALE" ? "PRODEJ" : "PRONAJEM",
        estateType: "BYT",
        regionOsmIds: "",
        page: String(page),
      });
      const url = `${BASE}?${params}&location=${encodeURIComponent(query.city)}`;

      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; FlatMonitoring/0.1; osobni evidence nemovitosti)",
          "Accept-Language": "cs-CZ,cs;q=0.9",
        },
      });
      if (!res.ok) throw new Error(`Bezrealitky vrátily HTTP ${res.status}`);

      const html = await res.text();
      const found = parseListings(html, query);
      if (found.length === 0) break;
      out.push(...found);

      await sleep(1500);
    }

    return filterComparable(out, query);
  },
};

export function parseListings(html: string, query: ScanQuery): ScrapedListing[] {
  const $ = cheerio.load(html);
  const out: ScrapedListing[] = [];

  // Preferovana cesta: Next.js data embedded ve strance
  const nextData = $("#__NEXT_DATA__").html();
  if (nextData) {
    try {
      const parsed = JSON.parse(nextData);
      const items = deepFindAdverts(parsed);
      for (const it of items) {
        const price = Number(it.price ?? 0);
        const areaM2 = Number(it.surface ?? it.surfaceLand ?? 0) || undefined;
        if (!price) continue;
        out.push({
          source: "BEZREALITKY",
          externalId: it.id ? String(it.id) : undefined,
          dealType: query.dealType,
          city: query.city,
          district: it.address ?? query.district,
          disposition: normalizeDisposition(it.disposition ?? it.title),
          areaM2,
          price,
          pricePerM2: areaM2 ? price / areaM2 : undefined,
          url: it.uri ? `https://www.bezrealitky.cz/nemovitosti-byty-domy/${it.uri}` : undefined,
        });
      }
      if (out.length) return out;
    } catch {
      // spadneme na HTML parsing nize
    }
  }

  // Zaloha: HTML selektory
  $("article, [class*='PropertyCard']").each((_, el) => {
    const $el = $(el);
    const text = $el.text();
    const priceMatch = text.match(/([\d\s ]{4,})\s*Kč/);
    const areaMatch = text.match(/(\d+(?:[.,]\d+)?)\s*m²/);
    if (!priceMatch) return;
    const price = Number(priceMatch[1].replace(/[\s ]/g, ""));
    const areaM2 = areaMatch ? Number(areaMatch[1].replace(",", ".")) : undefined;
    if (!price) return;
    out.push({
      source: "BEZREALITKY",
      dealType: query.dealType,
      city: query.city,
      district: query.district,
      disposition: normalizeDisposition(text),
      areaM2,
      price,
      pricePerM2: areaM2 ? price / areaM2 : undefined,
      url: $el.find("a").first().attr("href") ?? undefined,
    });
  });

  return out;
}

interface AdvertLike {
  id?: unknown; price?: unknown; surface?: unknown; surfaceLand?: unknown;
  disposition?: string; title?: string; address?: string; uri?: string;
}

/** Bezrealitky meni tvar payloadu — hledame pole objektu, ktere vypada jako inzeraty. */
function deepFindAdverts(node: unknown, depth = 0): AdvertLike[] {
  if (depth > 8 || node == null || typeof node !== "object") return [];
  if (Array.isArray(node)) {
    const looksLikeAdverts =
      node.length > 0 &&
      node.every((n) => n && typeof n === "object" && "price" in (n as object));
    if (looksLikeAdverts) return node as AdvertLike[];
    return node.flatMap((n) => deepFindAdverts(n, depth + 1));
  }
  return Object.values(node as Record<string, unknown>).flatMap((v) => deepFindAdverts(v, depth + 1));
}
