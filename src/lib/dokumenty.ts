/**
 * Dokumenty na Google Disku: katalog kategorii a adresarova struktura.
 * Ciste funkce bez site a databaze — bezi na serveru i v prohlizeci a jdou testovat.
 *
 * Struktura na Disku (koren si aplikace zaklada sama a jmenuje se F(a)latMonitoring):
 *
 *   F(a)latMonitoring/
 *   ├─ Nemovitosti/
 *   │  └─ <Nazev nemovitosti>/
 *   │     ├─ 01 Nabyti a katastr/           kupni smlouva, list vlastnictvi
 *   │     ├─ 02 Najemni smlouvy/
 *   │     │  └─ <N-0001 Jmeno najemce>/     smlouvy, predavaci protokoly
 *   │     │     └─ Vyuctovani/              vyuctovani vydana najemci (PDF)
 *   │     ├─ 03 Sluzby/
 *   │     │  └─ <Druh sluzby>/              smlouvy s dodavateli
 *   │     ├─ 04 Vyuctovani/
 *   │     │  └─ <rok>/<Druh sluzby>/        vyuctovani od dodavatelu
 *   │     ├─ 05 Uvery/
 *   │     ├─ 06 Dane/<rok>/
 *   │     └─ 07 Fotky a ostatni/
 *   ├─ Najemnici/
 *   │  └─ <N-0001 Jmeno najemce>/            doklady totožnosti apod., nezavisle na bytu
 *   └─ Ostatni/                              vse, co nepatri k nemovitosti
 *
 * Kazda slozka ma stabilni logicky klic (id nemovitosti, najemce ...), takze
 * prejmenovani nemovitosti nerozbije cestu ke starym souborum.
 */

export type KategorieKlic =
  | "KUPNI_SMLOUVA" | "KATASTR" | "NAJEMNI_SMLOUVA" | "PREDAVACI_PROTOKOL"
  | "SLUZBA_SMLOUVA" | "SLUZBA_VYUCTOVANI" | "VYUCTOVANI_NAJEMCE" | "UVER" | "DANE" | "FOTKY"
  | "NAJEMCE_DOKLAD" | "OSTATNI";

type Vyzaduje = "nemovitost" | "najemce" | "sluzba" | "rok";

interface Kategorie {
  nazev: string;
  /** Slozka pod nemovitosti; null = nepatri k nemovitosti. */
  slozka: string | null;
  klic: string;
  vyzaduje: Vyzaduje[];
  /** Podslozky navic (pod slozkou kategorie) v tomto poradi. */
  podslozky: ("najemce" | "rok" | "sluzba" | "vyuct")[];
}

export const KATEGORIE: Record<KategorieKlic, Kategorie> = {
  KUPNI_SMLOUVA:      { nazev: "Kupní smlouva",           slozka: "01 Nabytí a katastr",  klic: "C:NABYTI",  vyzaduje: ["nemovitost"], podslozky: [] },
  KATASTR:            { nazev: "List vlastnictví",        slozka: "01 Nabytí a katastr",  klic: "C:NABYTI",  vyzaduje: ["nemovitost"], podslozky: [] },
  NAJEMNI_SMLOUVA:    { nazev: "Nájemní smlouva",         slozka: "02 Nájemní smlouvy",   klic: "C:NAJEM",   vyzaduje: ["nemovitost", "najemce"], podslozky: ["najemce"] },
  PREDAVACI_PROTOKOL: { nazev: "Předávací protokol",      slozka: "02 Nájemní smlouvy",   klic: "C:NAJEM",   vyzaduje: ["nemovitost", "najemce"], podslozky: ["najemce"] },
  SLUZBA_SMLOUVA:     { nazev: "Smlouva o službě",        slozka: "03 Služby",            klic: "C:SLUZBY",  vyzaduje: ["nemovitost", "sluzba"], podslozky: ["sluzba"] },
  VYUCTOVANI_NAJEMCE: { nazev: "Vyúčtování nájemci",    slozka: "02 Nájemní smlouvy",   klic: "C:NAJEM",   vyzaduje: ["nemovitost", "najemce"], podslozky: ["najemce", "vyuct"] },
  SLUZBA_VYUCTOVANI:  { nazev: "Vyúčtování služby",       slozka: "04 Vyúčtování",        klic: "C:VYUCT",   vyzaduje: ["nemovitost", "sluzba", "rok"], podslozky: ["rok", "sluzba"] },
  UVER:               { nazev: "Úvěr a hypotéka",         slozka: "05 Úvěry",             klic: "C:UVER",    vyzaduje: ["nemovitost"], podslozky: [] },
  DANE:               { nazev: "Daně",                    slozka: "06 Daně",              klic: "C:DANE",    vyzaduje: ["nemovitost", "rok"], podslozky: ["rok"] },
  FOTKY:              { nazev: "Fotky a ostatní",         slozka: "07 Fotky a ostatní",   klic: "C:FOTKY",   vyzaduje: ["nemovitost"], podslozky: [] },
  NAJEMCE_DOKLAD:     { nazev: "Doklad nájemce",          slozka: null,                   klic: "NAJEMNICI", vyzaduje: ["najemce"], podslozky: [] },
  OSTATNI:            { nazev: "Ostatní",                 slozka: null,                   klic: "OSTATNI",   vyzaduje: [], podslozky: [] },
};

export const KATEGORIE_KLICE = Object.keys(KATEGORIE) as KategorieKlic[];
export const jeKategorie = (k: unknown): k is KategorieKlic => typeof k === "string" && k in KATEGORIE;

/** Popisky, ktere server nacte z databaze — klient je nikdy neposila. */
export interface KontextPopisky {
  kategorie: KategorieKlic;
  propertyId?: string | null;
  propertyNazev?: string | null;
  tenantId?: string | null;
  tenantPopisek?: string | null;
  sluzbaKlic?: string | null;
  sluzbaNazev?: string | null;
  rok?: number | null;
}

export interface SegmentSlozky {
  /** Logicky klic segmentu; cely klic je spojeni klicu od korene. */
  klic: string;
  nazev: string;
}

/** Prevede libovolny nazev na bezpecne jmeno slozky nebo souboru. */
export function bezpecneJmeno(nazev: string, vychozi = "Bez názvu"): string {
  const t = nazev
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 100)
    .trim();
  return t || vychozi;
}

/** Chybi-li neco, co kategorie vyzaduje, vrati text chyby. */
export function chybaKontextu(k: KontextPopisky): string | null {
  const kat = KATEGORIE[k.kategorie];
  for (const v of kat.vyzaduje) {
    if (v === "nemovitost" && !k.propertyId) return "Chybí nemovitost.";
    if (v === "najemce" && !k.tenantId) return "Chybí nájemce.";
    if (v === "sluzba" && !k.sluzbaKlic) return "Chybí služba.";
    if (v === "rok" && !(k.rok && k.rok >= 1990 && k.rok <= 2100)) return "Chybí rok.";
  }
  return null;
}

/** Cesta od korene: seznam segmentu, ktere se maji zalozit (a znovu pouzit). */
export function cestaSlozek(k: KontextPopisky): SegmentSlozky[] {
  const kat = KATEGORIE[k.kategorie];
  const chyba = chybaKontextu(k);
  if (chyba) throw new Error(chyba);

  if (k.kategorie === "OSTATNI") return [{ klic: "OSTATNI", nazev: "Ostatní" }];
  if (k.kategorie === "NAJEMCE_DOKLAD") {
    return [
      { klic: "NAJEMNICI", nazev: "Nájemníci" },
      { klic: `T:${k.tenantId}`, nazev: bezpecneJmeno(k.tenantPopisek ?? String(k.tenantId)) },
    ];
  }

  const cesta: SegmentSlozky[] = [
    { klic: "NEM", nazev: "Nemovitosti" },
    { klic: `P:${k.propertyId}`, nazev: bezpecneJmeno(k.propertyNazev ?? String(k.propertyId)) },
    { klic: kat.klic, nazev: kat.slozka! },
  ];
  for (const p of kat.podslozky) {
    if (p === "najemce") cesta.push({ klic: `T:${k.tenantId}`, nazev: bezpecneJmeno(k.tenantPopisek ?? String(k.tenantId)) });
    if (p === "vyuct") cesta.push({ klic: "V:VYUCT", nazev: "Vyúčtování" });
    if (p === "rok") cesta.push({ klic: `R:${k.rok}`, nazev: String(k.rok) });
    if (p === "sluzba") cesta.push({ klic: `S:${k.sluzbaKlic}`, nazev: bezpecneJmeno(k.sluzbaNazev ?? String(k.sluzbaKlic)) });
  }
  return cesta;
}

/** Plny klic segmentu na indexu i (spojeni klicu od korene). */
export const plnyKlic = (cesta: SegmentSlozky[], i: number) => cesta.slice(0, i + 1).map((s) => s.klic).join("/");

// --- Kontrola souboru ---

export const MAX_VELIKOST = 100 * 1024 * 1024;

const ZAKAZANE_PRIPONY = new Set([
  "exe", "bat", "cmd", "com", "msi", "scr", "ps1", "vbs", "js", "jar", "sh", "app", "dll", "apk",
]);

export function pripona(nazev: string): string {
  const m = /\.([A-Za-z0-9]{1,10})$/.exec(nazev);
  return m ? m[1].toLowerCase() : "";
}

/** Vrati text chyby, nebo null, kdyz je soubor v poradku. */
export function chybaSouboru(nazev: string, velikost: number): string | null {
  if (!nazev.trim()) return "Soubor nemá název.";
  if (!Number.isFinite(velikost) || velikost <= 0) return "Soubor je prázdný.";
  if (velikost > MAX_VELIKOST) return `Soubor je větší než ${Math.round(MAX_VELIKOST / 1024 / 1024)} MB.`;
  if (ZAKAZANE_PRIPONY.has(pripona(nazev))) return `Soubory typu .${pripona(nazev)} se nenahrávají.`;
  return null;
}

export function formatVelikosti(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} kB`;
  return `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}
