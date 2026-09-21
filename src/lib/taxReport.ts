/** Sestaveni danoveho podkladu za rok napric celym portfoliem. */

import { sum } from "./finance";
import { loanYearBreakdown } from "./finance";
import { computeRentalTax, depreciationInputPrice, depreciationSchedule, saleExemption, type TaxComputationResult } from "./tax";
import type { PropertyWithRelations } from "./portfolio";

export interface PropertyTaxLine {
  id: string;
  name: string;
  /** Jakou cast bytu poplatnik dani (0-1). */
  podil: number;
  rentalIncome: number;
  deductibleExpenses: number;
  loanInterest: number;
  depreciation: number;
  depreciationOrdinal: number | null;
  result: number;
  passThrough: number;
  saleNote?: string;
}

export interface TaxReport {
  year: number;
  /** Rok jeste neskoncil — odpisy jsou celorocni, prijmy zatim jen za cast roku. */
  incompleteYear: boolean;
  lines: PropertyTaxLine[];
  totals: {
    rentalIncome: number;
    deductibleExpenses: number;
    loanInterest: number;
    depreciation: number;
    passThrough: number;
  };
  computation: TaxComputationResult;
}

/**
 * `podily` urcuje, jakou cast kazdeho bytu poplatnik dani. Spoluvlastnik zdanuje
 * jen svuj podil na prijmech, vydajich i odpisech — proto se kráti vsechny castky.
 */
export function buildTaxReport(
  properties: PropertyWithRelations[],
  year: number,
  applyTaxpayerCredit = true,
  podily?: Map<string, number>,
): TaxReport {
  const lines: PropertyTaxLine[] = [];

  for (const p of properties) {
    const podil = podily?.get(p.id) ?? 1;
    if (podil <= 0) continue;
    const inYear = p.transactions.filter((t) => new Date(t.date).getFullYear() === year);

    const rentalIncome = sum(inYear.filter((t) => t.taxTreatment === "INCOME_RENT").map((t) => t.amount));
    const passThrough = sum(inYear.filter((t) => t.taxTreatment === "PASS_THROUGH").map((t) => t.amount));

    // Uznatelne vydaje krome uroku — uroky vedeme zvlast kvuli prehledu
    const deductibleExpenses = Math.abs(
      sum(inYear.filter((t) => t.taxTreatment === "EXPENSE_DEDUCTIBLE" && t.category !== "LOAN_INTEREST" && t.amount < 0).map((t) => t.amount)),
    );

    // Uroky: preferuj zauctovane, jinak dopocti ze splatkoveho kalendare
    const bookedInterest = Math.abs(sum(inYear.filter((t) => t.category === "LOAN_INTEREST").map((t) => t.amount)));
    const modelledInterest = sum(
      p.loans.filter((l) => l.isActive).map((l) => loanYearBreakdown({ ...l, startDate: new Date(l.startDate) }, year).interest),
    );
    const loanInterest = bookedInterest > 0 ? bookedInterest : modelledInterest;

    const startYear = p.depreciationStart ?? new Date(p.purchaseDate).getFullYear();
    const schedule = depreciationSchedule({
      inputPrice: depreciationInputPrice(p),
      group: p.depreciationGroup,
      method: p.depreciationMethod as "STRAIGHT" | "ACCELERATED",
      startYear,
    });
    const depRow = schedule.find((r) => r.year === year);

    let saleNote: string | undefined;
    if (p.saleDate && new Date(p.saleDate).getFullYear() === year) {
      saleNote = saleExemption(new Date(p.purchaseDate), new Date(p.saleDate)).note;
    }

    if (rentalIncome === 0 && deductibleExpenses === 0 && loanInterest === 0 && !depRow) continue;

    const k = (x: number) => x * podil;
    const odpis = k(depRow?.amount ?? 0);

    lines.push({
      id: p.id,
      name: p.name,
      podil,
      rentalIncome: k(rentalIncome),
      deductibleExpenses: k(deductibleExpenses),
      loanInterest: k(loanInterest),
      depreciation: odpis,
      depreciationOrdinal: depRow?.ordinal ?? null,
      result: k(rentalIncome) - k(deductibleExpenses) - k(loanInterest) - odpis,
      passThrough: k(passThrough),
      saleNote,
    });
  }

  const totals = {
    rentalIncome: sum(lines.map((l) => l.rentalIncome)),
    deductibleExpenses: sum(lines.map((l) => l.deductibleExpenses)),
    loanInterest: sum(lines.map((l) => l.loanInterest)),
    depreciation: sum(lines.map((l) => l.depreciation)),
    passThrough: sum(lines.map((l) => l.passThrough)),
  };

  const computation = computeRentalTax({
    year,
    rentalIncome: totals.rentalIncome,
    actualExpenses: totals.deductibleExpenses + totals.loanInterest,
    depreciation: totals.depreciation,
    loanInterest: totals.loanInterest,
    applyTaxpayerCredit,
  });

  return { year, lines, totals, computation, incompleteYear: year >= new Date().getFullYear() };
}
