/**
 * Danove vypocty dle ceske legislativy — prijmy z najmu, § 9 zakona o danich z prijmu.
 *
 * POZOR: aplikace je podklad pro danove priznani, ne nahrada danoveho poradce.
 * Sazby a limity kontroluj kazdy rok — jsou v TAX_YEARS nize.
 */

export interface TaxYearParams {
  /** Strop pausalnich vydaju dle § 9 odst. 4 ZDP */
  flatRateExpenseCap: number;
  /** Procento pausalnich vydaju */
  flatRatePct: number;
  /** Zakladni sazba dane § 16 */
  baseRate: number;
  /** Zvysena sazba nad limit */
  higherRate: number;
  /** Hranice pro zvysenou sazbu (36x prumerna mzda) */
  higherRateThreshold: number;
  /** Zakladni sleva na poplatnika § 35ba */
  taxpayerCredit: number;
}

/** Overuj kazdy rok proti aktualnimu zneni ZDP. */
export const TAX_YEARS: Record<number, TaxYearParams> = {
  2023: { flatRateExpenseCap: 600_000, flatRatePct: 30, baseRate: 15, higherRate: 23, higherRateThreshold: 1_935_552, taxpayerCredit: 30_840 },
  2024: { flatRateExpenseCap: 600_000, flatRatePct: 30, baseRate: 15, higherRate: 23, higherRateThreshold: 1_582_812, taxpayerCredit: 30_840 },
  2025: { flatRateExpenseCap: 600_000, flatRatePct: 30, baseRate: 15, higherRate: 23, higherRateThreshold: 1_676_052, taxpayerCredit: 30_840 },
  2026: { flatRateExpenseCap: 600_000, flatRatePct: 30, baseRate: 15, higherRate: 23, higherRateThreshold: 1_767_240, taxpayerCredit: 30_840 },
};

export function taxParams(year: number): TaxYearParams {
  const known = Object.keys(TAX_YEARS).map(Number).sort((a, b) => b - a);
  return TAX_YEARS[year] ?? TAX_YEARS[known[0]];
}

// --- Odpisy hmotneho majetku (§ 30-32 ZDP) ---

/** Rovnomerne odpisovani § 31 — sazby v % ze vstupni ceny. */
const STRAIGHT_RATES: Record<number, { firstYear: number; nextYears: number }> = {
  3: { firstYear: 5.5, nextYears: 10.5 },
  4: { firstYear: 2.15, nextYears: 5.15 },
  5: { firstYear: 1.4, nextYears: 3.4 },
  6: { firstYear: 1.02, nextYears: 2.02 },
};

/** Zrychlene odpisovani § 32 — koeficienty. */
const ACCELERATED_COEFFS: Record<number, { firstYear: number; nextYears: number }> = {
  3: { firstYear: 10, nextYears: 11 },
  4: { firstYear: 20, nextYears: 21 },
  5: { firstYear: 30, nextYears: 31 },
  6: { firstYear: 50, nextYears: 51 },
};

export const DEPRECIATION_YEARS: Record<number, number> = { 3: 10, 4: 20, 5: 30, 6: 50 };

export interface DepreciationRow {
  year: number;
  ordinal: number;
  amount: number;
  cumulative: number;
  residual: number;
}

/**
 * Odpisovy plan budovy.
 * Vstupni cena = kupni cena + vedlejsi porizovaci naklady + technicke zhodnoceni
 *                MINUS hodnota podilu na pozemku (pozemek se neodepisuje).
 */
export function depreciationSchedule(opts: {
  inputPrice: number;
  group: number;
  method: "STRAIGHT" | "ACCELERATED";
  startYear: number;
}): DepreciationRow[] {
  const years = DEPRECIATION_YEARS[opts.group] ?? 30;
  const rows: DepreciationRow[] = [];
  if (opts.inputPrice <= 0) return rows;

  let cumulative = 0;

  if (opts.method === "STRAIGHT") {
    const rates = STRAIGHT_RATES[opts.group] ?? STRAIGHT_RATES[5];
    for (let n = 1; n <= years; n++) {
      const rate = n === 1 ? rates.firstYear : rates.nextYears;
      let amount = Math.round((opts.inputPrice * rate) / 100);
      if (cumulative + amount > opts.inputPrice) amount = opts.inputPrice - cumulative;
      if (amount <= 0) break;
      cumulative += amount;
      rows.push({ year: opts.startYear + n - 1, ordinal: n, amount, cumulative, residual: opts.inputPrice - cumulative });
    }
  } else {
    const k = ACCELERATED_COEFFS[opts.group] ?? ACCELERATED_COEFFS[5];
    let residual = opts.inputPrice;
    for (let n = 1; n <= years; n++) {
      // 1. rok: VC / k1 ; dalsi roky: 2 * ZC / (k2 - n + 1)
      let amount =
        n === 1
          ? Math.round(opts.inputPrice / k.firstYear)
          : Math.round((2 * residual) / (k.nextYears - n + 1));
      if (amount > residual) amount = residual;
      if (amount <= 0) break;
      residual -= amount;
      cumulative += amount;
      rows.push({ year: opts.startYear + n - 1, ordinal: n, amount, cumulative, residual });
    }
  }

  return rows;
}

/** Vstupni cena pro odpisovani — bez pozemku. */
export function depreciationInputPrice(p: {
  purchasePrice: number;
  acquisitionCosts: number;
  renovationCosts: number;
  landShareValue: number;
}): number {
  return Math.max(0, p.purchasePrice + p.acquisitionCosts + p.renovationCosts - p.landShareValue);
}

// --- Vypocet dane z prijmu z najmu (§ 9) ---

export interface TaxComputationInput {
  year: number;
  /** Zdanitelne prijmy z najmu (bez pruchozich zaloh na sluzby) */
  rentalIncome: number;
  /** Skutecne danove uznatelne vydaje bez odpisu */
  actualExpenses: number;
  /** Rocni odpisy budov */
  depreciation: number;
  /** Uroky z uveru — soucast skutecnych vydaju, vedeme zvlast pro prehled */
  loanInterest: number;
  /** Sleva na poplatnika se uplatni, pokud nemas jiny prijem, kde ji jiz cerpas */
  applyTaxpayerCredit: boolean;
}

export interface TaxOption {
  method: "FLAT_RATE" | "ACTUAL";
  label: string;
  expenses: number;
  taxBase: number;
  taxBeforeCredits: number;
  credits: number;
  taxDue: number;
  effectiveRate: number;
  note?: string;
}

export interface TaxComputationResult {
  year: number;
  income: number;
  options: TaxOption[];
  recommended: TaxOption;
  savingVsAlternative: number;
  params: TaxYearParams;
}

export function computeRentalTax(input: TaxComputationInput): TaxComputationResult {
  const p = taxParams(input.year);

  // Varianta A: pausalni vydaje 30 %, max 600 000 Kc
  const flatExpenses = Math.min((input.rentalIncome * p.flatRatePct) / 100, p.flatRateExpenseCap);
  const flatOption = buildOption("FLAT_RATE", `Paušální výdaje ${p.flatRatePct} %`, input, flatExpenses, p, {
    note:
      (input.rentalIncome * p.flatRatePct) / 100 > p.flatRateExpenseCap
        ? `Paušál je zastropován na ${p.flatRateExpenseCap.toLocaleString("cs-CZ")} Kč.`
        : "Při paušálu nelze uplatnit odpisy ani skutečné výdaje.",
  });

  // Varianta B: skutecne vydaje vcetne odpisu
  const actualExpenses = input.actualExpenses + input.depreciation;
  const actualOption = buildOption("ACTUAL", "Skutečné výdaje včetně odpisů", input, actualExpenses, p, {
    note: `Z toho odpisy ${Math.round(input.depreciation).toLocaleString("cs-CZ")} Kč a úroky ${Math.round(input.loanInterest).toLocaleString("cs-CZ")} Kč. Vyžaduje vedení evidence dle § 9 odst. 6.`,
  });

  const options = [flatOption, actualOption];
  const recommended = flatOption.taxDue <= actualOption.taxDue ? flatOption : actualOption;
  const other = recommended === flatOption ? actualOption : flatOption;

  return {
    year: input.year,
    income: input.rentalIncome,
    options,
    recommended,
    savingVsAlternative: other.taxDue - recommended.taxDue,
    params: p,
  };
}

function buildOption(
  method: TaxOption["method"],
  label: string,
  input: TaxComputationInput,
  expenses: number,
  p: TaxYearParams,
  extra: { note?: string },
): TaxOption {
  const taxBase = Math.max(0, input.rentalIncome - expenses);
  const taxBeforeCredits = progressiveTax(taxBase, p);
  const credits = input.applyTaxpayerCredit ? p.taxpayerCredit : 0;
  const taxDue = Math.max(0, Math.round(taxBeforeCredits - credits));

  return {
    method,
    label,
    expenses: Math.round(expenses),
    taxBase: Math.round(taxBase),
    taxBeforeCredits: Math.round(taxBeforeCredits),
    credits,
    taxDue,
    effectiveRate: input.rentalIncome ? (taxDue / input.rentalIncome) * 100 : 0,
    note: extra.note,
  };
}

/** Progresivni sazba § 16: 15 % do limitu, 23 % nad nim. */
export function progressiveTax(base: number, p: TaxYearParams): number {
  if (base <= 0) return 0;
  if (base <= p.higherRateThreshold) return (base * p.baseRate) / 100;
  return (
    (p.higherRateThreshold * p.baseRate) / 100 + ((base - p.higherRateThreshold) * p.higherRate) / 100
  );
}

/**
 * Osvobozeni prijmu z prodeje nemovitosti (§ 4 odst. 1 ZDP):
 * - casovy test 10 let (5 let pro nemovitosti nabyté do 31.12.2020)
 * - nebo 2 roky bydliste
 * - nebo pouziti prostredku na vlastni bytovou potrebu
 */
export function saleExemption(purchaseDate: Date, saleDate: Date): {
  exempt: boolean;
  requiredYears: number;
  heldYears: number;
  note: string;
} {
  const requiredYears = purchaseDate < new Date("2021-01-01") ? 5 : 10;
  const heldYears = (saleDate.getTime() - purchaseDate.getTime()) / (365.25 * 24 * 3600 * 1000);
  const exempt = heldYears >= requiredYears;
  return {
    exempt,
    requiredYears,
    heldYears,
    note: exempt
      ? `Časový test ${requiredYears} let splněn — příjem z prodeje je osvobozen dle § 4 odst. 1 písm. b) ZDP.`
      : `Časový test ${requiredYears} let nesplněn (drženo ${heldYears.toFixed(1)} roku). Příjem se daní dle § 10, lze uplatnit nabývací cenu jako výdaj. Osvobození lze získat i použitím prostředků na vlastní bytovou potřebu (nutno oznámit správci daně do konce lhůty pro podání přiznání).`,
  };
}
