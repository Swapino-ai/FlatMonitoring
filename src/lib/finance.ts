/** Finance: amortizace uveru, vynosove ukazatele, IRR. */

export interface AmortizationRow {
  month: number;
  date: Date;
  payment: number;
  interest: number;
  principal: number;
  balance: number;
}

/** Anuitni splatka: p = P * i / (1 - (1+i)^-n) */
export function annuityPayment(principal: number, annualRatePct: number, termMonths: number): number {
  const i = annualRatePct / 100 / 12;
  if (termMonths <= 0) return 0;
  if (i === 0) return principal / termMonths;
  return (principal * i) / (1 - Math.pow(1 + i, -termMonths));
}

export function amortizationSchedule(
  principal: number,
  annualRatePct: number,
  termMonths: number,
  startDate: Date,
  payment?: number,
): AmortizationRow[] {
  const i = annualRatePct / 100 / 12;
  const pmt = payment ?? annuityPayment(principal, annualRatePct, termMonths);
  const rows: AmortizationRow[] = [];
  let balance = principal;

  for (let m = 1; m <= termMonths && balance > 0.01; m++) {
    const interest = balance * i;
    let principalPart = pmt - interest;
    if (principalPart > balance) principalPart = balance;
    balance -= principalPart;
    const date = new Date(startDate);
    date.setMonth(date.getMonth() + m);
    rows.push({ month: m, date, payment: interest + principalPart, interest, principal: principalPart, balance });
  }
  return rows;
}

/** Zustatek a rozpad urok/jistina za dany kalendarni rok — podklad pro danove priznani. */
export function loanYearBreakdown(
  loan: { principal: number; interestRate: number; termMonths: number; startDate: Date; monthlyPayment: number },
  year: number,
): { interest: number; principal: number; endBalance: number } {
  const schedule = amortizationSchedule(
    loan.principal,
    loan.interestRate,
    loan.termMonths,
    loan.startDate,
    loan.monthlyPayment,
  );
  const inYear = schedule.filter((r) => r.date.getFullYear() === year);
  const upToYear = schedule.filter((r) => r.date.getFullYear() <= year);
  return {
    interest: sum(inYear.map((r) => r.interest)),
    principal: sum(inYear.map((r) => r.principal)),
    endBalance: upToYear.length ? upToYear[upToYear.length - 1].balance : loan.principal,
  };
}

/** Aktualni zustatek k datu podle splatkoveho kalendare. */
export function balanceAt(
  loan: { principal: number; interestRate: number; termMonths: number; startDate: Date; monthlyPayment: number },
  at: Date,
): number {
  const schedule = amortizationSchedule(loan.principal, loan.interestRate, loan.termMonths, loan.startDate, loan.monthlyPayment);
  const past = schedule.filter((r) => r.date <= at);
  return past.length ? past[past.length - 1].balance : loan.principal;
}

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

// --- Vynosove ukazatele ---

export interface YieldInput {
  /** Celkove porizovaci naklady: cena + vedlejsi naklady + rekonstrukce */
  totalInvestment: number;
  /** Vlastni vlozeny kapital (akontace + naklady placene z vlastnich zdroju) */
  equityInvested: number;
  annualGrossRent: number;
  /** Provozni naklady bez splatek uveru (SVJ, pojisteni, opravy, sprava, dan z nemovitosti) */
  annualOperatingExpenses: number;
  annualDebtService: number;
  annualInterest: number;
  currentValue: number;
  currentDebt: number;
}

export interface YieldMetrics {
  grossYield: number;
  netYield: number;
  capRate: number;
  noi: number;
  cashFlowAnnual: number;
  cashOnCash: number;
  dscr: number;
  ltv: number;
  equity: number;
  breakevenRentMonthly: number;
  expenseRatio: number;
}

export function computeYields(input: YieldInput): YieldMetrics {
  const noi = input.annualGrossRent - input.annualOperatingExpenses;
  const cashFlow = noi - input.annualDebtService;
  const equity = input.currentValue - input.currentDebt;

  return {
    // Hruby vynos: najem / porizovaci cena
    grossYield: pct(input.annualGrossRent, input.totalInvestment),
    // Cisty vynos: NOI / porizovaci cena
    netYield: pct(noi, input.totalInvestment),
    // Cap rate: NOI / aktualni trzni hodnota
    capRate: pct(noi, input.currentValue),
    noi,
    cashFlowAnnual: cashFlow,
    // Cash-on-cash: rocni cash flow / vlozeny vlastni kapital
    cashOnCash: pct(cashFlow, input.equityInvested),
    // DSCR: kryti dluhove sluzby provoznim ziskem (banka chce > 1.2)
    dscr: input.annualDebtService > 0 ? noi / input.annualDebtService : Infinity,
    ltv: pct(input.currentDebt, input.currentValue),
    equity,
    // Najem, pri kterem je cash flow nulovy
    breakevenRentMonthly: (input.annualOperatingExpenses + input.annualDebtService) / 12,
    expenseRatio: pct(input.annualOperatingExpenses, input.annualGrossRent),
  };
}

function pct(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return (numerator / denominator) * 100;
}

/** IRR z casove rady cash flow (Newton + bisekce jako zachrana). */
export function irr(cashFlows: number[], guess = 0.1): number | null {
  if (cashFlows.length < 2) return null;
  const npv = (rate: number) => cashFlows.reduce((acc, cf, t) => acc + cf / Math.pow(1 + rate, t), 0);

  let rate = guess;
  for (let iter = 0; iter < 100; iter++) {
    const f = npv(rate);
    const df = (npv(rate + 1e-6) - f) / 1e-6;
    if (Math.abs(df) < 1e-12) break;
    const next = rate - f / df;
    if (!isFinite(next)) break;
    if (Math.abs(next - rate) < 1e-9) return next;
    rate = Math.max(next, -0.999999);
  }

  let lo = -0.9999;
  let hi = 10;
  if (npv(lo) * npv(hi) > 0) return null;
  for (let iter = 0; iter < 200; iter++) {
    const mid = (lo + hi) / 2;
    if (npv(lo) * npv(mid) <= 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

/** Rocni IRR investice vcetne nerealizovaneho zisku (exit za aktualni hodnotu). */
export function propertyIrr(opts: {
  equityInvested: number;
  annualCashFlows: number[];
  currentEquity: number;
}): number | null {
  const flows = [-opts.equityInvested, ...opts.annualCashFlows];
  flows[flows.length - 1] += opts.currentEquity;
  const r = irr(flows);
  return r === null ? null : r * 100;
}

export function equityMultiple(totalCashReceived: number, currentEquity: number, equityInvested: number): number {
  if (!equityInvested) return 0;
  return (totalCashReceived + currentEquity) / equityInvested;
}
