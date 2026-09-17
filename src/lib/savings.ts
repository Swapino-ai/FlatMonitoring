/** Analyza uspor: kde se da usetrit hromadnym vyjednavanim a prechodem k jinemu dodavateli. */

import { SERVICE_TYPES } from "./categories";
import type { PropertyWithRelations } from "./portfolio";

export interface BundleOpportunity {
  type: string;
  typeLabel: string;
  propertyCount: number;
  providerCount: number;
  providers: { name: string; count: number; avgMonthly: number }[];
  totalMonthly: number;
  totalAnnual: number;
  /** Nejlepsi cena za jednotku, ktere uz dosahujes u tohoto typu sluzby */
  bestUnitMonthly: number;
  /** Uspora, kdyby vsechny jednotky mely nejlepsi cenu, kterou uz mas */
  levelDownSavingAnnual: number;
  /** Odhad dalsi uspory z objemove slevy */
  bundleSavingAnnual: number;
  totalSavingAnnual: number;
  negotiableNow: number;
  lockedUntil: { property: string; until: Date }[];
  recommendation: string;
}

/**
 * Odhad objemove slevy podle poctu jednotek v poptavce.
 * Konzervativni — jde o vyjednavaci vychozi bod, ne zaruceny vysledek.
 */
function bundleDiscountPct(units: number, type: string): number {
  const base = units >= 10 ? 12 : units >= 5 ? 8 : units >= 3 ? 5 : units >= 2 ? 3 : 0;
  // Energie a pojisteni maji nejvetsi prostor, regulovane polozky (SVJ) zadny
  const multiplier: Record<string, number> = {
    ELECTRICITY: 1.2, GAS: 1.2, INSURANCE: 1.3, INTERNET: 1.0,
    MANAGEMENT: 1.1, WASTE: 0.5, WATER: 0.2, HEATING: 0.4, SVJ_FEE: 0, OTHER: 0.8,
  };
  return base * (multiplier[type] ?? 1);
}

export function findBundleOpportunities(properties: PropertyWithRelations[], asOf = new Date()): BundleOpportunity[] {
  const byType = new Map<string, { service: PropertyWithRelations["services"][number]; property: PropertyWithRelations }[]>();

  for (const p of properties) {
    if (p.status === "SOLD") continue;
    for (const s of p.services) {
      if (!s.isBundleable) continue;
      const list = byType.get(s.type) ?? [];
      list.push({ service: s, property: p });
      byType.set(s.type, list);
    }
  }

  const out: BundleOpportunity[] = [];

  for (const [type, entries] of byType) {
    const monthly = entries.map((e) => e.service.monthlyCost + (e.service.annualCost ?? 0) / 12);
    const totalMonthly = monthly.reduce((a, b) => a + b, 0);
    const bestUnitMonthly = Math.min(...monthly);

    const providerMap = new Map<string, { count: number; total: number }>();
    for (const e of entries) {
      const cur = providerMap.get(e.service.provider) ?? { count: 0, total: 0 };
      cur.count += 1;
      cur.total += e.service.monthlyCost + (e.service.annualCost ?? 0) / 12;
      providerMap.set(e.service.provider, cur);
    }
    const providers = [...providerMap.entries()]
      .map(([name, v]) => ({ name, count: v.count, avgMonthly: v.total / v.count }))
      .sort((a, b) => b.count - a.count);

    // Kolik usetris, kdyz kazda jednotka dostane nejlepsi cenu, kterou uz nekde mas
    const levelDownSavingAnnual = (totalMonthly - bestUnitMonthly * entries.length) * 12;
    // Kolik navic z objemove slevy nad uz srovnanou zakladnou
    const discount = bundleDiscountPct(entries.length, type);
    const bundleSavingAnnual = bestUnitMonthly * entries.length * 12 * (discount / 100);

    const locked: BundleOpportunity["lockedUntil"] = [];
    let negotiableNow = 0;
    for (const e of entries) {
      const end = e.service.contractEnd ? new Date(e.service.contractEnd) : null;
      if (end && end > asOf) locked.push({ property: e.property.name, until: end });
      else negotiableNow += 1;
    }

    const totalSavingAnnual = levelDownSavingAnnual + bundleSavingAnnual;
    if (entries.length < 2 && totalSavingAnnual < 1) continue;

    out.push({
      type,
      typeLabel: SERVICE_TYPES[type] ?? type,
      propertyCount: entries.length,
      providerCount: providers.length,
      providers,
      totalMonthly,
      totalAnnual: totalMonthly * 12,
      bestUnitMonthly,
      levelDownSavingAnnual: Math.max(0, levelDownSavingAnnual),
      bundleSavingAnnual: Math.max(0, bundleSavingAnnual),
      totalSavingAnnual: Math.max(0, totalSavingAnnual),
      negotiableNow,
      lockedUntil: locked,
      recommendation: buildRecommendation(type, entries.length, providers.length, negotiableNow, discount),
    });
  }

  return out.sort((a, b) => b.totalSavingAnnual - a.totalSavingAnnual);
}

function buildRecommendation(type: string, units: number, providerCount: number, negotiableNow: number, discount: number): string {
  const label = SERVICE_TYPES[type] ?? type;
  if (type === "SVJ_FEE") {
    return `Příspěvek SVJ je dán rozhodnutím shromáždění — prostor je v prosazení nižšího přídělu do fondu oprav, ne ve změně dodavatele.`;
  }
  if (providerCount === 1 && units >= 2) {
    return `Všech ${units} jednotek je u jednoho dodavatele — máš objem v ruce. Vyžádej si u ${label.toLowerCase()} objemovou slevu nebo doveď konkurenční nabídku k jednání. Očekávaný prostor ${discount.toFixed(0)} %.`;
  }
  if (providerCount > 1) {
    return `${providerCount} různých dodavatelů u ${units} jednotek. Nejdřív všechny sjednoť na nejlepší cenu, kterou už máš, pak poptej celý balík jako jeden kontrakt${negotiableNow < units ? ` — ${negotiableNow} z ${units} jednotek lze přesmluvnit hned.` : "."}`;
  }
  return `Jediná jednotka — hromadná poptávka zatím nedává smysl. Srovnej cenu s trhem při obnově smlouvy.`;
}

export interface SavingsSummary {
  totalAnnualServiceCost: number;
  totalIdentifiedSaving: number;
  savingPct: number;
  topOpportunity: BundleOpportunity | null;
}

export function summarizeSavings(opportunities: BundleOpportunity[]): SavingsSummary {
  const totalAnnualServiceCost = opportunities.reduce((a, o) => a + o.totalAnnual, 0);
  const totalIdentifiedSaving = opportunities.reduce((a, o) => a + o.totalSavingAnnual, 0);
  return {
    totalAnnualServiceCost,
    totalIdentifiedSaving,
    savingPct: totalAnnualServiceCost ? (totalIdentifiedSaving / totalAnnualServiceCost) * 100 : 0,
    topOpportunity: opportunities[0] ?? null,
  };
}
