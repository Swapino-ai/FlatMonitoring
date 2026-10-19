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

// --- Nazvy souboru ---

/** Co je o souboru znamo — z toho se sklada citelny nazev. */
export interface PodkladNazvu {
  kategorie: KategorieKlic;
  nemovitost?: string | null;
  najemce?: string | null;
  /** "Elektřina (ČEZ prodej)" nebo u spolecneho dokladu nazev skupiny */
  sluzba?: string | null;
  /** Obdobi vyuctovani (ISO) */
  obdobi?: [string, string] | null;
  rok?: number | null;
  /** Cislo dokladu (VN-2026-0001) */
  cislo?: string | null;
  /** Zacatek smlouvy (ISO) */
  od?: string | null;
}

const dny = (iso: string) => { const [r, m, d] = iso.slice(0, 10).split("-"); return `${Number(d)}.${Number(m)}.${r}`; };
/** Obdobi pro nazev: cely kalendarni rok jako "2025", jinak "1.3.2025–28.2.2026" */
const obdobiNazvu = ([od, doDne]: [string, string]) =>
  od.slice(5, 10) === "01-01" && doDne.slice(5, 10) === "12-31" && od.slice(0, 4) === doDne.slice(0, 4) ? od.slice(0, 4) : `${dny(od)}–${dny(doDne)}`;

/**
 * Citelny nazev souboru podle toho, k cemu patri, napr.
 * "Vyúčtování Elektřina (ČEZ prodej) – Nový Bor – 1.3.2024–12.11.2024.pdf".
 * Fotky a ostatni si nechavaji puvodni nazev (vypovida vic nez kategorie).
 */
export function navrhNazvu(p: PodkladNazvu, puvodni: string): string {
  const ext = pripona(puvodni);
  const casti: (string | null | undefined)[] = (() => {
    const kde = p.nemovitost;
    switch (p.kategorie) {
      case "SLUZBA_VYUCTOVANI": return [p.sluzba?.startsWith("Společné vyúčtování") ? p.sluzba : `Vyúčtování ${p.sluzba ?? "služby"}`, kde, p.obdobi ? obdobiNazvu(p.obdobi) : p.rok ? String(p.rok) : null];
      case "VYUCTOVANI_NAJEMCE": return [`Vyúčtování nájemci${p.cislo ? ` ${p.cislo}` : ""}`, kde, p.najemce, p.obdobi ? obdobiNazvu(p.obdobi) : null];
      case "NAJEMNI_SMLOUVA":
      case "PREDAVACI_PROTOKOL": return [KATEGORIE[p.kategorie].nazev, kde, p.najemce, p.od ? `od ${dny(p.od)}` : null];
      case "SLUZBA_SMLOUVA": return [`Smlouva ${p.sluzba ?? "o službě"}`, kde];
      case "DANE": return [`Daně${p.rok ? ` ${p.rok}` : ""}`, kde];
      case "NAJEMCE_DOKLAD": return ["Doklad nájemce", p.najemce];
      case "KUPNI_SMLOUVA": case "KATASTR": case "UVER": return [KATEGORIE[p.kategorie].nazev, kde];
      default: return [];
    }
  })();
  const dane = casti.filter((x): x is string => !!x);
  if (!dane.length) return bezpecneJmeno(puvodni, "soubor");
  // Zkracuje se jen prvni cast (popis), nemovitost a obdobi zustanou vzdy cele
  const [prvni, ...zbytek] = dane.map((x) => bezpecneJmeno(x));
  return `${[prvni.slice(0, 80).trim(), ...zbytek].join(" – ")}${ext ? `.${ext}` : ""}`;
}

/** Dalsi soubor se stejnym nazvem dostane poradove cislo: "… (2).pdf" */
export function bezKolize(nazev: string, obsazene: Iterable<string>): string {
  const vsechny = new Set(obsazene);
  if (!vsechny.has(nazev)) return nazev;
  const ext = pripona(nazev);
  const zaklad = ext ? nazev.slice(0, -(ext.length + 1)) : nazev;
  for (let i = 2; ; i++) {
    const n = `${zaklad} (${i})${ext ? `.${ext}` : ""}`;
    if (!vsechny.has(n)) return n;
  }
}

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
