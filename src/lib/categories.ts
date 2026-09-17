/** Kategorie transakci s prednastavenou danovou klasifikaci dle §9 ZDP. */

export type TaxTreatment =
  | "INCOME_RENT"
  | "EXPENSE_DEDUCTIBLE"
  | "EXPENSE_NON_DEDUCTIBLE"
  | "PASS_THROUGH"
  | "CAPITAL"
  | "LOAN_PRINCIPAL";

export const TAX_TREATMENT_LABELS: Record<TaxTreatment, string> = {
  INCOME_RENT: "Zdanitelný příjem z nájmu",
  EXPENSE_DEDUCTIBLE: "Daňově uznatelný výdaj",
  EXPENSE_NON_DEDUCTIBLE: "Daňově neuznatelný výdaj",
  PASS_THROUGH: "Průchozí položka (zálohy na služby)",
  CAPITAL: "Technické zhodnocení (odpisuje se)",
  LOAN_PRINCIPAL: "Splátka jistiny (nedaňový výdaj)",
};

export interface CategoryDef {
  key: string;
  label: string;
  kind: "INCOME" | "EXPENSE";
  defaultTaxTreatment: TaxTreatment;
  hint?: string;
}

export const CATEGORIES: CategoryDef[] = [
  { key: "RENT", label: "Nájemné", kind: "INCOME", defaultTaxTreatment: "INCOME_RENT" },
  {
    key: "UTILITIES_ADVANCE",
    label: "Zálohy na služby od nájemníka",
    kind: "INCOME",
    defaultTaxTreatment: "PASS_THROUGH",
    hint: "Průchozí položka — nevstupuje do základu daně, pokud se vyúčtovává.",
  },
  { key: "DEPOSIT", label: "Kauce", kind: "INCOME", defaultTaxTreatment: "EXPENSE_NON_DEDUCTIBLE", hint: "Kauce není příjem — vrací se nájemníkovi." },
  { key: "OTHER_INCOME", label: "Ostatní příjem", kind: "INCOME", defaultTaxTreatment: "INCOME_RENT" },

  { key: "SVJ_FEE", label: "Příspěvek SVJ / fond oprav", kind: "EXPENSE", defaultTaxTreatment: "EXPENSE_DEDUCTIBLE", hint: "Příděl do fondu oprav bývá uznatelný až v okamžiku čerpání — ověř s účetní." },
  { key: "UTILITIES", label: "Energie a služby", kind: "EXPENSE", defaultTaxTreatment: "PASS_THROUGH" },
  { key: "INSURANCE", label: "Pojištění nemovitosti", kind: "EXPENSE", defaultTaxTreatment: "EXPENSE_DEDUCTIBLE" },
  { key: "PROPERTY_TAX", label: "Daň z nemovitých věcí", kind: "EXPENSE", defaultTaxTreatment: "EXPENSE_DEDUCTIBLE" },
  { key: "REPAIR", label: "Opravy a údržba", kind: "EXPENSE", defaultTaxTreatment: "EXPENSE_DEDUCTIBLE", hint: "Oprava = uznatelná ihned. Technické zhodnocení nad 80 tis. Kč/rok = odpisuje se." },
  { key: "IMPROVEMENT", label: "Technické zhodnocení", kind: "EXPENSE", defaultTaxTreatment: "CAPITAL", hint: "Nad 80 000 Kč za rok zvyšuje vstupní cenu a odpisuje se." },
  { key: "MANAGEMENT", label: "Správa nemovitosti", kind: "EXPENSE", defaultTaxTreatment: "EXPENSE_DEDUCTIBLE" },
  { key: "LOAN_INTEREST", label: "Úroky z hypotéky", kind: "EXPENSE", defaultTaxTreatment: "EXPENSE_DEDUCTIBLE", hint: "Uznatelné jsou pouze úroky, ne splátka jistiny." },
  { key: "LOAN_PRINCIPAL", label: "Splátka jistiny", kind: "EXPENSE", defaultTaxTreatment: "LOAN_PRINCIPAL" },
  { key: "LEGAL", label: "Právní a poradenské služby", kind: "EXPENSE", defaultTaxTreatment: "EXPENSE_DEDUCTIBLE" },
  { key: "BROKERAGE", label: "Provize za zprostředkování nájmu", kind: "EXPENSE", defaultTaxTreatment: "EXPENSE_DEDUCTIBLE" },
  { key: "VACANCY_COST", label: "Náklady při neobsazenosti", kind: "EXPENSE", defaultTaxTreatment: "EXPENSE_DEDUCTIBLE" },
  { key: "OTHER_EXPENSE", label: "Ostatní výdaj", kind: "EXPENSE", defaultTaxTreatment: "EXPENSE_DEDUCTIBLE" },
];

export const CATEGORY_MAP = new Map(CATEGORIES.map((c) => [c.key, c]));

export function categoryLabel(key: string): string {
  return CATEGORY_MAP.get(key)?.label ?? key;
}

export const SERVICE_TYPES: Record<string, string> = {
  ELECTRICITY: "Elektřina",
  GAS: "Plyn",
  WATER: "Vodné a stočné",
  HEATING: "Teplo",
  INTERNET: "Internet / TV",
  INSURANCE: "Pojištění",
  SVJ_FEE: "SVJ / fond oprav",
  MANAGEMENT: "Správa",
  WASTE: "Odpad",
  OTHER: "Ostatní",
};
