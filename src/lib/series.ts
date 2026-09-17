/** Casove rady pro grafy. */

import { balanceAt, sum } from "./finance";
import { monthCz } from "./format";
import type { PropertyWithRelations } from "./portfolio";

export interface EquityPoint { period: string; hodnota: number; dluh: number; equity: number }

/** Vyvoj trzni hodnoty a dluhu po ctvrtletich od prvniho nakupu. */
export function equitySeries(properties: PropertyWithRelations[], asOf = new Date()): EquityPoint[] {
  const active = properties.filter((p) => p.status !== "SOLD");
  if (active.length === 0) return [];

  const start = new Date(Math.min(...active.map((p) => new Date(p.purchaseDate).getTime())));
  const points: EquityPoint[] = [];

  const cursor = new Date(start.getFullYear(), Math.floor(start.getMonth() / 3) * 3, 1);
  while (cursor <= asOf) {
    const at = new Date(cursor);
    let hodnota = 0;
    let dluh = 0;

    for (const p of active) {
      if (new Date(p.purchaseDate) > at) continue;

      // Nejnovejsi ocenení k danemu datu, jinak porizovaci cena
      const val = p.valuations
        .filter((v) => new Date(v.date) <= at)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
      hodnota += val?.value ?? p.purchasePrice + p.acquisitionCosts + p.renovationCosts;

      for (const l of p.loans) {
        if (new Date(l.startDate) > at) continue;
        dluh += balanceAt({ ...l, startDate: new Date(l.startDate) }, at);
      }
    }

    points.push({
      period: `${at.getFullYear()} Q${Math.floor(at.getMonth() / 3) + 1}`,
      hodnota: Math.round(hodnota),
      dluh: Math.round(dluh),
      equity: Math.round(hodnota - dluh),
    });

    cursor.setMonth(cursor.getMonth() + 3);
  }

  return points.slice(-16);
}

export interface CashFlowPoint { period: string; prijmy: number; vydaje: number; cisty: number }

/** Mesicni cash flow ze skutecnych transakci za poslednich N mesicu. */
export function cashFlowSeries(properties: PropertyWithRelations[], months = 12, asOf = new Date()): CashFlowPoint[] {
  const txs = properties.flatMap((p) => p.transactions);
  const points: CashFlowPoint[] = [];

  for (let i = months - 1; i >= 0; i--) {
    const monthStart = new Date(asOf.getFullYear(), asOf.getMonth() - i, 1);
    const monthEnd = new Date(asOf.getFullYear(), asOf.getMonth() - i + 1, 1);

    const inMonth = txs.filter((t) => {
      const d = new Date(t.date);
      return d >= monthStart && d < monthEnd && t.taxTreatment !== "PASS_THROUGH";
    });

    const prijmy = sum(inMonth.filter((t) => t.amount > 0).map((t) => t.amount));
    const vydaje = Math.abs(sum(inMonth.filter((t) => t.amount < 0).map((t) => t.amount)));

    points.push({
      period: monthCz(monthStart),
      prijmy: Math.round(prijmy),
      vydaje: Math.round(vydaje),
      cisty: Math.round(prijmy - vydaje),
    });
  }

  return points;
}

/** Rozpad rocnich nakladu podle kategorie. */
export function expenseBreakdown(properties: PropertyWithRelations[], year: number): { kategorie: string; castka: number }[] {
  const byCategory = new Map<string, number>();

  for (const p of properties) {
    for (const t of p.transactions) {
      if (new Date(t.date).getFullYear() !== year) continue;
      if (t.amount >= 0 || t.taxTreatment === "PASS_THROUGH") continue;
      byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + Math.abs(t.amount));
    }
  }

  return [...byCategory.entries()]
    .map(([kategorie, castka]) => ({ kategorie, castka: Math.round(castka) }))
    .sort((a, b) => b.castka - a.castka);
}
