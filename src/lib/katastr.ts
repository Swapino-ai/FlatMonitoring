/**
 * Klient k REST API katastru nemovitostí (api-kn.cuzk.gov.cz).
 *
 * Zjisteno sondou, protoze dokumentace mlci nebo lze:
 *  - zaklad je /api/v1, ackoliv stranka Popis uvadi cesty bez nej,
 *  - klic se posila v hlavicce ApiKey,
 *  - ciselniky ignoruji filtry a vzdy vrati cely seznam — filtruje se tedy
 *    az tady v pameti,
 *  - vyhledani stavby i jednotky povinne chce kod casti obce; kod obce nestaci,
 *  - vlastnici v tomhle API nejsou, jde o bezplatnou cast bez osobnich udaju.
 *
 * Volani jsou omezena kvotou (500 za obdobi), takze se katastr pta jen na
 * vyslovne prani uzivatele a vysledek se uklada.
 */

const ZAKLAD = "https://api-kn.cuzk.gov.cz/api/v1";

/** Typ stavby podle ciselniku katastru. */
const SCISLEMPOPISNYM = 1;
const SEVIDENCNIMCISLEM = 2;

interface Kod {
  kod: number;
  nazev: string;
}

interface UzemniJednotka extends Kod {
  kodObce?: number;
  kodOkresu?: number;
  platnostDo: string | null;
}

export interface Parcela {
  id: number;
  typParcely: string;
  druhCislovaniParcely: number;
  kmenoveCisloParcely: number;
  poddeleniCislaParcely: number | null;
  katastralniUzemi: Kod;
}

export interface JednotkaVDome {
  id: number;
  cisloJednotky: number;
}

export interface Stavba {
  id: number;
  typStavby: Kod;
  cislaDomovni: number[];
  castObce: Kod;
  obec: Kod;
  lv: { id: number; cislo: number; katastralniUzemi: Kod } | null;
  zpusobVyuziti: Kod | null;
  zpusobyOchrany: Kod[];
  parcely: Parcela[];
  jednotky: JednotkaVDome[];
  definicniBod: { x: number; y: number } | null;
}

export interface StavUctu {
  aktualniObdobi: string;
  provedenoVolani: number;
  limitVolani: number;
  expiraceApiKey: string;
}

export class KatastrChyba extends Error {}

async function ptejSe<T>(cesta: string): Promise<T> {
  const klic = process.env.KATASTR_API_KEY;
  if (!klic) throw new KatastrChyba("Katastr není nastavený — chybí KATASTR_API_KEY.");

  let r: Response;
  try {
    r = await fetch(ZAKLAD + cesta, {
      headers: { Accept: "application/json", ApiKey: klic },
      cache: "no-store",
    });
  } catch {
    throw new KatastrChyba("Katastr je nedostupný.");
  }

  if (r.status === 401 || r.status === 403) throw new KatastrChyba("Katastr klíč odmítl — zkontroluj KATASTR_API_KEY.");
  if (r.status === 429) throw new KatastrChyba("Vyčerpaný limit dotazů na katastr. Zkus to v dalším období.");
  if (!r.ok) throw new KatastrChyba(`Katastr vrátil HTTP ${r.status}.`);

  return (await r.json()) as T;
}

/** Odpoved katastru krome ciselniku sluzeb: data plus zpravy. */
interface Obalka<T> {
  data: T;
  zpravy: { kod: number; typZavaznosti: string; text: string }[];
  aktualnostDatK: string;
  provedenoVolani: number;
}

export async function stavUctu(): Promise<StavUctu> {
  return ptejSe<StavUctu>("/AplikacniSluzby/StavUctu");
}

/** Porovnani nazvu bez ohledu na diakritiku a velikost pismen. */
function stejny(a: string, b: string): boolean {
  const o = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  return o(a) === o(b);
}

/**
 * Cislo popisne nebo evidencni z ulice.
 *
 * "Topolčianská 437/18" — 437 je popisne, 18 orientacni. Katastr pracuje
 * s popisnym, orientacni ho nezajima. "Předměstí ev. č. 123" je evidencni
 * cislo, ktere ma jiny typ stavby.
 */
export function cisloZAdresy(ulice: string): { cislo: number | null; evidencni: boolean } {
  const evidencni = /ev\.?\s*[čc]\.?/i.test(ulice);
  const lomene = ulice.match(/(\d+)\s*\/\s*\d+/);
  if (lomene) return { cislo: Number(lomene[1]), evidencni };
  const samotne = ulice.match(/(\d+)/);
  return { cislo: samotne ? Number(samotne[1]) : null, evidencni };
}

/** Casti obce daneho jmena. Ciselniky filtry ignoruji, tridi se tedy tady. */
async function castiObce(mesto: string): Promise<UzemniJednotka[]> {
  const obce = await ptejSe<Obalka<UzemniJednotka[]>>("/CiselnikyUzemnichJednotek/Obce");
  const nalezene = obce.data.filter((o) => o.platnostDo == null && stejny(o.nazev, mesto));
  if (nalezene.length === 0) return [];

  const casti = await ptejSe<Obalka<UzemniJednotka[]>>("/CiselnikyUzemnichJednotek/CastiObci");
  const kody = new Set(nalezene.map((o) => o.kod));
  const vse = casti.data.filter((c) => c.platnostDo == null && c.kodObce != null && kody.has(c.kodObce));

  // Cast stejneho jmena jako obec je ta hlavni — u mest s vice castmi setri volani
  return [...vse].sort((a, b) => Number(stejny(b.nazev, mesto)) - Number(stejny(a.nazev, mesto)));
}

export interface NalezenaStavba {
  stavba: Stavba;
  castObce: string;
}

/**
 * Najde stavbu podle adresy. Kod casti obce je povinny a dopredu ho neznameme,
 * proto se casti prochazeji — u mest s mnoha ctvrtemi se hleda nejvys v osmi,
 * aby jedno hledani nesnedlo kvotu.
 */
export async function najdiStavbu(adresa: { street: string; city: string }): Promise<NalezenaStavba | null> {
  const { cislo, evidencni } = cisloZAdresy(adresa.street);
  if (cislo == null) {
    throw new KatastrChyba("V adrese není číslo popisné, podle čeho hledat.");
  }

  const casti = await castiObce(adresa.city);
  if (casti.length === 0) {
    throw new KatastrChyba(`Obec „${adresa.city}“ katastr nezná — zkontroluj název v adrese.`);
  }

  const typ = evidencni ? SEVIDENCNIMCISLEM : SCISLEMPOPISNYM;

  for (const cast of casti.slice(0, 8)) {
    const odpoved = await ptejSe<Obalka<Stavba[]>>(
      `/Stavby/Vyhledani?KodCastiObce=${cast.kod}&CisloDomovni=${cislo}&TypStavby=${typ}`,
    );
    const prvni = odpoved.data[0];
    if (prvni) return { stavba: prvni, castObce: cast.nazev };
  }

  return null;
}

/** Parcela ve tvaru, v jakem se pise do dokumentu: 684 nebo 684/2. */
export function popisParcely(p: Parcela): string {
  const zaklad = p.poddeleniCislaParcely ? `${p.kmenoveCisloParcely}/${p.poddeleniCislaParcely}` : String(p.kmenoveCisloParcely);
  // Stavebni parcela se pise se zkratkou, jinak by slo cislo zamenit
  return p.druhCislovaniParcely === 2 ? `st. ${zaklad}` : zaklad;
}

/** Cislo jednotky 4370001 je v katastru psane jako 437/1. */
export function popisJednotky(cisloJednotky: number): string {
  const s = String(cisloJednotky);
  if (s.length <= 4) return s;
  const dum = s.slice(0, s.length - 4);
  const poradi = Number(s.slice(-4));
  return `${dum}/${poradi}`;
}
