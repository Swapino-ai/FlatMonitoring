import { platnyKDatu } from "./zalohy";

/**
 * Vyuctovani sluzeb. Cisty vypocet bez databaze, aby sel testovat a bezel i v prohlizeci.
 *
 * Dny jsou ISO retezce yyyy-mm-dd a obdobi jsou vcetne obou konců. Vyuctovani
 * dodavatele muze zasahovat do vice smluv (najemnik odejde v polovine) a
 * najemcovo vyuctovani do vice vyuctovani dodavatele, proto se vsechno
 * odvozuje ze dnu, ne z mesicu.
 */

export type RezimDeleni = "DAYS" | "READINGS";

export interface VyuctovaniVstup {
  id: string;
  od: string;
  do: string;
  naklad: number;
  zalohyDodavateli: number;
  rezim: RezimDeleni;
  jednotka?: string | null;
  spotrebaVlastnik?: number | null;
  /** Spotreba najemce podle id smlouvy. */
  odecty: Record<string, number>;
}

export interface NajemVstup {
  id: string;
  nazev: string;
  od: string;
  do: string | null;
  utilitiesMonthly: number;
  historieZaloh?: { validFrom: Date | string; amount: number }[];
}

const DEN_MS = 24 * 3600 * 1000;
const cas = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const naIso = (t: number) => new Date(t).toISOString().slice(0, 10);

export function dnuVObdobi(od: string, doDne: string): number {
  return Math.max(0, Math.round((cas(doDne) - cas(od)) / DEN_MS) + 1);
}

export function pridejDny(iso: string, n: number): string {
  return naIso(cas(iso) + n * DEN_MS);
}

/** Prunik dvou obdobi, nebo null. Konec null = bez konce. */
export function prunik(od1: string, do1: string | null, od2: string, do2: string | null): [string, string] | null {
  const od = od1 > od2 ? od1 : od2;
  const konce = [do1, do2].filter((x): x is string => x != null);
  if (konce.length === 0) return null;
  const konec = konce.reduce((a, b) => (a < b ? a : b));
  return od <= konec ? [od, konec] : null;
}

export interface PodilNajemce {
  leaseId: string;
  nazev: string;
  dnu: number;
  /** Od-do, kdy se v obdobi skutecne pocitalo (po orezu). */
  od: string | null;
  do: string | null;
  spotreba?: number;
  podil: number;
  chybiOdecet?: boolean;
}

export interface Rozuctovani {
  dnuObdobi: number;
  podily: PodilNajemce[];
  vlastnik: { dnu: number; podil: number };
  /** Zalohy dodavateli minus naklad; kladne = preplatek u dodavatele. */
  vysledekDodavatel: number;
  /** Cena za den, nebo za jednotku spotreby. */
  jednotkovaCena: number | null;
  chyba?: string;
}

/**
 * Rozdeli naklad vyuctovani mezi najemce. Dny bez najemce nese vlastnik.
 * Kdyz dva najmy pokryvaji stejny den, den se mezi ne deli rovnym dilem.
 *
 * `orez` omezi pocitane dny (najemcovo vyuctovani za jiny rozsah, nez je
 * obdobi dodavatele); u odectu se podil krati pomerem dnu.
 */
export function rozuctuj(v: VyuctovaniVstup, najmy: NajemVstup[], orez?: [string, string]): Rozuctovani {
  const dnuObdobi = dnuVObdobi(v.od, v.do);
  const vysledekDodavatel = v.zalohyDodavateli - v.naklad;
  const prazdne = (chyba: string): Rozuctovani => ({
    dnuObdobi, podily: [], vlastnik: { dnu: dnuObdobi, podil: v.naklad }, vysledekDodavatel, jednotkovaCena: null, chyba,
  });
  if (dnuObdobi <= 0) return prazdne("Konec období je před začátkem.");

  // Ktere najmy se s obdobim potkaji
  const dotcene = najmy.filter((n) => prunik(n.od, n.do, v.od, v.do) != null);

  const dnyNajmu = new Map<string, number>();
  const rozsah = new Map<string, [string, string]>();
  const dnyOrezane = new Map<string, number>();
  const dilyDne = new Map<string, number>(); // soucet podilu dne pro DAYS
  let dnuBezNajemce = 0;

  for (let t = cas(v.od); t <= cas(v.do); t += DEN_MS) {
    const d = naIso(t);
    const aktivni = dotcene.filter((n) => n.od <= d && (n.do == null || d <= n.do));
    if (aktivni.length === 0) { dnuBezNajemce += 1; continue; }
    const vOrezu = !orez || (d >= orez[0] && d <= orez[1]);
    for (const n of aktivni) {
      dnyNajmu.set(n.id, (dnyNajmu.get(n.id) ?? 0) + 1);
      const r = rozsah.get(n.id);
      rozsah.set(n.id, r ? [r[0], d] : [d, d]);
      if (vOrezu) {
        dnyOrezane.set(n.id, (dnyOrezane.get(n.id) ?? 0) + 1);
        dilyDne.set(n.id, (dilyDne.get(n.id) ?? 0) + 1 / aktivni.length);
      }
    }
  }

  if (v.rezim === "READINGS") {
    const spotrebaNajemcu = dotcene.reduce((a, n) => a + (v.odecty[n.id] ?? 0), 0);
    const celkem = spotrebaNajemcu + (v.spotrebaVlastnik ?? 0);
    if (celkem <= 0) return prazdne("Zadej spotřebu podle odečtů.");
    const cena = v.naklad / celkem;
    const podily: PodilNajemce[] = dotcene.map((n) => {
      const spotreba = v.odecty[n.id];
      const celyDnu = dnyNajmu.get(n.id) ?? 0;
      const kratit = celyDnu > 0 ? (dnyOrezane.get(n.id) ?? 0) / celyDnu : 0;
      const r = rozsah.get(n.id);
      return {
        leaseId: n.id, nazev: n.nazev, dnu: dnyOrezane.get(n.id) ?? 0,
        od: r?.[0] ?? null, do: r?.[1] ?? null,
        spotreba: spotreba ?? 0, podil: (spotreba ?? 0) * cena * kratit, chybiOdecet: spotreba == null,
      };
    });
    return {
      dnuObdobi, podily,
      vlastnik: { dnu: dnuBezNajemce, podil: (v.spotrebaVlastnik ?? 0) * cena },
      vysledekDodavatel, jednotkovaCena: cena,
    };
  }

  const cenaDen = v.naklad / dnuObdobi;
  const podily: PodilNajemce[] = dotcene.map((n) => {
    const r = rozsah.get(n.id);
    return {
      leaseId: n.id, nazev: n.nazev, dnu: dnyOrezane.get(n.id) ?? 0,
      od: r?.[0] ?? null, do: r?.[1] ?? null,
      podil: (dilyDne.get(n.id) ?? 0) * cenaDen,
    };
  });
  return {
    dnuObdobi, podily, vlastnik: { dnu: dnuBezNajemce, podil: dnuBezNajemce * cenaDen },
    vysledekDodavatel, jednotkovaCena: cenaDen,
  };
}

/** Dny z rozsahu, ktere zadne z vyuctovani nepokryva, sloucene do souvislych useku. */
export function nepokryto(rozsah: [string, string], vyuctovani: { od: string; do: string }[]): [string, string][] {
  const useky: [string, string][] = [];
  let start: string | null = null;
  let posledni: string | null = null;
  for (let t = cas(rozsah[0]); t <= cas(rozsah[1]); t += DEN_MS) {
    const d = naIso(t);
    const kryto = vyuctovani.some((v) => v.od <= d && d <= v.do);
    if (!kryto) {
      if (start === null) start = d;
      posledni = d;
    } else if (start !== null) {
      useky.push([start, posledni!]);
      start = null;
    }
  }
  if (start !== null) useky.push([start, posledni!]);
  return useky;
}

/**
 * Zalohy, ktere najemce mel v rozsahu zaplatit. Kazdy den nese cast zalohy platne
 * ten den (mesicni castka / dny v mesici), takze zmena zaloh uprostred mesice
 * i necely mesic vychazeji presne.
 */
export function zalohyZaRozsah(n: NajemVstup, od: string, doDne: string): number {
  const r = prunik(od, doDne, n.od, n.do);
  if (!r) return 0;
  let suma = 0;
  for (let t = cas(r[0]); t <= cas(r[1]); t += DEN_MS) {
    const dt = new Date(t);
    const platna = platnyKDatu(n.historieZaloh ?? [], dt);
    const castka = platna ? platna.amount : n.utilitiesMonthly;
    const dnuVMesici = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
    suma += castka / dnuVMesici;
  }
  return suma;
}

export interface SluzbaVyuctovani {
  id: string;
  nazev: string;
  dodavatel: string;
  prectena: boolean;
  vyuctovani: VyuctovaniVstup[];
}

export interface RadekNajemce {
  sluzbaId: string;
  nazev: string;
  dodavatel: string;
  /** Jednotlive vyuctovani, ze kterych se radek sklada. */
  zdroje: { id: string; od: string; do: string; podil: number; spotreba?: number; jednotka?: string | null; chybiOdecet?: boolean }[];
  castka: number;
  chybi: [string, string][];
}

export interface VyuctovaniNajemce {
  od: string;
  do: string;
  radky: RadekNajemce[];
  naklady: number;
  zalohy: number;
  /** Zalohy minus naklady; kladne = vratka najemci, zaporne = doplatek. */
  rozdil: number;
  neuplne: boolean;
  chyba?: string;
}

/**
 * Vyuctovani pro jednoho najemce za zvolene obdobi: podily ze vsech vyuctovani
 * prectenych sluzeb proti zaloham podle smlouvy. Obdobi se orizne na dobu najmu.
 */
export function vyuctovaniNajemce(
  najem: NajemVstup, najmy: NajemVstup[], sluzby: SluzbaVyuctovani[], od: string, doDne: string,
): VyuctovaniNajemce {
  const r = prunik(od, doDne, najem.od, najem.do);
  if (!r) {
    return { od, do: doDne, radky: [], naklady: 0, zalohy: 0, rozdil: 0, neuplne: false, chyba: "Zvolené období nezasahuje do doby nájmu." };
  }

  const radky: RadekNajemce[] = [];
  for (const s of sluzby.filter((x) => x.prectena)) {
    const zdroje: RadekNajemce["zdroje"] = [];
    for (const v of s.vyuctovani) {
      if (!prunik(v.od, v.do, r[0], r[1])) continue;
      const rozdel = rozuctuj(v, najmy, r);
      const moje = rozdel.podily.find((p) => p.leaseId === najem.id);
      if (!moje || (moje.dnu === 0 && !moje.podil)) continue;
      zdroje.push({
        id: v.id, od: v.od, do: v.do, podil: moje.podil,
        spotreba: moje.spotreba, jednotka: v.jednotka, chybiOdecet: moje.chybiOdecet,
      });
    }
    radky.push({
      sluzbaId: s.id, nazev: s.nazev, dodavatel: s.dodavatel, zdroje,
      castka: zdroje.reduce((a, z) => a + z.podil, 0),
      chybi: nepokryto(r, s.vyuctovani),
    });
  }

  const naklady = radky.reduce((a, x) => a + x.castka, 0);
  const zalohy = zalohyZaRozsah(najem, r[0], r[1]);
  return {
    od: r[0], do: r[1], radky, naklady, zalohy, rozdil: zalohy - naklady,
    neuplne: radky.some((x) => x.chybi.length > 0 || x.zdroje.some((z) => z.chybiOdecet)),
  };
}
