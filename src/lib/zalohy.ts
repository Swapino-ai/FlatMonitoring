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

/** Zmena nakladu sluzby platna od data. Bez ni by cena z minulosti zmizela pri kazde uprave. */
export interface ZmenaNakladu {
  validFrom: Date | string;
  monthlyCost: number;
  annualCost: number | null;
}

/** Zmena zaloh ve smlouve platna od data. */
export interface ZmenaZaloh {
  validFrom: Date | string;
  amount: number;
}

export interface SluzbaVstup {
  type: string;
  provider: string;
  monthlyCost: number;
  annualCost: number | null;
  chargedToTenant: boolean;
  /** Bez historie plati aktualni hodnota po cele obdobi. */
  historie?: ZmenaNakladu[];
}

export interface NajemVstup {
  tenantName: string;
  utilitiesMonthly: number;
  isActive: boolean;
  startDate?: Date | string;
  endDate?: Date | string | null;
  /** Bez historie plati aktualni hodnota po cele obdobi smlouvy. */
  historie?: ZmenaZaloh[];
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
  /**
   * Odkdy nesedi a kolik uz to stalo. Znamy jen kdyz je k dispozici historie;
   * bez ni se ví jen "ted nesedi", ne odkdy.
   */
  odKdy?: { rok: number; mesic: number };
  mesicu?: number;
  dosudRozdil?: number;
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

/**
 * Porovnani pro platnou smlouvu nemovitosti; bez platne smlouvy neni s cim porovnat.
 * Hodnoty se berou k dnesku, ne "posledni ulozene": zmena s datem v minulosti
 * nesmi prepsat, co plati ted.
 */
export function porovnejProNemovitost(
  najmy: NajemVstup[],
  sluzby: SluzbaVstup[],
  dnes: Date = new Date(),
): PorovnaniZaloh | null {
  const platny = najmy.find((n) => n.isActive);
  if (!platny) return null;

  const sluzbyDnes = sluzby.map((s) => sluzbaKDatu(s, dnes));
  const p = porovnejZalohy(zalohyKDatu(platny, dnes), sluzbyDnes, platny.tenantName);
  if (!p || p.stav === "sedi" || !platny.startDate) return p;

  // Kdyz vime, odkdy smlouva bezi, zjisti se i odkdy zalohy nesedi
  const osa = casovaOsa(platny, sluzby, dnes);
  const serie = osa ? koncovaSerieNesouladu(osa) : null;
  return serie ? { ...p, ...serie } : p;
}

const kc = (n: number) => `${Math.round(n).toLocaleString("cs-CZ")} Kč`;

const MESICE = ["leden", "únor", "březen", "duben", "květen", "červen", "červenec", "srpen", "září", "říjen", "listopad", "prosinec"];
const MESICE_2P = ["ledna", "února", "března", "dubna", "května", "června", "července", "srpna", "září", "října", "listopadu", "prosince"];

export const nazevMesice = (mesic: number) => MESICE[mesic - 1];

/** "Trvá od října 2026 (3 měsíce)" — jen když je odkdy známo. */
function odKdyText(p: PorovnaniZaloh): string {
  if (!p.odKdy || !p.mesicu) return "";
  const m = p.mesicu;
  const slovo = m === 1 ? "měsíc" : m < 5 ? "měsíce" : "měsíců";
  return ` Trvá od ${MESICE_2P[p.odKdy.mesic - 1]} ${p.odKdy.rok} (${m} ${slovo}), dosud celkem ${kc(Math.abs(p.dosudRozdil ?? 0))}.`;
}

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
          `Doplácíš ${kc(-p.rozdil)} měsíčně, při zachování ročně ${kc(-p.rozdilRocne)}.` + odKdyText(p),
      };
    case "preplaci":
      return {
        tone: "warn",
        nadpis: "Zálohy jsou vyšší než náklady na služby",
        text:
          `Nájemce platí ${kc(p.zalohy)} měsíčně, přeúčtované služby stojí ${kc(p.naklady)}. ` +
          `Přeplatek ${kc(p.rozdil)} měsíčně (při zachování ročně ${kc(p.rozdilRocne)}) patří nájemci a vrací se při vyúčtování.` + odKdyText(p),
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

// ---------------------------------------------------------------------------
// Cas: co platilo kdy
// ---------------------------------------------------------------------------

const den = (d: Date | string) => new Date(d);

/**
 * Zaznam platny k datu: posledni s "platí od" <= datum. Kdyz je datum drive nez
 * prvni zaznam, plati prvni — pocatecni hodnota se povazuje za platnou od zacatku.
 * Bez zaznamu vraci null a volajici pouzije aktualni hodnotu.
 */
export function platnyKDatu<T extends { validFrom: Date | string }>(zmeny: T[] | undefined, datum: Date): T | null {
  if (!zmeny || zmeny.length === 0) return null;
  const razene = [...zmeny].sort((a, b) => den(a.validFrom).getTime() - den(b.validFrom).getTime());
  let vysledek = razene[0];
  for (const z of razene) {
    if (den(z.validFrom).getTime() <= datum.getTime()) vysledek = z;
    else break;
  }
  return vysledek;
}

/** Sluzba s cenou, ktera platila k danemu datu. */
export function sluzbaKDatu(s: SluzbaVstup, datum: Date): SluzbaVstup {
  const z = platnyKDatu(s.historie, datum);
  return z ? { ...s, monthlyCost: z.monthlyCost, annualCost: z.annualCost } : s;
}

/** Zalohy, ktere se k danemu datu platily. */
export function zalohyKDatu(n: NajemVstup, datum: Date): number {
  const z = platnyKDatu(n.historie, datum);
  return z ? z.amount : n.utilitiesMonthly;
}

export interface MesicPorovnani {
  rok: number;
  mesic: number; // 1-12
  zalohy: number;
  naklady: number;
  rozdil: number;
  stav: StavZaloh;
}

export interface RokPorovnani {
  rok: number;
  mesicu: number;
  zalohy: number;
  naklady: number;
  /** zalohy - naklady za rok. Zaporne = nedoplatek k vyuctovani. */
  rozdil: number;
  mesice: MesicPorovnani[];
}

export interface OsaNajmu {
  najemce: string;
  jeAktivni: boolean;
  od: Date;
  do: Date;
  roky: RokPorovnani[];
  celkemRozdil: number;
}

/**
 * Porovnani zaloh a nakladu mesic po mesici za celou dobu smlouvy — i ukoncene.
 *
 * Mesic se pocita, kdyz smlouva platila v jeho patnactem dni. Zmena uprostred
 * mesice se tak projevi od mesice, do ktereho pripadl jeji "plati od" pred
 * patnactym, jinak od dalsiho; celomesicni kroky by byly presnejsi jen na papire.
 *
 * Priznak "preuctovava se" je jeden pro celou dobu: jeho historie se neeviduje.
 */
export function casovaOsa(najem: NajemVstup, sluzby: SluzbaVstup[], dnes: Date = new Date()): OsaNajmu | null {
  if (!najem.startDate) return null;
  const zacatek = den(najem.startDate);
  const konec = najem.endDate ? den(najem.endDate) : dnes;
  const hranice = konec.getTime() < dnes.getTime() ? konec : dnes;
  if (hranice.getTime() < zacatek.getTime()) return null;

  const mesice: MesicPorovnani[] = [];
  let rok = zacatek.getFullYear();
  let mesic = zacatek.getMonth(); // 0-11
  for (;;) {
    const referencni = new Date(rok, mesic, 15);
    if (referencni.getTime() > hranice.getTime()) break;
    if (referencni.getTime() >= zacatek.getTime()) {
      const zalohy = zalohyKDatu(najem, referencni);
      const p = porovnejZalohy(zalohy, sluzby.map((s) => sluzbaKDatu(s, referencni)));
      if (p) {
        mesice.push({ rok, mesic: mesic + 1, zalohy, naklady: p.naklady, rozdil: p.rozdil, stav: p.stav });
      }
    }
    mesic += 1;
    if (mesic > 11) { mesic = 0; rok += 1; }
  }

  if (mesice.length === 0) return null;

  const podleRoku = new Map<number, MesicPorovnani[]>();
  for (const m of mesice) podleRoku.set(m.rok, [...(podleRoku.get(m.rok) ?? []), m]);
  const roky: RokPorovnani[] = [...podleRoku.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([r, ms]) => ({
      rok: r,
      mesicu: ms.length,
      zalohy: ms.reduce((a, m) => a + m.zalohy, 0),
      naklady: ms.reduce((a, m) => a + m.naklady, 0),
      rozdil: ms.reduce((a, m) => a + m.rozdil, 0),
      mesice: ms,
    }));

  return {
    najemce: najem.tenantName,
    jeAktivni: najem.isActive,
    od: zacatek,
    do: hranice,
    roky,
    celkemRozdil: roky.reduce((a, r) => a + r.rozdil, 0),
  };
}

/**
 * Souvisla rada mesicu, ve kterych zalohy nesedi, ktera konci aktualnim mesicem.
 * Kdyz aktualni mesic sedi, neni co hlasit. Smer se drzi: prechod z nedoplatku
 * na preplatek je nova situace, ne pokracovani.
 */
export function koncovaSerieNesouladu(osa: OsaNajmu): { odKdy: { rok: number; mesic: number }; mesicu: number; dosudRozdil: number } | null {
  const vse = osa.roky.flatMap((r) => r.mesice);
  const posledni = vse[vse.length - 1];
  if (!posledni || posledni.stav === "sedi") return null;

  let i = vse.length - 1;
  while (i > 0 && vse[i - 1].stav === posledni.stav) i -= 1;
  const rada = vse.slice(i);
  return {
    odKdy: { rok: rada[0].rok, mesic: rada[0].mesic },
    mesicu: rada.length,
    dosudRozdil: rada.reduce((a, m) => a + m.rozdil, 0),
  };
}
