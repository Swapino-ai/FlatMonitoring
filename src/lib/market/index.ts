import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
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
      await persist(source.name, status, listings, listings.length === 0 ? "Zdroj nevrátil žádné nabídky — možná se změnila struktura webu." : undefined);
      results.push({ source: source.name, status, count: listings.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await persist(source.name, "FAILED", [], message);
      results.push({ source: source.name, status: "FAILED", count: 0, message });
    }
  }

  return results;
}

async function persist(source: string, status: string, listings: ScrapedListing[], message?: string) {
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
          city: l.city,
          district: l.district,
          disposition: l.disposition,
          areaM2: l.areaM2,
          price: l.price,
          pricePerM2: l.pricePerM2,
          url: l.url,
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
}

/** Statistika srovnatelnych nabidek z poslednich skenu. */
export async function comparableStats(opts: {
  city: string;
  district?: string | null;
  dealType: "SALE" | "RENT";
  areaM2: number;
  disposition?: string | null;
  sinceDays?: number;
}): Promise<ComparableStats | null> {
  const since = new Date();
  since.setDate(since.getDate() - (opts.sinceDays ?? 60));

  const tol = Math.max(10, opts.areaM2 * 0.25);

  const rows = await prisma.marketListing.findMany({
    where: {
      city: opts.city,
      dealType: opts.dealType,
      scrapedAt: { gte: since },
      ...(opts.district ? { district: { contains: opts.district } } : {}),
      ...(opts.disposition ? { disposition: opts.disposition } : {}),
      areaM2: { gte: opts.areaM2 - tol, lte: opts.areaM2 + tol },
      pricePerM2: { not: null },
    },
    select: {
      pricePerM2: true, price: true, areaM2: true, disposition: true,
      district: true, url: true, source: true, scrapedAt: true,
    },
    orderBy: { pricePerM2: "asc" },
  });

  if (rows.length < 3) return null;

  const perM2 = rows.map((r) => r.pricePerM2!).sort((a, b) => a - b);
  const prices = rows.map((r) => r.price).sort((a, b) => a - b);

  return {
    count: rows.length,
    medianPricePerM2: quantile(perM2, 0.5),
    p25: quantile(perM2, 0.25),
    p75: quantile(perM2, 0.75),
    medianPrice: quantile(prices, 0.5),
    listings: rows.map((r) => ({
      disposition: r.disposition,
      areaM2: r.areaM2,
      price: r.price,
      pricePerM2: r.pricePerM2!,
      district: r.district,
      url: r.url,
      source: r.source,
      scrapedAt: r.scrapedAt.toISOString(),
    })),
  };
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
}

/** Z mediánu ceny za m² udela odhad hodnoty a ulozi jako Valuation. */
export async function valuateFromMarket(propertyId: string): Promise<{ value: number; stats: ComparableStats } | null> {
  const p = await prisma.property.findUnique({ where: { id: propertyId } });
  if (!p) return null;

  const stats = await comparableStats({
    city: p.city,
    district: p.district,
    dealType: "SALE",
    areaM2: p.areaM2,
    disposition: p.disposition ?? undefined,
  });
  if (!stats) return null;

  const value = Math.round(stats.medianPricePerM2 * p.areaM2);

  await prisma.valuation.create({
    data: {
      propertyId: p.id,
      value,
      pricePerM2: stats.medianPricePerM2,
      source: "MARKET_SCAN",
      confidence: stats.count >= 15 ? "HIGH" : stats.count >= 7 ? "MEDIUM" : "LOW",
      sampleSize: stats.count,
      // Snimek necháváme u oceneni — inzeraty z trhu casem zmizi, doklad musi zustat
      comparables: stats.listings as unknown as Prisma.InputJsonValue,
      notes: `Medián ${Math.round(stats.medianPricePerM2).toLocaleString("cs-CZ")} Kč/m² z ${stats.count} nabídek (mezikvartilové rozpětí ${Math.round(stats.p25).toLocaleString("cs-CZ")}–${Math.round(stats.p75).toLocaleString("cs-CZ")} Kč/m²). Nabídkové ceny, realizované bývají nižší.`,
    },
  });

  return { value, stats };
}

export type { ScanQuery, ScrapedListing } from "./types";
