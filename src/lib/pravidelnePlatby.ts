import { zalohyZaRozsah, type NajemVstup as NajemVyuct, prunik, pridejDny } from "./vyuctovani";
import { mesicniNaklad, sluzbaKDatu, type SluzbaVstup } from "./zalohy";

/**
 * Navrh pravidelnych mesicnich plateb (najem, zalohy od najemce, platby sluzeb dodavatelum).
 * Cisty vypocet bez databaze. Nic se nezauctuje samo: navrh se ukaze a clovek ho potvrdi.
 */

export type DruhPlatby = "NAJEM" | "ZALOHA" | "SLUZBA" | "UVER" | "VYUCTOVANI";

export interface NavrzenaPlatba {
  /** Stabilni klic, podle ktereho se pozna, ze uz je zauctovano. */
  klic: string;
  druh: DruhPlatby;
  /** rrrr-mm */
  mesic: string;
  /** rrrr-mm-dd */
  datum: string;
  popis: string;
  /** Seskupeni: nájemce (najem a zalohy) nebo dodavatel (platby sluzeb). */
  skupina: { typ: "NAJEMCE" | "DODAVATEL"; nazev: string };
  /** Kladne = prijem, zaporne = vydaj. */
  castka: number;
  kategorie: string;
  /** Nesedi cely mesic (nastup ci konec najmu): castka je pomerna. */
  castecny?: boolean;
  /** Bez zaznamu o zaplaceni je platba nezaplacena. */
  stav: "nezaplaceno" | "zaplaceno";
  zaplaceno?: ZaplacenaPlatba;
}

export interface ZaplacenaPlatba {
  /** Kdy byla zaplacena (rrrr-mm-dd). */
  datum: string;
  /** Skutecne zaplacena castka (kladna). */
  castka: number;
  /** EVIDENCE = zapsano v prehledu; POHYB = starsi platba zauctovana jako pohyb (jen ke cteni). */
  zdroj: "EVIDENCE" | "POHYB";
}

export interface NajemPlatba extends NajemVyuct {
  rentMonthly: number;
  paymentDay: number;
}

export interface SluzbaPlatba extends SluzbaVstup {
  id: string;
  nazevDruhu: string;
}

/** Uver se mesicni splatkou (aktivni). Splatka pada na stejny den v mesici jako zacatek uveru. */
export interface UverPlatba {
  id: string;
  veritel: string;
  /** rrrr-mm-dd */
  od: string;
  pocetSplatek: number;
  splatka: number;
}

/** Vysledek vyuctovani sluzby od dodavatele: rozdil > 0 = nedoplatek (dluzim), < 0 = preplatek (dodavatel vraci). */
export interface VyuctovaniPlatba {
  id: string;
  /** Kdy vyuctovani prislo (rrrr-mm-dd). */
  datum: string;
  obdobiOd: string;
  obdobiDo: string;
  rozdil: number;
  dodavatel: string;
  nazevDruhu: string;
}

/** Starsi platba zauctovana jako pohyb (se klicem): povazuje se za zaplacenou k datu pohybu. */
export interface ExistujiciPohyb {
  date: string;
  category: string;
  sourceKey: string | null;
  amount?: number;
}

const KATEGORIE_SLUZBY: Record<string, string> = { SVJ_FEE: "SVJ_FEE", INSURANCE: "INSURANCE", MANAGEMENT: "MANAGEMENT" };

const dvou = (n: number) => String(n).padStart(2, "0");
const mesicDo = (rok: number, mesic0: number) => new Date(Date.UTC(rok, mesic0 + 1, 0)).getUTCDate();

/** Mesice (rrrr-mm) od `od` do `doDne` vcetne. */
export function mesiceMezi(od: string, doDne: string): string[] {
  const out: string[] = [];
  let r = Number(od.slice(0, 4));
  let m = Number(od.slice(5, 7)) - 1;
  const konec = doDne.slice(0, 7);
  for (;;) {
    const k = `${r}-${dvou(m + 1)}`;
    if (k > konec) break;
    out.push(k);
    m += 1;
    if (m > 11) { m = 0; r += 1; }
  }
  return out;
}

/**
 * Navrh plateb od zacatku nejstarsi smlouvy (nebo sluzby) do dnesniho dne. Platba s datem
 * v budoucnu se nenavrhuje. Zauctovane (stejny klic) maji stav "zauctovano".
 */
export function navrhniPlatby(a: {
  najmy: NajemPlatba[];
  sluzby: SluzbaPlatba[];
  uvery?: UverPlatba[];
  vyuctovani?: VyuctovaniPlatba[];
  pohyby: ExistujiciPohyb[];
  /** Zaplacene platby z prehledu (klic -> datum a castka). */
  zaplaceno?: { klic: string; datum: string; castka: number }[];
  dnes: string;
}): NavrzenaPlatba[] {
  const { najmy, sluzby, pohyby, dnes } = a;
  const zaplacenoMapa = new Map<string, ZaplacenaPlatba>();
  for (const p of pohyby) if (p.sourceKey) zaplacenoMapa.set(p.sourceKey, { datum: p.date, castka: Math.abs(p.amount ?? 0), zdroj: "POHYB" });
  for (const z of a.zaplaceno ?? []) zaplacenoMapa.set(z.klic, { datum: z.datum, castka: z.castka, zdroj: "EVIDENCE" });
  const zacatky = [...najmy.map((n) => n.od), ...sluzby.map((s) => (s.contractStart ? String(s.contractStart).slice(0, 10) : null)).filter((x): x is string => !!x)];
  const uvery = a.uvery ?? [];
  const vyuctovani = a.vyuctovani ?? [];
  // Okno sledovani zacina nejstarsi smlouvou ci sluzbou; splatky uveru pred nim uz nikoho nezajimaji
  const zacatekSledovani = zacatky.length ? zacatky.reduce((x, y) => (x < y ? x : y)) : null;
  const zacatkyVse = [...zacatky, ...uvery.map((u) => u.od), ...vyuctovani.map((v) => v.datum)];
  if (zacatkyVse.length === 0) return [];
  const od = zacatkyVse.reduce((x, y) => (x < y ? x : y));

  const out: NavrzenaPlatba[] = [];
  const pridej = (p: Omit<NavrzenaPlatba, "stav" | "zaplaceno">) => {
    if (p.datum > dnes) return;
    const z = zaplacenoMapa.get(p.klic);
    out.push({ ...p, stav: z ? "zaplaceno" : "nezaplaceno", zaplaceno: z });
  };

  for (const mesic of mesiceMezi(od, dnes)) {
    const r = Number(mesic.slice(0, 4));
    const m0 = Number(mesic.slice(5, 7)) - 1;
    const prvni = `${mesic}-01`;
    const posledni = `${mesic}-${dvou(mesicDo(r, m0))}`;
    const dniVMesici = mesicDo(r, m0);

    for (const n of najmy) {
      const prekryv = prunik(n.od, n.do, prvni, posledni);
      if (!prekryv) continue;
      const dnu = Math.round((Date.parse(`${prekryv[1]}T00:00:00Z`) - Date.parse(`${prekryv[0]}T00:00:00Z`)) / 86400000) + 1;
      const castecny = dnu < dniVMesici;
      const podil = dnu / dniVMesici;
      // Den platby: splatnost v mesici, ale ne mimo dobu najmu
      let datum = `${mesic}-${dvou(Math.min(Math.max(n.paymentDay, 1), 28))}`;
      if (datum < prekryv[0]) datum = prekryv[0];
      if (datum > prekryv[1]) datum = prekryv[1];

      if (n.rentMonthly > 0) {
        pridej({
          klic: `najem:${n.id}:${mesic}`, druh: "NAJEM", mesic, datum, kategorie: "RENT", castecny,
          skupina: { typ: "NAJEMCE", nazev: n.nazev },
          popis: `Nájemné ${mesic.slice(5)}/${r} · ${n.nazev}${castecny ? ` (${dnu} z ${dniVMesici} dní)` : ""}`,
          castka: Math.round(n.rentMonthly * podil * 100) / 100,
        });
      }
      const zaloha = Math.round(zalohyZaRozsah(n, prekryv[0], prekryv[1]) * 100) / 100;
      if (zaloha > 0) {
        pridej({
          klic: `zaloha:${n.id}:${mesic}`, druh: "ZALOHA", mesic, datum, kategorie: "UTILITIES_ADVANCE", castecny,
          skupina: { typ: "NAJEMCE", nazev: n.nazev },
          popis: `Zálohy na služby ${mesic.slice(5)}/${r} · ${n.nazev}${castecny ? ` (${dnu} z ${dniVMesici} dní)` : ""}`,
          castka: zaloha,
        });
      }
    }

    // Sluzby: cena platna v patnactem dni mesice (stejne pravidlo jako casova osa zaloh)
    const patnacty = new Date(Date.UTC(r, m0, 15));
    for (const s of sluzby) {
      const cena = Math.round(mesicniNaklad(sluzbaKDatu(s, patnacty)) * 100) / 100;
      if (cena <= 0) continue;
      pridej({
        klic: `sluzba:${s.id}:${mesic}`, druh: "SLUZBA", mesic, datum: prvni, kategorie: KATEGORIE_SLUZBY[s.type] ?? "UTILITIES",
        skupina: { typ: "DODAVATEL", nazev: s.provider.trim() || "Bez dodavatele" },
        popis: `${s.nazevDruhu} ${mesic.slice(5)}/${r}`,
        castka: -cena,
      });
    }
  }

  // Splatky uveru: kazdy mesic trvani uveru, den dle zacatku uveru
  for (const u of uvery) {
    if (u.splatka <= 0) continue;
    const prvniMesic = zacatekSledovani && zacatekSledovani > u.od ? zacatekSledovani.slice(0, 7) : u.od.slice(0, 7);
    // Prvni splatka je o mesic po cerpani; posledni po poctu splatek
    let r = Number(u.od.slice(0, 4)), m = Number(u.od.slice(5, 7)) - 1;
    const den = Math.min(Number(u.od.slice(8, 10)), 28);
    for (let i = 1; i <= u.pocetSplatek; i++) {
      m += 1;
      if (m > 11) { m = 0; r += 1; }
      const mesic = `${r}-${dvou(m + 1)}`;
      if (mesic < prvniMesic) continue;
      pridej({
        klic: `uver:${u.id}:${mesic}`, druh: "UVER", mesic, datum: `${mesic}-${dvou(den)}`, kategorie: "LOAN_PRINCIPAL",
        skupina: { typ: "DODAVATEL", nazev: u.veritel.trim() || "Úvěr" },
        popis: `Splátka úvěru ${mesic.slice(5)}/${r} · ${u.veritel}`,
        castka: -u.splatka,
      });
    }
  }

  // Nedoplatky a preplatky z vyuctovani sluzeb od dodavatelu
  const dateCz = (iso: string) => `${Number(iso.slice(8, 10))}. ${Number(iso.slice(5, 7))}. ${iso.slice(0, 4)}`;
  for (const v of vyuctovani) {
    if (Math.abs(v.rozdil) < 0.5) continue;
    pridej({
      klic: `vyuctovani:${v.id}`, druh: "VYUCTOVANI", mesic: v.datum.slice(0, 7), datum: v.datum,
      kategorie: v.rozdil > 0 ? "UTILITIES" : "OTHER_INCOME",
      skupina: { typ: "DODAVATEL", nazev: v.dodavatel.trim() || "Bez dodavatele" },
      popis: `${v.rozdil > 0 ? "Nedoplatek" : "Přeplatek"} z vyúčtování · ${v.nazevDruhu} ${dateCz(v.obdobiOd)} – ${dateCz(v.obdobiDo)}`,
      castka: -Math.round(v.rozdil * 100) / 100,
    });
  }
  return out;
}

export { pridejDny };


export interface DluhSkupiny {
  typ: "NAJEMCE" | "DODAVATEL";
  nazev: string;
  /** Kolik chybi zaplatit (kladne cislo). */
  dluh: number;
  /** Z toho kolik polozek je uplne nezaplaceno. */
  nezaplacenych: number;
  /** Polozek, ktere jsou zaplacene mene, nez je predpis. */
  nedoplaceno: number;
  nejstarsi: string | null;
  /** Zaplaceno navic oproti predpisu. */
  preplaceno: number;
}

export interface PrehledPlateb {
  najemci: DluhSkupiny[];
  dodavatele: DluhSkupiny[];
  /** Kolik celkem dluzi najemci. */
  najemciDluzi: number;
  /** Kolik celkem dluzim dodavatelum ja. */
  dluzimDodavatelum: number;
  /** Preplatky z vyuctovani, ktere mi dodavatele jeste nevratili. */
  dodavateleDluzi: number;
  zaplacenoCelkem: { prijmy: number; vydaje: number };
}

/**
 * Prehled dluhu z navrzenych plateb: nezaplacena polozka dluzi celou castku, zaplacena mene dluzi
 * rozdil. Vsechny navrzene platby jsou uz splatne (budouci se nenavrhuji), proto se pocitaji vsechny.
 */
export function prehledPlateb(navrh: NavrzenaPlatba[]): PrehledPlateb {
  const m = new Map<string, DluhSkupiny>();
  let prijmy = 0;
  let vydaje = 0;
  let pohledavky = 0;
  for (const p of navrh) {
    const k = `${p.skupina.typ}:${p.skupina.nazev}`;
    const g = m.get(k) ?? { typ: p.skupina.typ, nazev: p.skupina.nazev, dluh: 0, nezaplacenych: 0, nedoplaceno: 0, nejstarsi: null, preplaceno: 0 };
    const predpis = Math.abs(p.castka);
    // Preplatek od dodavatele: dodavatel dluzi mne, nezapocitava se do toho, co dluzim ja
    if (p.skupina.typ === "DODAVATEL" && p.castka > 0) {
      if (!p.zaplaceno) pohledavky += predpis;
      else {
        const chybi = predpis - p.zaplaceno.castka;
        if (chybi > 0.005) pohledavky += chybi;
        prijmy += p.zaplaceno.castka;
      }
      continue;
    }
    if (!p.zaplaceno) {
      g.dluh += predpis;
      g.nezaplacenych += 1;
      if (!g.nejstarsi || p.datum < g.nejstarsi) g.nejstarsi = p.datum;
    } else {
      const rozdil = predpis - p.zaplaceno.castka;
      if (rozdil > 0.005) { g.dluh += rozdil; g.nedoplaceno += 1; if (!g.nejstarsi || p.datum < g.nejstarsi) g.nejstarsi = p.datum; }
      else if (rozdil < -0.005) g.preplaceno += -rozdil;
      if (p.castka > 0) prijmy += p.zaplaceno.castka; else vydaje += p.zaplaceno.castka;
    }
    m.set(k, g);
  }
  const zaokr = (n: number) => Math.round(n * 100) / 100;
  const skupiny = [...m.values()].map((g) => ({ ...g, dluh: zaokr(g.dluh), preplaceno: zaokr(g.preplaceno) }));
  const najemci = skupiny.filter((g) => g.typ === "NAJEMCE").sort((a, b) => b.dluh - a.dluh);
  const dodavatele = skupiny.filter((g) => g.typ === "DODAVATEL").sort((a, b) => b.dluh - a.dluh);
  return {
    najemci, dodavatele,
    najemciDluzi: zaokr(najemci.reduce((a, g) => a + g.dluh, 0)),
    dluzimDodavatelum: zaokr(dodavatele.reduce((a, g) => a + g.dluh, 0)),
    dodavateleDluzi: zaokr(pohledavky),
    zaplacenoCelkem: { prijmy: zaokr(prijmy), vydaje: zaokr(vydaje) },
  };
}
