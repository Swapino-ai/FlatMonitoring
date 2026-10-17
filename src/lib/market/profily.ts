/**
 * Profily typu nemovitosti pro srovnani s trhem: co se u byty, domu, garaze, pozemku
 * a komercniho prostoru sleduje, co AI z inzeratu vycte, jak moc to urcuje vahu
 * a jestli se odhad pocita za m², nebo za kus.
 *
 * Ciste funkce bez databaze — pouziva je sken, odhad i stranky.
 */

export interface Vlastnost {
  klic: string;
  nazev: string;
  /** Hodnota -> popisek */
  moznosti: Record<string, string>;
  /** Hlavni parametr meni vahu silne (2× / ½×), doplnkovy mirne (1,2× / 0,8×) */
  hlavni: boolean;
  /** Poradi hodnot (napr. stav): sousedni hodnota se pocita jako castecna shoda */
  serazene?: boolean;
  /** Pokyn pro AI, jak hodnotu poznat z inzeratu */
  ai: string;
}

export interface Profil {
  klic: "BYT" | "DUM" | "GARAZ" | "POZEMEK" | "KOMERCNI" | "OBECNY";
  /** Napr. "byt", "garáž" — do textu */
  nazev: string;
  vlastnosti: Vlastnost[];
  /** Plocha nabidky smi byt jina nejvys o tento podil */
  tolerancePlochy: number;
  /** Navrhovat jen stejnou dispozici */
  stejnaDispozice: boolean;
  /** Odhad za kus (garaz, stani), ne za m² */
  zaKus: boolean;
  /** Co AI navic vypise jako drobne udaje */
  aiInfo: string;
}

const STAV = { PRED_REKONSTRUKCI: "Před rekonstrukcí", CASTECNA_REKONSTRUKCE: "Částečná rekonstrukce", PO_REKONSTRUKCI: "Po rekonstrukci", NOVOSTAVBA: "Novostavba" };
const ANO_NE = { ANO: "Ano", NE: "Ne" };
const AI_STAV = "Skutecny stav (ne domu, ale jednotky): puvodni / nutna rekonstrukce = PRED_REKONSTRUKCI; jen neco nove (kuchyn, koupelna, okna) = CASTECNA_REKONSTRUKCE; kompletne zrekonstruovano = PO_REKONSTRUKCI; nove postaveno = NOVOSTAVBA. Obecne fraze typu 'velmi dobry stav' bez konkretnich udaju nestaci.";

export const PROFILY: Record<Profil["klic"], Profil> = {
  BYT: {
    klic: "BYT", nazev: "byt", tolerancePlochy: 0.25, stejnaDispozice: true, zaKus: false,
    vlastnosti: [
      { klic: "typDomu", nazev: "Dům", hlavni: true, moznosti: { PANEL: "Panel", CIHLA: "Cihla", NOVOSTAVBA: "Novostavba" },
        ai: "Material domu: PANEL, CIHLA, NOVOSTAVBA (dum postaveny nebo dokonceny v poslednich ~5 letech). Smisena nebo skeletova stavba = null." },
      { klic: "stavBytu", nazev: "Stav", hlavni: true, serazene: true, moznosti: STAV, ai: AI_STAV },
      { klic: "vlastnictvi", nazev: "Vlastnictví", hlavni: true, moznosti: { OSOBNI: "Osobní", DRUZSTEVNI: "Družstevní" }, ai: "OSOBNI nebo DRUZSTEVNI." },
      { klic: "patro", nazev: "Patro", hlavni: false, moznosti: { PRIZEMI: "Přízemí", PATRO: "Patro", POSLEDNI: "Poslední patro" },
        ai: "PRIZEMI (prizemi, zvysene prizemi, suteren), POSLEDNI (nejvyssi podlazi domu), jinak PATRO." },
      { klic: "venkovni", nazev: "Balkon / terasa", hlavni: false, moznosti: ANO_NE, ai: "ANO, kdyz ma balkon, lodzii nebo terasu, jinak NE." },
      { klic: "parkovani", nazev: "Parkování", hlavni: false, moznosti: ANO_NE, ai: "ANO, kdyz k bytu patri garaz nebo vlastni parkovaci stani." },
    ],
    aiInfo: "vytah, sklep / komora, energeticka trida, zatepleni domu, rok rekonstrukce, podlazi (napr. '3. patro z 5')",
  },
  DUM: {
    klic: "DUM", nazev: "dům", tolerancePlochy: 0.3, stejnaDispozice: false, zaKus: false,
    vlastnosti: [
      { klic: "stav", nazev: "Stav", hlavni: true, serazene: true, moznosti: STAV, ai: AI_STAV },
      { klic: "pozemek", nazev: "Pozemek", hlavni: true, serazene: true,
        moznosti: { DO_500: "do 500 m²", DO_1000: "500–1 000 m²", DO_2000: "1 000–2 000 m²", NAD_2000: "nad 2 000 m²" },
        ai: "Velikost pozemku: DO_500, DO_1000 (500–1000 m²), DO_2000 (1000–2000 m²), NAD_2000." },
      { klic: "material", nazev: "Stavba", hlavni: true, moznosti: { ZDENA: "Zděná", DREVOSTAVBA: "Dřevostavba", MONTOVANA: "Montovaná" },
        ai: "ZDENA (cihla, tvarnice, kamen), DREVOSTAVBA (vcetne roubenky), MONTOVANA (panely, prefabrikat)." },
      { klic: "typStavby", nazev: "Typ", hlavni: false, moznosti: { SAMOSTATNY: "Samostatný", RADOVY: "Řadový / dvojdům", CHATA: "Chata / chalupa" },
        ai: "SAMOSTATNY, RADOVY (radovy, dvojdum, koncovy), CHATA (chata, chalupa, rekreacni objekt)." },
      { klic: "kanalizace", nazev: "Kanalizace", hlavni: false, moznosti: { VEREJNA: "Veřejná", SEPTIK: "Septik / ČOV / jímka" }, ai: "VEREJNA, nebo SEPTIK (septik, jimka, domaci COV)." },
      { klic: "voda", nazev: "Voda", hlavni: false, moznosti: { VODOVOD: "Vodovod", STUDNA: "Studna" }, ai: "VODOVOD (verejny), nebo STUDNA." },
      { klic: "vytapeni", nazev: "Vytápění", hlavni: false, moznosti: { PLYN: "Plyn", TEPELNE_CERPADLO: "Tepelné čerpadlo", ELEKTRINA: "Elektřina", TUHA_PALIVA: "Tuhá paliva" },
        ai: "Hlavni zdroj tepla: PLYN, TEPELNE_CERPADLO, ELEKTRINA (primotop, akumulacky), TUHA_PALIVA (kotel na drevo/uhli, krbova kamna)." },
      { klic: "garaz", nazev: "Garáž", hlavni: false, moznosti: ANO_NE, ai: "ANO, kdyz ma garaz nebo kryte stani." },
    ],
    aiInfo: "uzitna plocha, presna velikost pozemku, rok vystavby / rekonstrukce, fotovoltaika, bazen, celorocni obyvatelnost, energeticka trida",
  },
  GARAZ: {
    klic: "GARAZ", nazev: "garáž", tolerancePlochy: 0.4, stejnaDispozice: false, zaKus: true,
    vlastnosti: [
      { klic: "druh", nazev: "Druh", hlavni: true, moznosti: { SAMOSTATNA: "Samostatná", RADOVA: "Řadová", V_DOME: "V domě", STANI: "Stání" },
        ai: "SAMOSTATNA (samostatne stojici), RADOVA (garaz v rade garazi), V_DOME (v bytovem / rodinnem dome, podzemni), STANI (parkovaci stani, kryte i venkovni)." },
      { klic: "pozemekPod", nazev: "Pozemek pod", hlavni: true, moznosti: { VLASTNI: "Vlastní", CIZI: "Cizí / nájem" },
        ai: "Pozemek pod garazi je soucasti prodeje = VLASTNI; pozemek ciziho vlastnika, obce, v najmu = CIZI." },
      { klic: "elektrina", nazev: "Elektřina", hlavni: true, serazene: true, moznosti: { ZADNA: "Žádná", V230: "230 V", V400: "400 V" },
        ai: "ZADNA (bez elektriny), V230 (elektrina, zasuvka, svetlo), V400 (400 V / tri faze / motorova zasuvka)." },
      { klic: "vrata", nazev: "Vrata", hlavni: false, moznosti: { RUCNI: "Ruční", AUTOMATICKA: "Automatická" }, ai: "RUCNI, nebo AUTOMATICKA (elektricky pohon, dalkove ovladani)." },
      { klic: "jama", nazev: "Montážní jáma", hlavni: false, moznosti: ANO_NE, ai: "ANO, kdyz ma montazni jamu." },
      { klic: "material", nazev: "Stavba", hlavni: false, moznosti: { ZDENA: "Zděná", PANELOVA: "Panelová / betonová", PLECHOVA: "Plechová" },
        ai: "ZDENA, PANELOVA (betonove panely, prefabrikat), PLECHOVA." },
    ],
    aiInfo: "voda, prijezd (zpevneny / nezpevneny), ostraha nebo uzavreny areal, zastreseni (u stani), plocha",
  },
  POZEMEK: {
    klic: "POZEMEK", nazev: "pozemek", tolerancePlochy: 0.5, stejnaDispozice: false, zaKus: false,
    vlastnosti: [
      { klic: "druh", nazev: "Druh", hlavni: true, moznosti: { STAVEBNI: "Stavební", ZAHRADA: "Zahrada", LOUKA_POLE: "Louka / pole", LES: "Les", KOMERCNI: "Komerční" },
        ai: "STAVEBNI (urceny k vystavbe podle uzemniho planu), ZAHRADA, LOUKA_POLE (louka, pole, orna puda, pastvina), LES, KOMERCNI." },
      { klic: "site", nazev: "Sítě", hlavni: true, serazene: true, moznosti: { ZADNE: "Žádné", CASTECNE: "Částečně", VSECHNY: "Všechny" },
        ai: "Inzenyrske site na hranici pozemku (elektrina, voda, kanalizace, plyn): ZADNE, CASTECNE (aspon jedna), VSECHNY (elektrina, voda i kanalizace)." },
      { klic: "prijezd", nazev: "Příjezd", hlavni: false, moznosti: { ZPEVNENY: "Zpevněný", NEZPEVNENY: "Nezpevněný" }, ai: "ZPEVNENY (asfalt, dlazba), NEZPEVNENY (polni cesta, sterk)." },
      { klic: "svah", nazev: "Terén", hlavni: false, moznosti: { ROVINA: "Rovina", SVAH: "Svah" }, ai: "ROVINA, nebo SVAH (svazity)." },
    ],
    aiInfo: "uzemni plan, zaplavove uzemi, ochranne pasmo, tvar a sirka pozemku, presna plocha",
  },
  KOMERCNI: {
    klic: "KOMERCNI", nazev: "prostor", tolerancePlochy: 0.3, stejnaDispozice: false, zaKus: false,
    vlastnosti: [
      { klic: "umisteni", nazev: "Umístění", hlavni: true, moznosti: { VYLOHA: "Přízemí s výlohou", PRIZEMI: "Přízemí", PATRO: "Patro / suterén" },
        ai: "VYLOHA (prizemi s vylohou do ulice), PRIZEMI, PATRO (patro, suteren)." },
      { klic: "stav", nazev: "Stav", hlavni: true, serazene: true, moznosti: STAV, ai: AI_STAV },
      { klic: "parkovani", nazev: "Parkování", hlavni: false, moznosti: ANO_NE, ai: "ANO, kdyz k prostoru patri parkovani." },
      { klic: "vchod", nazev: "Vlastní vchod", hlavni: false, moznosti: ANO_NE, ai: "ANO, kdyz ma samostatny vchod z ulice." },
      { klic: "zazemi", nazev: "Sociální zázemí", hlavni: false, moznosti: ANO_NE, ai: "ANO, kdyz ma WC / kuchynku." },
    ],
    aiInfo: "vyska stropu, nakladni rampa, prikon elektriny, vytapeni, klimatizace",
  },
  OBECNY: {
    klic: "OBECNY", nazev: "nemovitost", tolerancePlochy: 0.3, stejnaDispozice: false, zaKus: false,
    vlastnosti: [{ klic: "stav", nazev: "Stav", hlavni: true, serazene: true, moznosti: STAV, ai: AI_STAV }],
    aiInfo: "nejdulezitejsi parametry ovlivnujici cenu",
  },
};

/** Profil podle typu nemovitosti (klic z katalogu: BYT, GARAZ...). */
export function profilTypu(typ: string | null | undefined): Profil {
  switch (typ) {
    case "BYT": case "DRUZSTEVNI_BYT": return PROFILY.BYT;
    case "RODINNY_DUM": case "CHATA": case "BYTOVY_DUM": return PROFILY.DUM;
    case "GARAZ": case "PARKOVACI_STANI": return PROFILY.GARAZ;
    case "POZEMEK": return PROFILY.POZEMEK;
    case "NEBYTOVY_PROSTOR": case "OBCHOD": case "SKLAD": return PROFILY.KOMERCNI;
    default: return PROFILY.OBECNY;
  }
}

export type Hodnoty = Record<string, string | null | undefined>;

/** Jen platne hodnoty profilu (AI muze vratit cokoli). */
export function platneHodnoty(profil: Profil, h: unknown): Record<string, string> {
  const ven: Record<string, string> = {};
  if (!h || typeof h !== "object") return ven;
  for (const v of profil.vlastnosti) {
    const x = (h as Record<string, unknown>)[v.klic];
    if (typeof x === "string" && x in v.moznosti) ven[v.klic] = x;
  }
  return ven;
}

/**
 * Hodnoty nemovitosti nebo zarazene nabidky: ulozene vlastnosti, k nim starsi sloupce
 * typDomu / stavBytu (byty pred zavedenim profilu).
 */
export function hodnotyZaznamu(profil: Profil, z: { vlastnosti?: unknown; typDomu?: string | null; stavBytu?: string | null }): Record<string, string> {
  const stare: Hodnoty = profil.klic === "BYT" ? { typDomu: z.typDomu, stavBytu: z.stavBytu } : {};
  return { ...platneHodnoty(profil, stare), ...platneHodnoty(profil, z.vlastnosti) };
}

/** Ucinne hodnoty nabidky: tvoje volba, jinak co vycetla AI. Vraci i to, ktere jsou od AI. */
export function hodnotyNabidky(profil: Profil, rucne: Record<string, string>, parametryAi: unknown) {
  // Novejsi parametry maji hodnoty v "hodnoty", starsi (pred profily) primo v koreni
  const zdroj = parametryAi && typeof parametryAi === "object" && "hodnoty" in parametryAi ? (parametryAi as { hodnoty: unknown }).hodnoty : parametryAi;
  const ai = platneHodnoty(profil, zdroj);
  const hodnoty: Record<string, string> = { ...ai, ...rucne };
  const odAi = Object.keys(ai).filter((k) => !(k in rucne));
  return { hodnoty, ai, odAi };
}

/**
 * Nasobitel vahy za vlastnosti: hlavni shoda 2×, neshoda ½× (u serazenych sousedni 1×);
 * doplnkova shoda 1,2×, neshoda 0,8× (sousedni 1×). Neznama hodnota 1×.
 */
export function vahaVlastnosti(profil: Profil, nemovitost: Record<string, string>, nabidka: Record<string, string>): number {
  let v = 1;
  for (const vl of profil.vlastnosti) {
    const a = nemovitost[vl.klic], b = nabidka[vl.klic];
    if (!a || !b) continue;
    const shoda = vl.hlavni ? 2 : 1.2, neshoda = vl.hlavni ? 0.5 : 0.8;
    if (a === b) { v *= shoda; continue; }
    if (vl.serazene) {
      const k = Object.keys(vl.moznosti);
      if (Math.abs(k.indexOf(a) - k.indexOf(b)) === 1) continue;
    }
    v *= neshoda;
  }
  return v;
}
