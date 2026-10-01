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

/** Druh sluzby tak, jak ho vidi obrazovky: nazev, ikona a vychozi prepinac "preuctuje se najemci". */
export interface DruhSluzby { name: string; icon: string; chargedByDefault: boolean }
export type TypySluzeb = Record<string, DruhSluzby>;

const VYCHOZI_PRECTENE_KLICE = new Set(["WATER", "HEATING", "GAS", "WASTE"]);
const VYCHOZI_IKONY: Record<string, string> = {
  ELECTRICITY: "blesk", GAS: "plamen", WATER: "kapka", HEATING: "teplomer", INTERNET: "wifi",
  INSURANCE: "stit", SVJ_FEE: "budova", MANAGEMENT: "kufr", WASTE: "odpad", OTHER: "tri",
};

/** Vychozi druhy — zaklad, kdyz v databazi jeste zadne nejsou. */
export const VYCHOZI_DRUHY: TypySluzeb = Object.fromEntries(
  Object.entries(SERVICE_TYPES).map(([key, name]) => [key, {
    name, icon: VYCHOZI_IKONY[key] ?? "tri", chargedByDefault: VYCHOZI_PRECTENE_KLICE.has(key),
  }]),
);

/** Nazev druhu; neznamy klic se ukaze tak, jak je, at sluzba nezmizi. */
export const nazevDruhu = (typy: TypySluzeb, key: string) => typy[key]?.name ?? SERVICE_TYPES[key] ?? key;

const BEZ_DIAKRITIKY = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Pravidla poradi: konkretnejsi drive (uklid spolecnych prostor je uklid, ne "spolecne"). */
const PRAVIDLA_IKON: [RegExp, string][] = [
  [/uklid|cisten|uklizec/, "uklid"],
  [/zelen|zahrad|travn|sekani|strom|keri/, "zelen"],
  [/vytah/, "vytah"],
  [/schod/, "schody"],
  [/osvetl|zarovk|svetl/, "zarovka"],
  [/ostrah|kamer|alarm|zabezpec|vratn/, "kamera"],
  [/fond|svj|sbd|druzstev/, "budova"],
  [/udrzb|oprav|servis|reviz|zavad/, "naradi"],
  [/domovn|klic|zamk/, "klic"],
  [/parkov|garaz|stani/, "parkovani"],
  [/internet|wifi|wi-fi|pripojeni|\bnet\b/, "wifi"],
  [/\btv\b|televiz|anten|kabelov|radio|poplatky za/, "televize"],
  [/odpad|smetn|popelnic/, "odpad"],
  [/elektr|proud/, "blesk"],
  [/plyn/, "plamen"],
  [/vod[ay]|vodne|stocn/, "kapka"],
  [/teplo|topen|vytap|ohrev/, "teplomer"],
  [/pojist/, "stit"],
  [/sprav/, "kufr"],
];

/** Navrhne ikonu podle nazvu druhu sluzby; null, kdyz nic nesedi. */
export function navrhniIkonu(nazev: string): string | null {
  const t = BEZ_DIAKRITIKY(nazev);
  return PRAVIDLA_IKON.find(([re]) => re.test(t))?.[1] ?? null;
}
