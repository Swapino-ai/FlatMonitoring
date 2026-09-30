/**
 * Kontrola, jestli zalohy, ktere plati najemce, kryji naklady na sluzby,
 * ktere se mu maji preuctovat.
 *
 * Dva udaje se zadavaji rucne na dvou mistech (smlouva a seznam sluzeb)
 * a nic je nespojovalo — nesoulad se objevil az pri rocnim vyuctovani.
 *
 * Cista funkce bez pristupu k databazi: pouziva ji server (varovani po ulozeni)
 * i obrazovka (trvale upozorneni a zive napovedy ve formulari), takze obe
 * vzdy rikaji totez.
 *
 * Vynosy, cash flow ani IRR se timto nemeni: provozni naklady a najem jdou
 * ve vypoctech ze zauctovanych pohybu, ne ze zaloh ani ze seznamu sluzeb.
 */

/** Rozdil do teto castky (Kc mesicne) nebo procenta z nakladu se povazuje za shodu. */
export const TOLERANCE_KC = 100;
export const TOLERANCE_PCT = 5;

/** Druhy sluzeb, u kterych se preuctovani ceka; jen predvyplneni formulare, ne pravidlo. */
export const VYCHOZI_PRECTENE = new Set(["WATER", "HEATING", "GAS", "WASTE"]);

export interface SluzbaVstup {
  type: string;
  provider: string;
  monthlyCost: number;
  annualCost: number | null;
  chargedToTenant: boolean;
}

export interface NajemVstup {
  tenantName: string;
  utilitiesMonthly: number;
  isActive: boolean;
}

export type StavZaloh = "sedi" | "nedoplaci" | "preplaci" | "neoznaceno";

export interface PorovnaniZaloh {
  stav: StavZaloh;
  /** Co najemce plati mesicne. */
  zalohy: number;
  /** Co maji mesicne stat sluzby oznacene k preuctovani. */
  naklady: number;
  /** zalohy - naklady. Zaporne = doplaci majitel. */
  rozdil: number;
  rozdilRocne: number;
  /** Ktere sluzby se do nakladu pocitaji, at je videt, z ceho vznikl soucet. */
  polozky: { type: string; provider: string; castka: number }[];
  najemce: string;
}

/** Mesicni naklad sluzby; rocni platba se rozpocte na mesice. */
export function mesicniNaklad(s: Pick<SluzbaVstup, "monthlyCost" | "annualCost">): number {
  return s.monthlyCost + (s.annualCost ?? 0) / 12;
}

/**
 * Porovna zalohy s naklady na preuctovane sluzby.
 * Vraci null, kdyz neni co porovnavat (nejsou zalohy a zadna sluzba se nepreuctovava).
 */
export function porovnejZalohy(
  zalohy: number,
  sluzby: SluzbaVstup[],
  najemce = "",
): PorovnaniZaloh | null {
  const polozky = sluzby
    .filter((s) => s.chargedToTenant)
    .map((s) => ({ type: s.type, provider: s.provider, castka: mesicniNaklad(s) }));
  const naklady = polozky.reduce((a, p) => a + p.castka, 0);

  if (zalohy <= 0 && polozky.length === 0) return null;

  const rozdil = zalohy - naklady;
  const zaklad = { zalohy, naklady, rozdil, rozdilRocne: rozdil * 12, polozky, najemce };

  // Zalohy jsou, ale nevime, co maji kryt: nejde overit
  if (polozky.length === 0) return { ...zaklad, stav: "neoznaceno" };

  const tolerance = Math.max(TOLERANCE_KC, (naklady * TOLERANCE_PCT) / 100);
  if (Math.abs(rozdil) <= tolerance) return { ...zaklad, stav: "sedi" };
  return { ...zaklad, stav: rozdil < 0 ? "nedoplaci" : "preplaci" };
}

/** Porovnani pro platnou smlouvu nemovitosti; bez platne smlouvy neni s cim porovnat. */
export function porovnejProNemovitost(najmy: NajemVstup[], sluzby: SluzbaVstup[]): PorovnaniZaloh | null {
  const platny = najmy.find((n) => n.isActive);
  if (!platny) return null;
  return porovnejZalohy(platny.utilitiesMonthly, sluzby, platny.tenantName);
}

const kc = (n: number) => `${Math.round(n).toLocaleString("cs-CZ")} Kč`;

export interface Popis {
  tone: "good" | "warn";
  nadpis: string;
  text: string;
}

/** Slovni popis porovnani. Stejny text jde na obrazovku i do varovani po ulozeni. */
export function popisPorovnani(p: PorovnaniZaloh): Popis {
  switch (p.stav) {
    case "sedi":
      return {
        tone: "good",
        nadpis: "Zálohy sedí se službami",
        text: `Nájemce platí ${kc(p.zalohy)} měsíčně, přeúčtované služby stojí ${kc(p.naklady)}.`,
      };
    case "nedoplaci":
      return {
        tone: "warn",
        nadpis: "Zálohy nekryjí náklady na služby",
        text:
          `Nájemce platí ${kc(p.zalohy)} měsíčně, přeúčtované služby stojí ${kc(p.naklady)}. ` +
          `Doplácíš ${kc(-p.rozdil)} měsíčně, ročně ${kc(-p.rozdilRocne)}.`,
      };
    case "preplaci":
      return {
        tone: "warn",
        nadpis: "Zálohy jsou vyšší než náklady na služby",
        text:
          `Nájemce platí ${kc(p.zalohy)} měsíčně, přeúčtované služby stojí ${kc(p.naklady)}. ` +
          `Přeplatek ${kc(p.rozdil)} měsíčně (ročně ${kc(p.rozdilRocne)}) patří nájemci a vrací se při vyúčtování.`,
      };
    case "neoznaceno":
      return {
        tone: "warn",
        nadpis: "Zálohy nejdou ověřit",
        text:
          `Nájemce platí zálohy ${kc(p.zalohy)} měsíčně, ale žádná služba není označená jako přeúčtovaná. ` +
          `Označ je ve službách, ať se dá porovnat, co se má skutečně platit.`,
      };
  }
}
