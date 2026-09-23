/**
 * Ciselniky typu uveru a nemovitosti podle ceske pravni upravy.
 *
 * U uveru rozhoduje zakon c. 257/2016 Sb. o spotrebitelskem uveru: uver
 * na bydleni ma jina pravidla predcasneho splaceni nez uver jiny nez na bydleni,
 * a na podnikatelsky uver se zakon nevztahuje vubec.
 */

export interface TypUveru {
  klic: string;
  nazev: string;
  popis: string;
  /** Vztahuje se zakon o spotrebitelskem uveru? */
  spotrebitelsky: boolean;
  zajisteny: boolean;
  /** Pravidla predcasneho splaceni — v praxi nejdulezitejsi rozdil. */
  predcasneSplaceni: string;
}

export const TYPY_UVERU: TypUveru[] = [
  {
    klic: "HYPOTEKA_NA_BYDLENI",
    nazev: "Hypoteční úvěr na bydlení",
    popis: "Účelový úvěr zajištěný nemovitostí, poskytnutý na její pořízení, výstavbu nebo rekonstrukci. Spotřebitelský úvěr na bydlení dle § 2 odst. 2 zákona č. 257/2016 Sb.",
    spotrebitelsky: true,
    zajisteny: true,
    predcasneSplaceni: "Zdarma při výročí fixace, při prodeji nemovitosti po dvou letech, v případě úmrtí či dlouhodobé nemoci a u čtvrtiny jistiny jednou ročně. Jinak smí banka účtovat jen účelně vynaložené náklady se zákonným stropem.",
  },
  {
    klic: "AMERICKA_HYPOTEKA",
    nazev: "Americká hypotéka",
    popis: "Neúčelový úvěr zajištěný nemovitostí — peníze lze použít na cokoli. Bývá dražší než účelová hypotéka.",
    spotrebitelsky: true,
    zajisteny: true,
    predcasneSplaceni: "Jde o spotřebitelský úvěr na bydlení, pokud je zajištěn obytnou nemovitostí — platí stejná pravidla jako u hypotéky. Jinak se řídí režimem úvěru jiného než na bydlení.",
  },
  {
    klic: "STAVEBNI_SPORENI",
    nazev: "Úvěr ze stavebního spoření",
    popis: "Řádný úvěr po přidělení cílové částky. Úroková sazba je dána smlouvou a po celou dobu se nemění.",
    spotrebitelsky: true,
    zajisteny: false,
    predcasneSplaceni: "Zpravidla kdykoli zdarma — to je jeho hlavní výhoda proti hypotéce.",
  },
  {
    klic: "PREKLENOVACI",
    nazev: "Překlenovací úvěr",
    popis: "Meziúvěr do doby přidělení cílové částky ze stavebního spoření. Splácí se jen úrok, jistina se neumořuje.",
    spotrebitelsky: true,
    zajisteny: false,
    predcasneSplaceni: "Řídí se smlouvou. Pozor: dokud běží, jistina neklesá — splátkový kalendář v aplikaci proto u tohoto typu nesedí.",
  },
  {
    klic: "SPOTREBITELSKY",
    nazev: "Spotřebitelský úvěr (jiný než na bydlení)",
    popis: "Nezajištěná půjčka, typicky na rekonstrukci nebo vybavení. Vyšší sazba, kratší splatnost.",
    spotrebitelsky: true,
    zajisteny: false,
    predcasneSplaceni: "Kdykoli. Náhrada nejvýše 1 % z předčasně splacené části (0,5 %, zbývá-li méně než rok), a vždy nejvýš do výše úroku, který bys jinak zaplatil.",
  },
  {
    klic: "PODNIKATELSKY",
    nazev: "Podnikatelský / investiční úvěr",
    popis: "Úvěr poskytnutý na podnikatelskou činnost — typicky když nemovitosti pronajímáš na IČO nebo přes s.r.o.",
    spotrebitelsky: false,
    zajisteny: true,
    predcasneSplaceni: "Zákon o spotřebitelském úvěru se nepoužije, ochrana je jen ta smluvní. Podmínky předčasného splacení si ohlídej ve smlouvě.",
  },
  {
    klic: "PUJCKA_SOUKROMA",
    nazev: "Soukromá půjčka",
    popis: "Půjčka od fyzické osoby, rodiny nebo společníka.",
    spotrebitelsky: false,
    zajisteny: false,
    predcasneSplaceni: "Podle smlouvy. Úrok musí být obvyklý — jinak hrozí doměrek daně z bezúplatného příjmu.",
  },
  { klic: "JINY", nazev: "Jiný úvěr", popis: "Cokoli, co nespadá do předchozích kategorií.", spotrebitelsky: false, zajisteny: false, predcasneSplaceni: "Podle smlouvy." },
];

export const UVER_MAP = new Map(TYPY_UVERU.map((t) => [t.klic, t]));
export const nazevUveru = (k: string) => UVER_MAP.get(k)?.nazev ?? k;

// --- Typy nemovitosti ---

export interface TypNemovitosti {
  klic: string;
  nazev: string;
  popis?: string;
  /** Odpisova skupina dle prilohy c. 1 ZDP. Null = neodepisuje se. */
  odpisovaSkupina: number | null;
  /** Ma smysl evidovat dispozici (2+kk apod.)? */
  maDispozici: boolean;
  /**
   * Cesta v adrese Sreality, napr. "byty" nebo "garaze" — vklada se do
   * /hledani/<prodej|pronajem>/<cesta>/<mesto>. Overeno sondou proti zivemu
   * webu (scripts/probe-kategorie.ts); bez ni se nemovitost neskenuje.
   */
  srealityCesta?: string;
  /**
   * Podkategorie, na kterou se vysledek jeste zuzi. Cesta "ostatni" vraci
   * garaze, garazova stani i pudni prostory dohromady.
   */
  srealityPodkategorie?: string;
  upozorneni?: string;
}

export const TYPY_NEMOVITOSTI: TypNemovitosti[] = [
  { klic: "BYT", nazev: "Byt", odpisovaSkupina: 5, maDispozici: true, srealityCesta: "byty" },
  {
    klic: "DRUZSTEVNI_BYT", nazev: "Družstevní byt", odpisovaSkupina: null, maDispozici: true, srealityCesta: "byty",
    popis: "Nevlastníš nemovitost, ale podíl v bytovém družstvu s právem nájmu.",
    upozorneni: "Družstevní podíl je movitá věc, ne nemovitost — neodepisuje se a při prodeji platí časový test pět let podle § 4 odst. 1 písm. s) ZDP, ne deset. Banky na něj zpravidla nedají klasickou hypotéku.",
  },
  { klic: "RODINNY_DUM", nazev: "Rodinný dům", odpisovaSkupina: 5, maDispozici: true, srealityCesta: "domy", srealityPodkategorie: "Rodinný" },
  { klic: "BYTOVY_DUM", nazev: "Bytový dům", odpisovaSkupina: 5, maDispozici: false, srealityCesta: "komercni", srealityPodkategorie: "Činžovní dům", popis: "Celý dům s více bytovými jednotkami." },
  {
    klic: "CHATA", nazev: "Chata nebo rekreační objekt", odpisovaSkupina: 5, maDispozici: true,
    // Chaty na Sreality spadaji pod "domy", ale nazev podkategorie sonda
    // nepotvrdila — radsi neskenujeme nez abychom michali chatu s vilou.
  },
  { klic: "GARAZ", nazev: "Garáž", odpisovaSkupina: 5, maDispozici: false, srealityCesta: "garaze" },
  { klic: "PARKOVACI_STANI", nazev: "Parkovací stání", odpisovaSkupina: 5, maDispozici: false, srealityCesta: "garazova-stani", popis: "Samostatná jednotka nebo podíl na společné garáži." },
  { klic: "NEBYTOVY_PROSTOR", nazev: "Nebytový prostor", odpisovaSkupina: 5, maDispozici: false, srealityCesta: "komercni/kancelare", popis: "Kancelář, ordinace, ateliér." },
  { klic: "OBCHOD", nazev: "Obchodní prostor", odpisovaSkupina: 5, maDispozici: false, srealityCesta: "komercni/obchodni-prostory" },
  { klic: "SKLAD", nazev: "Sklad nebo hala", odpisovaSkupina: 4, maDispozici: false, srealityCesta: "komercni/sklady", upozorneni: "Lehké budovy a haly patří do 4. odpisové skupiny, tedy 20 let místo 30." },
  {
    klic: "POZEMEK", nazev: "Pozemek", odpisovaSkupina: null, maDispozici: false, srealityCesta: "pozemky",
    upozorneni: "Pozemek se neodepisuje, protože se neopotřebovává. Odpisový plán proto u tohoto typu nedává smysl.",
  },
  { klic: "JINY", nazev: "Jiná nemovitost", odpisovaSkupina: 5, maDispozici: false },
];

export const NEMOVITOST_MAP = new Map(TYPY_NEMOVITOSTI.map((t) => [t.klic, t]));
export const nazevNemovitosti = (k: string) => NEMOVITOST_MAP.get(k)?.nazev ?? k;

/**
 * Kraje ve tvaru, ktery prijima adresa Sreality. Slouzi jako zaloha pro obce
 * bez vlastniho vypisu (Bohusovice nad Ohri vraci 404) — okres neexistuje
 * v zadnem tvaru, overeno sondou.
 *
 * Slugy overuje scripts/probe-kraje.ts proti zivemu webu.
 */
export const KRAJE: { slug: string; nazev: string }[] = [
  { slug: "hlavni-mesto-praha", nazev: "Hlavní město Praha" },
  { slug: "stredocesky-kraj", nazev: "Středočeský kraj" },
  { slug: "jihocesky-kraj", nazev: "Jihočeský kraj" },
  { slug: "plzensky-kraj", nazev: "Plzeňský kraj" },
  { slug: "karlovarsky-kraj", nazev: "Karlovarský kraj" },
  { slug: "ustecky-kraj", nazev: "Ústecký kraj" },
  { slug: "liberecky-kraj", nazev: "Liberecký kraj" },
  { slug: "kralovehradecky-kraj", nazev: "Královéhradecký kraj" },
  { slug: "pardubicky-kraj", nazev: "Pardubický kraj" },
  { slug: "kraj-vysocina", nazev: "Kraj Vysočina" },
  { slug: "jihomoravsky-kraj", nazev: "Jihomoravský kraj" },
  { slug: "olomoucky-kraj", nazev: "Olomoucký kraj" },
  { slug: "zlinsky-kraj", nazev: "Zlínský kraj" },
  { slug: "moravskoslezsky-kraj", nazev: "Moravskoslezský kraj" },
];

export const nazevKraje = (slug: string) =>
  KRAJE.find((k) => k.slug === slug)?.nazev ?? slug;
