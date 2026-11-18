/**
 * Pojistky: platby pojistneho podle frekvence a vyse platne k datu. Ciste vypocty bez
 * databaze (pouziva je Stav uctu, upozorneni i prehled pojisteni).
 */
export type Frekvence = "MESICNE" | "CTVRTLETNE" | "POLOLETNE" | "ROCNE";
export const FREKVENCE: Record<Frekvence, { mesicu: number; nazev: string; zaRok: number }> = {
  MESICNE: { mesicu: 1, nazev: "měsíčně", zaRok: 12 },
  CTVRTLETNE: { mesicu: 3, nazev: "čtvrtletně", zaRok: 4 },
  POLOLETNE: { mesicu: 6, nazev: "pololetně", zaRok: 2 },
  ROCNE: { mesicu: 12, nazev: "ročně", zaRok: 1 },
};
export const DRUHY_POJISTKY: Record<string, string> = {
  NEMOVITOST: "Pojištění nemovitosti",
  DOMACNOST: "Pojištění domácnosti",
  KOMBINOVANA: "Nemovitost + domácnost",
  ODPOVEDNOST: "Odpovědnost",
};

export interface PojistkaVstup {
  id: string;
  pojistovna: string;
  /** rrrr-mm-dd */
  od: string;
  do: string | null;
  frekvence: string;
  castka: number;
  /** rrrr-mm-dd: datum splatnosti, od nej se pocitaji dalsi platby (jinak od zacatku pojisteni) */
  splatnost?: string | null;
  zmeny?: { validFrom: string; castka: number }[];
}

const mesicu = (f: string) => FREKVENCE[f as Frekvence]?.mesicu ?? 12;

/** Vyse jedne platby platna k datu (rrrr-mm-dd). Pred prvni zmenou plati ta prvni. */
export function castkaKDatu(p: PojistkaVstup, datum: string): number {
  const zm = [...(p.zmeny ?? [])].sort((a, b) => a.validFrom.localeCompare(b.validFrom));
  if (!zm.length) return p.castka;
  let v = zm[0].castka;
  for (const z of zm) if (z.validFrom.slice(0, 10) <= datum) v = z.castka;
  return v;
}

/** Plati pojistka k datu? */
export const platiKDatu = (p: { od: string; do: string | null }, datum: string) => p.od <= datum && (!p.do || p.do >= datum);

/** Datum `i` kroku (po `krok` mesicich) od kotvy r/m/d; den se zarovna na konec kratsiho mesice. */
function posunuto(r0: number, m0: number, d0: number, mesicuPosun: number): string {
  const m = m0 - 1 + mesicuPosun;
  const r = r0 + Math.floor(m / 12), mm = ((m % 12) + 12) % 12 + 1;
  const posledni = new Date(Date.UTC(r, mm, 0)).getUTCDate();
  return `${r}-${String(mm).padStart(2, "0")}-${String(Math.min(d0, posledni)).padStart(2, "0")}`;
}

/**
 * Data splatnosti pojistneho od zacatku pojisteni po `doDne` (vcetne), po `frekvence` mesicich.
 * Kotvou je datum splatnosti ze smlouvy (napr. "splatne k 15. 3."), jinak zacatek pojisteni;
 * platby pred zacatkem pojisteni ani po jeho konci nevznikaji.
 */
export function splatnosti(p: PojistkaVstup, doDne: string): string[] {
  const out: string[] = [];
  const [r0, m0, d0] = (p.splatnost || p.od).split("-").map(Number);
  const krok = mesicu(p.frekvence);
  // Od kotvy zpet na prvni splatnost v dobe pojisteni
  let i = 0;
  while (i > -1200 && posunuto(r0, m0, d0, (i - 1) * krok) >= p.od) i--;
  while (i < 1200 && posunuto(r0, m0, d0, i * krok) < p.od) i++;
  for (; i < 1200; i++) {
    const datum = posunuto(r0, m0, d0, i * krok);
    if (datum > doDne || (p.do && datum > p.do)) break;
    out.push(datum);
  }
  return out;
}

/** Nejblizsi splatnost od dneska (vcetne), nebo null, kdyz pojisteni uz konci. */
export function pristiSplatnost(p: PojistkaVstup, dnes: string): string | null {
  const zaRok = new Date(Date.parse(`${dnes}T00:00:00Z`) + 400 * 86400000).toISOString().slice(0, 10);
  return splatnosti(p, zaRok).find((d) => d >= dnes) ?? null;
}

/** Rocni pojistne k datu (vyse platby × pocet plateb za rok). */
export const rocniPojistne = (p: PojistkaVstup, datum: string) => castkaKDatu(p, datum) * (FREKVENCE[p.frekvence as Frekvence]?.zaRok ?? 1);

/** Rizika, ktera AI u smlouvy posuzuje (kryto ano / ne / nejasne) */
export const RIZIKA = {
  POZAR: "Požár, výbuch, úder blesku",
  VICHRICE: "Vichřice, krupobití",
  POVODEN: "Povodeň",
  ZAPLAVA: "Záplava (přívalový déšť)",
  VODA_Z_POTRUBI: "Voda z vodovodního zařízení",
  TIHA_SNEHU: "Tíha sněhu a námrazy",
  SESUV: "Sesuv půdy, zemětřesení",
  KRADEZ: "Krádež, loupež",
  VANDALISMUS: "Vandalismus",
  SKLO: "Rozbití skla",
  PREPETI: "Přepětí, zkrat",
  ODPOVEDNOST: "Odpovědnost za škodu (vlastník)",
  ODPOVEDNOST_NAJEMCI: "Škody způsobené nájemcem / vůči nájemci",
  ZTRATA_NAJEMNEHO: "Ztráta nájemného",
} as const;
export type Riziko = keyof typeof RIZIKA;
