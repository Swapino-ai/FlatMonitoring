/** Agregacni vrstva: z databaze spocita vsechny ukazatele pro jednu nemovitost i cele portfolio. */

import { prisma } from "./db";
import { balanceAt, computeYields, loanYearBreakdown, propertyIrr, sum, type YieldMetrics } from "./finance";
import { depreciationInputPrice, depreciationSchedule } from "./tax";
import type { Prisma } from "@prisma/client";

const withRelations = {
  include: { loans: true, leases: true, transactions: true, services: true, valuations: { orderBy: { date: "desc" } } },
} satisfies Prisma.PropertyDefaultArgs;

export type PropertyWithRelations = Prisma.PropertyGetPayload<typeof withRelations>;

export interface PropertyAnalysis {
  property: PropertyWithRelations;
  totalInvestment: number;
  equityInvested: number;
  currentValue: number;
  valuationSource: string;
  currentDebt: number;
  annualGrossRent: number;
  annualOperatingExpenses: number;
  annualDebtService: number;
  annualInterest: number;
  monthlyRent: number;
  monthlyServiceCost: number;
  metrics: YieldMetrics;
  irr: number | null;
  totalCashFlowToDate: number;
  valueGain: number;
  valueGainPct: number;
  yearsHeld: number;
  depreciationThisYear: number;
  /** Roky, pro ktere chybi transakce a cash flow je modelovany odhad. */
  estimatedYears: number[];
  activeLease: PropertyWithRelations["leases"][number] | null;
  fixationAlert: { lender: string; fixationEnd: Date; monthsLeft: number } | null;
}

export async function loadProperties(): Promise<PropertyWithRelations[]> {
  return prisma.property.findMany({
    ...withRelations,
    orderBy: { purchaseDate: "asc" },
  }) as Promise<PropertyWithRelations[]>;
}

export async function loadProperty(id: string): Promise<PropertyWithRelations | null> {
  return prisma.property.findUnique({ where: { id }, ...withRelations }) as Promise<PropertyWithRelations | null>;
}

export function analyzeProperty(p: PropertyWithRelations, asOf = new Date()): PropertyAnalysis {
  const year = asOf.getFullYear();

  const totalInvestment = p.purchasePrice + p.acquisitionCosts + p.renovationCosts;

  const activeLoans = p.loans.filter((l) => l.isActive);
  const currentDebt = sum(
    activeLoans.map((l) => balanceAt({ ...l, startDate: new Date(l.startDate) }, asOf)),
  );
  // Vlastni vlozeny kapital = celkova investice minus pujcena jistina
  const borrowed = sum(activeLoans.map((l) => l.principal));
  const equityInvested = Math.max(totalInvestment - borrowed, 0);

  const latestValuation = p.valuations[0];
  const currentValue = latestValuation?.value ?? totalInvestment;
  const valuationSource = latestValuation?.source ?? "PURCHASE_PRICE";

  const activeLease = p.leases.find((l) => l.isActive) ?? null;
  const monthlyRent = activeLease?.rentMonthly ?? 0;

  // Rocni najem: preferuj skutecne zauctovane prijmy za poslednich 12 mesicu,
  // pri chybejicich datech pouzij smluvni najem.
  const twelveMonthsAgo = new Date(asOf);
  twelveMonthsAgo.setFullYear(asOf.getFullYear() - 1);
  const recent = p.transactions.filter((t) => new Date(t.date) >= twelveMonthsAgo && new Date(t.date) <= asOf);

  const bookedRent = sum(recent.filter((t) => t.taxTreatment === "INCOME_RENT").map((t) => t.amount));
  const annualGrossRent = bookedRent > 0 ? bookedRent : monthlyRent * 12;

  // Provozni naklady: uznatelne vydaje bez uroku (uroky patri do dluhove sluzby)
  const annualOperatingExpenses = Math.abs(
    sum(
      recent
        .filter((t) => t.taxTreatment === "EXPENSE_DEDUCTIBLE" && t.category !== "LOAN_INTEREST" && t.amount < 0)
        .map((t) => t.amount),
    ),
  );

  const annualDebtService = sum(activeLoans.map((l) => l.monthlyPayment * 12));
  const annualInterest = sum(
    activeLoans.map((l) => loanYearBreakdown({ ...l, startDate: new Date(l.startDate) }, year).interest),
  );

  const monthlyServiceCost = sum(p.services.map((s) => s.monthlyCost + (s.annualCost ?? 0) / 12));

  const metrics = computeYields({
    totalInvestment,
    equityInvested,
    annualGrossRent,
    annualOperatingExpenses,
    annualDebtService,
    annualInterest,
    currentValue,
    currentDebt,
  });

  // IRR: rocni cash flow od porizeni + soucasny vlastni kapital jako exit.
  //
  // Historie transakci byva neuplna (evidenci zaciname vest pozdeji nez jsme koupili).
  // Rok bez jedine transakce proto MODELUJEME ze smluvniho najmu a sluzeb — jinak by
  // v nem zbyla jen dluhova sluzba bez prijmu a IRR by vyslo hluboko pod skutecnost.
  const purchaseYear = new Date(p.purchaseDate).getFullYear();
  const modelledAnnualRent = monthlyRent * 12;
  const modelledAnnualOpex = monthlyServiceCost * 12;

  const annualCashFlows: number[] = [];
  const estimatedYears: number[] = [];

  for (let y = purchaseYear; y <= year; y++) {
    const inYear = p.transactions.filter((t) => new Date(t.date).getFullYear() === y);

    const yearLoans = activeLoans.filter((l) => new Date(l.startDate).getFullYear() <= y);
    const debtService = sum(
      yearLoans.map((l) => {
        const b = loanYearBreakdown({ ...l, startDate: new Date(l.startDate) }, y);
        return b.interest + b.principal;
      }),
    );

    // Pomerna cast roku, kdy uz jsme byt vlastnili (rok porizeni neni cely)
    const share = y === purchaseYear ? (12 - new Date(p.purchaseDate).getMonth()) / 12 : 1;

    if (inYear.length === 0) {
      estimatedYears.push(y);
      annualCashFlows.push((modelledAnnualRent - modelledAnnualOpex - debtService) * share);
      continue;
    }

    const cash = sum(inYear.filter((t) => t.taxTreatment !== "PASS_THROUGH").map((t) => t.amount));
    // Uroky i jistina uz mohou byt mezi transakcemi — dluhovou sluzbu pricitame jen kdyz nejsou
    const hasLoanTx = inYear.some((t) => t.category === "LOAN_INTEREST" || t.category === "LOAN_PRINCIPAL");
    annualCashFlows.push(cash - (hasLoanTx ? 0 : debtService));
  }

  const irrValue = propertyIrr({
    equityInvested,
    annualCashFlows,
    currentEquity: currentValue - currentDebt,
  });

  const totalCashFlowToDate = sum(annualCashFlows);
  const valueGain = currentValue - totalInvestment;
  const yearsHeld = (asOf.getTime() - new Date(p.purchaseDate).getTime()) / (365.25 * 24 * 3600 * 1000);

  const inputPrice = depreciationInputPrice(p);
  const depSchedule = depreciationSchedule({
    inputPrice,
    group: p.depreciationGroup,
    method: p.depreciationMethod as "STRAIGHT" | "ACCELERATED",
    startYear: p.depreciationStart ?? purchaseYear,
  });
  const depreciationThisYear = depSchedule.find((r) => r.year === year)?.amount ?? 0;

  // Upozorneni na konec fixace do 12 mesicu
  let fixationAlert: PropertyAnalysis["fixationAlert"] = null;
  for (const l of activeLoans) {
    if (!l.fixationEnd) continue;
    const end = new Date(l.fixationEnd);
    const monthsLeft = (end.getTime() - asOf.getTime()) / (30.44 * 24 * 3600 * 1000);
    if (monthsLeft > 0 && monthsLeft <= 12) {
      if (!fixationAlert || monthsLeft < fixationAlert.monthsLeft) {
        fixationAlert = { lender: l.lender, fixationEnd: end, monthsLeft };
      }
    }
  }

  return {
    property: p,
    totalInvestment,
    equityInvested,
    currentValue,
    valuationSource,
    currentDebt,
    annualGrossRent,
    annualOperatingExpenses,
    annualDebtService,
    annualInterest,
    monthlyRent,
    monthlyServiceCost,
    metrics,
    irr: irrValue,
    totalCashFlowToDate,
    valueGain,
    valueGainPct: totalInvestment ? (valueGain / totalInvestment) * 100 : 0,
    yearsHeld,
    depreciationThisYear,
    estimatedYears,
    activeLease,
    fixationAlert,
  };
}

export interface PortfolioSummary {
  count: number;
  rentedCount: number;
  totalInvestment: number;
  currentValue: number;
  totalDebt: number;
  equity: number;
  annualGrossRent: number;
  annualNoi: number;
  annualCashFlow: number;
  monthlyCashFlow: number;
  avgGrossYield: number;
  avgNetYield: number;
  avgCashOnCash: number;
  ltv: number;
  valueGain: number;
  valueGainPct: number;
  totalAreaM2: number;
  occupancyPct: number;
}

export function summarize(analyses: PropertyAnalysis[]): PortfolioSummary {
  const active = analyses.filter((a) => a.property.status !== "SOLD");
  const totalInvestment = sum(active.map((a) => a.totalInvestment));
  const currentValue = sum(active.map((a) => a.currentValue));
  const totalDebt = sum(active.map((a) => a.currentDebt));
  const annualGrossRent = sum(active.map((a) => a.annualGrossRent));
  const annualOpex = sum(active.map((a) => a.annualOperatingExpenses));
  const annualDebtService = sum(active.map((a) => a.annualDebtService));
  const equityInvested = sum(active.map((a) => a.equityInvested));
  const noi = annualGrossRent - annualOpex;
  const cashFlow = noi - annualDebtService;
  const rentedCount = active.filter((a) => a.property.status === "RENTED").length;

  return {
    count: active.length,
    rentedCount,
    totalInvestment,
    currentValue,
    totalDebt,
    equity: currentValue - totalDebt,
    annualGrossRent,
    annualNoi: noi,
    annualCashFlow: cashFlow,
    monthlyCashFlow: cashFlow / 12,
    avgGrossYield: totalInvestment ? (annualGrossRent / totalInvestment) * 100 : 0,
    avgNetYield: totalInvestment ? (noi / totalInvestment) * 100 : 0,
    avgCashOnCash: equityInvested ? (cashFlow / equityInvested) * 100 : 0,
    ltv: currentValue ? (totalDebt / currentValue) * 100 : 0,
    valueGain: currentValue - totalInvestment,
    valueGainPct: totalInvestment ? ((currentValue - totalInvestment) / totalInvestment) * 100 : 0,
    totalAreaM2: sum(active.map((a) => a.property.areaM2)),
    occupancyPct: active.length ? (rentedCount / active.length) * 100 : 0,
  };
}
