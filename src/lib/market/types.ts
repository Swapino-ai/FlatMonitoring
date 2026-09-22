export interface ScrapedListing {
  source: "SREALITY" | "BEZREALITKY";
  externalId?: string;
  dealType: "SALE" | "RENT";
  /** Klic z TYPY_NEMOVITOSTI — BYT, GARAZ, SKLAD, ... */
  category: string;
  city: string;
  district?: string;
  disposition?: string;
  areaM2?: number;
  price: number;
  pricePerM2?: number;
  url?: string;
}

export interface ScanQuery {
  city: string;
  district?: string;
  dealType: "SALE" | "RENT";
  /**
   * Klic z TYPY_NEMOVITOSTI. Urcuje cestu v adrese Sreality a drzi kategorie
   * oddelene — garaz 20 m² a byt 22 m² by se jinak potkaly v jednom medianu.
   */
  category?: string;
  /** Filtrovani na srovnatelnou velikost: +/- toleranceM2 od cilove plochy */
  areaM2?: number;
  toleranceM2?: number;
  disposition?: string;
  maxPages?: number;
  /** Kolik srovnatelnych nabidek staci — pak uz dalsi stranky nenacitame. */
  targetSample?: number;
}

export interface MarketSource {
  readonly name: "SREALITY" | "BEZREALITKY";
  fetchListings(query: ScanQuery): Promise<ScrapedListing[]>;
}

/** Normalizace dispozice: "2+kk", "3+1", ... */
export function normalizeDisposition(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  const m = raw.match(/(\d)\s*\+\s*(kk|1|kt)/i);
  if (!m) return undefined;
  const second = m[2].toLowerCase() === "1" ? "1" : "kk";
  return `${m[1]}+${second}`;
}
