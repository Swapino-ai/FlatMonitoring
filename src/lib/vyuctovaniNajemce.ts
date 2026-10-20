/**
 * Vyuctovani sluzeb pro najemce (pruvodce). Cisty vypocet bez databaze — bezi na serveru
 * pri vydani i v prohlizeci pro nahled, a jde testovat.
 *
 * Pravidla:
 * - Kazda sluzba se vyuctuje za dny, ktere uz dodavatel vyuctoval, souvisle od posledniho
 *   vyuctovani teto sluzby najemci. Co dodavatel jeste nevyuctoval, se prenese do dalsiho
 *   vyuctovani (naklady i zalohy) — nic se neodhaduje a nic se neztrati.
 * - Dny, kdy sluzba vubec neplatila (zacala pozdeji, skoncila), se nepocitaji.
 * - Najemce jen cast obdobi dodavatele: podle odectu meraku, kde jsou; jinak podle dnu.
 * - Zalohy jsou cele zalohy za dny obdobi (co najemce kazdy mesic platí). Prenesene naklady
 *   se vyuctuji v dalsim vyuctovani proti jeho zalohám.
 */
import { dnuVObdobi, pridejDny, prunik, rozuctuj, type NajemVstup, type VyuctovaniVstup } from "./vyuctovani";
import { platnyKDatu, type PolozkaZalohy, type ZmenaZaloh } from "./zalohy";
import { retezceMeraku, spotrebaVObdobi, type MerakSeStavy } from "./meraky";

const DEN = 86400000;
const cas = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const naIso = (t: number) => new Date(t).toISOString().slice(0, 10);
const min = (a: string, b: string) => (a < b ? a : b);
const max = (a: string, b: string) => (a > b ? a : b);
const cz = (iso: string) => { const [r, m, d] = iso.split("-"); return `${Number(d)}. ${Number(m)}. ${r}`; };

export interface SluzbaProNajemce {
  id: string;
  nazev: string;
  dodavatel: string;
  /** Skupina sluzeb (spolecne vyuctovani) */
  skupina: string | null;
  /** Hradi najemce zalohou — predvybrana v pruvodci */
  prectena: boolean;
  /** Kdy sluzba platila (null = bez omezeni) */
  aktivniOd: string | null;
  aktivniDo: string | null;
  /** Mesicni naklad — vaha pro rozdeleni zaloh bez rozpisu */
  vaha: number;
  vyuctovani: VyuctovaniVstup[];
  /** Meraky teto sluzby se stavy (spotreba najemce podle odectu) */
  meraky: MerakSeStavy[];
  jednotka: string | null;
}

export interface NajemProVyuctovani extends NajemVstup {
  /** Rozpis zaloh po sluzbach (bez historie) */
  advanceItems?: PolozkaZalohy[] | null;
  historieZaloh?: ZmenaZaloh[];
}

/** Drive vydane (nestornovane) vyuctovani teze smlouvy. */
export interface DrivejsiVyuctovani {
  od: string;
  do: string;
  /** Do kdy byla ktera sluzba vyuctovana (nove doklady); starsi doklady ho nemaji = cele obdobi */
  sluzbyDo?: Record<string, string> | null;
}

export type StavSluzby = "VYUCTOVANO" | "NEVYBRANA" | "NEPLATILA" | "JIZ_VYUCTOVANO" | "BEZ_VYUCTOVANI";

export interface ZdrojRadku {
  id: string;
  od: string;
  do: string;
  podil: number;
  metoda: "dny" | "odecty" | "meraky" | "cele";
  spotreba?: number;
  jednotka?: string | null;
  dnu?: number;
  chybiOdecet?: boolean;
  /** Stav meraku nebyl presne k danemu dni — pouzit nejblizsi (chce potvrzeni) */
  priblizne?: Odchylka[];
}

/** Pouzity odecet misto chybejiciho: chtene datum a datum skutecneho odectu. */
export interface Odchylka { chtene: string; pouzite: string }

/** "stav k 1. 3. 2024 vzat z odečtu 15. 3. 2024 (o 14 dní později)" */
export function popisOdchylky(o: Odchylka): string {
  const dni = Math.round((Date.parse(`${o.pouzite}T00:00:00Z`) - Date.parse(`${o.chtene}T00:00:00Z`)) / 86400000);
  const f = (iso: string) => { const [r, m, d] = iso.split("-"); return `${Number(d)}. ${Number(m)}. ${r}`; };
  return `stav k ${f(o.chtene)} vzat z odečtu ${f(o.pouzite)} (o ${Math.abs(dni)} dní ${dni > 0 ? "později" : "dříve"})`;
}

export interface RadekSluzby {
  sluzbaId: string;
  nazev: string;
  dodavatel: string;
  skupina: string | null;
  stav: StavSluzby;
  vybrana: boolean;
  /** Vyuctovane dny teto sluzby (null = nic) */
  od: string | null;
  do: string | null;
  /** Dny, ktere dodavatel jeste nevyuctoval — prenesou se do dalsiho vyuctovani */
  preneseno: [string, string] | null;
  /** Proc se prenasi (presah vyuctovani dodavatele, chybejici stav meraku, zatim nevyuctovano) */
  duvodPrenosu?: string | null;
  zdroje: ZdrojRadku[];
  castka: number;
  /** Nepouziva se (zalohy se pocitaji za cele obdobi) */
  zalohy: number;
}

export interface SkupinaVyuctovani {
  nazev: string | null;
  radky: RadekSluzby[];
  castka: number;
}

export interface ObdobiZalohNajemce { mesicne: number; od: string; do: string; castka: number }

export interface VysledekNajemce {
  od: string;
  do: string;
  /** Vsechny sluzby i s tim, proc se (ne)vyuctovaly — pro pruvodce */
  sluzby: RadekSluzby[];
  /** Vyuctovane sluzby po skupinach — pro doklad */
  skupiny: SkupinaVyuctovani[];
  naklady: number;
  zalohy: number;
  /** Zalohy minus naklady; kladne = vratka najemci, zaporne = doplatek */
  rozdil: number;
  /** Zalohy po usecich se stejnou mesicni castkou */
  zalohyObdobi: ObdobiZalohNajemce[];
  /** Do kdy je ktera sluzba po tomto vyuctovani vyuctovana */
  sluzbyDo: Record<string, string>;
  chybiOdecet: boolean;
  /** Nekde se pouzil nejblizsi odecet misto presneho — pred vydanim potvrdit */
  priblizne: boolean;
  chyba?: string;
}

/** Zaloha najemce za jeden den (mesicni castka / dny v mesici) a rozpis po sluzbach. */
function zalohaDne(n: NajemProVyuctovani, d: string): { celkem: number; polozky: PolozkaZalohy[] | null; dnuVMesici: number } {
  const dt = new Date(`${d}T00:00:00Z`);
  const dnuVMesici = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  const zmena = n.historieZaloh?.length ? platnyKDatu(n.historieZaloh, dt) : null;
  const castka = zmena ? zmena.amount : n.utilitiesMonthly;
  const polozky = n.historieZaloh?.length ? zmena?.items ?? null : n.advanceItems ?? null;
  return { celkem: castka / dnuVMesici, polozky, dnuVMesici };
}

const aktivniVDen = (s: SluzbaProNajemce, d: string) => (!s.aktivniOd || d >= s.aktivniOd) && (!s.aktivniDo || d <= s.aktivniDo);

/**
 * Vyuctovani pro najemce za obdobi s vyberem sluzeb. `vybrane` null = predvyber
 * (sluzby hrazene najemcem). Drivejsi vyuctovani urcuji, odkud se ktera sluzba pocita.
 */
export function vyuctujNajemci(
  najem: NajemProVyuctovani,
  najmy: NajemVstup[],
  sluzby: SluzbaProNajemce[],
  od: string,
  doDne: string,
  vybrane: string[] | null,
  drivejsi: DrivejsiVyuctovani[] = [],
): VysledekNajemce {
  const prazdne = (chyba: string): VysledekNajemce => ({
    od, do: doDne, sluzby: [], skupiny: [], naklady: 0, zalohy: 0, rozdil: 0, zalohyObdobi: [], sluzbyDo: {}, chybiOdecet: false, priblizne: false, chyba,
  });
  const P = prunik(od, doDne, najem.od, najem.do ?? doDne);
  if (!P) return prazdne("Zvolené období nezasahuje do doby nájmu.");

  const radky: RadekSluzby[] = [];
  const sluzbyDo: Record<string, string> = {};
  // Dny, ktere uz pokryla nektera drivejsi vyuctovani (pro zalohy bez sluzby)
  const drivePokryto = (d: string) => drivejsi.some((x) => x.od <= d && d <= x.do);

  for (const s of sluzby) {
    const vybrana = vybrane ? vybrane.includes(s.id) : s.prectena;
    // Odkud: den po poslednim vyuctovani teto sluzby (vcetne prenesenych dnu), jinak zacatek obdobi
    const posledni = drivejsi
      .map((x) => (x.sluzbyDo ? x.sluzbyDo[s.id] : x.do))
      .filter((x): x is string => !!x)
      .reduce<string | null>((a, x) => (!a || x > a ? x : a), null);
    let start = P[0];
    if (posledni) start = max(pridejDny(posledni, 1), najem.od);
    if (posledni && posledni >= P[0]) start = pridejDny(posledni, 1);
    const konec = P[1];
    const zaklad: RadekSluzby = {
      sluzbaId: s.id, nazev: s.nazev, dodavatel: s.dodavatel, skupina: s.skupina, stav: "VYUCTOVANO", vybrana,
      od: null, do: null, preneseno: null, zdroje: [], castka: 0, zalohy: 0,
    };
    if (start > konec) { radky.push({ ...zaklad, stav: "JIZ_VYUCTOVANO" }); continue; }
    const aktOd = max(start, s.aktivniOd ?? start);
    const aktDo = min(konec, s.aktivniDo ?? konec);
    if (aktOd > aktDo) { radky.push({ ...zaklad, stav: "NEPLATILA" }); continue; }

    // Vyuctovat jde jen cela vyuctovani dodavatele, ktera konci nejpozdeji koncem obdobi —
    // kouskovat vyuctovani podle dnu nedava smysl, kdyz neni znama spotreba za zbytek
    const cela = [...s.vyuctovani].filter((v) => v.do <= konec).sort((x, y) => x.od.localeCompare(y.od));
    const kryto = (d: string) => !aktivniVDen(s, d) || cela.some((v) => v.od <= d && d <= v.do);
    let posledniKryty: string | null = null;
    for (let t = cas(start); t <= cas(konec); t += DEN) {
      const d = naIso(t);
      if (!kryto(d)) break;
      posledniKryty = d;
    }
    // Proc se zbytek nevyuctuje: vyuctovani presahuje obdobi, nebo zatim neexistuje
    const duvodPrenosu = (od: string): string => {
      const presah = s.vyuctovani.find((v) => v.od <= od && od <= v.do && v.do > konec);
      return presah
        ? `vyúčtování dodavatele ${cz(presah.od)} – ${cz(presah.do)} přesahuje konec období — vyúčtuje se až s dalším vyúčtováním`
        : "dodavatel zatím nevyúčtoval — vyúčtuje se, až vyúčtování dodá";
    };
    let prenesOd = posledniKryty ? pridejDny(posledniKryty, 1) : start;
    if (!posledniKryty || posledniKryty < aktOd) {
      radky.push({ ...zaklad, stav: "BEZ_VYUCTOVANI", preneseno: [aktOd, aktDo], duvodPrenosu: duvodPrenosu(aktOd) });
      continue;
    }
    const vyOd = aktOd;
    let vyDo = min(posledniKryty, aktDo);
    let duvod: string | null = prenesOd <= aktDo ? duvodPrenosu(prenesOd) : null;
    if (!vybrana) {
      radky.push({ ...zaklad, stav: "NEVYBRANA", od: vyOd, do: vyDo, preneseno: prenesOd <= aktDo ? [max(prenesOd, aktOd), aktDo] : null, duvodPrenosu: duvod });
      continue;
    }

    // Podil najemce z jednotlivych vyuctovani dodavatele (po poradi)
    const retezce = retezceMeraku(s.meraky);
    // Spotreba ze stavu meraku k hranicim. Kdyz stav presne k danemu dni (±3 dny) chybi,
    // vezme se nejblizsi zapsany a vrati se, o kolik se lisi — uzivatel ho musi potvrdit
    const spotrebaMeraku = (z: string, k: string): { celkem: number; priblizne: Odchylka[] } | null => {
      let celkem = 0, nalezeno = false;
      const priblizne: Odchylka[] = [];
      for (const r of retezce) for (const t of (r[0].dvoutarif ? [1, 2] : [1]) as (1 | 2)[]) {
        const dny = [...new Set(r.flatMap((m) => m.stavy.filter((x) => (t === 2 ? x.hodnota2 : x.hodnota) != null).map((x) => x.datum)))].sort();
        if (dny.length < 2) continue;
        const nejblizsi = (cil: string, pred?: string) => dny.filter((d) => !pred || d > pred)
          .reduce<string | null>((a, d) => (!a || Math.abs(cas(d) - cas(cil)) < Math.abs(cas(a) - cas(cil)) ? d : a), null);
        const a = nejblizsi(z);
        const b = a ? nejblizsi(k, a) : null;
        if (!a || !b) continue;
        const x = spotrebaVObdobi(r, a, b, t);
        if (!x) continue;
        for (const [chtene, pouzite] of [[z, a], [k, b]] as const) {
          if (Math.abs(cas(pouzite) - cas(chtene)) > 3 * DEN && !priblizne.some((p) => p.chtene === chtene && p.pouzite === pouzite)) priblizne.push({ chtene, pouzite });
        }
        celkem += x.spotreba; nalezeno = true;
      }
      return nalezeno ? { celkem, priblizne } : null;
    };
    const zdroje: ZdrojRadku[] = [];
    for (const v of cela) {
      const I = prunik(v.od, v.do, vyOd, vyDo);
      if (!I) continue;
      const Inajem = prunik(I[0], I[1], najem.od, najem.do ?? I[1]);
      if (!Inajem) continue;
      const jinyNajemce = najmy.some((n) => n.id !== najem.id && prunik(n.od, n.do ?? v.do, v.od, v.do));
      // 1) Najemce bydlel cele obdobi dodavatele sam: cele vyuctovani je jeho
      if (!jinyNajemce && Inajem[0] === v.od && Inajem[1] === v.do) {
        zdroje.push({ id: v.id, od: v.od, do: v.do, podil: v.naklad, metoda: "cele" });
        continue;
      }
      // 2) Sluzba s meraky: spotreba najemce / celkova spotreba za obdobi dodavatele
      if (retezce.length) {
        const moje = spotrebaMeraku(Inajem[0], Inajem[1]);
        const odectyCelkem = v.rezim === "READINGS" ? Object.values(v.odecty).reduce((a, x) => a + x, 0) + (v.spotrebaVlastnik ?? 0) : 0;
        const celkMeraky = spotrebaMeraku(v.od, v.do);
        const celk = celkMeraky?.celkem ?? (odectyCelkem > 0 ? odectyCelkem : null);
        if (moje == null || !celk) {
          // Na merici vubec nejsou aspon dva stavy: spotreba se neda urcit
          duvod = "na měřáku nejsou zapsané stavy — doplň je na záložce Měřáky, pak půjde vyúčtovat";
          vyDo = pridejDny(v.od, -1);
          prenesOd = v.od;
          break;
        }
        const priblizne = [...moje.priblizne, ...(celkMeraky?.priblizne ?? [])];
        zdroje.push({
          id: v.id, od: Inajem[0], do: Inajem[1], podil: v.naklad * Math.min(1, moje.celkem / celk), metoda: "meraky",
          spotreba: Math.round(moje.celkem * 1000) / 1000, jednotka: s.jednotka, ...(priblizne.length ? { priblizne } : {}),
        });
        continue;
      }
      // 3) Odecty zadane u vyuctovani dodavatele, 4) pevne poplatky podle dnu
      const r = rozuctuj(v, najmy, Inajem);
      const p = r.podily.find((x) => x.leaseId === najem.id);
      if (!p) continue;
      zdroje.push({
        id: v.id, od: Inajem[0], do: Inajem[1], podil: p.podil, metoda: v.rezim === "READINGS" ? "odecty" : "dny",
        spotreba: v.rezim === "READINGS" ? p.spotreba : undefined, jednotka: v.jednotka, dnu: p.dnu, chybiOdecet: p.chybiOdecet,
      });
    }
    const preneseno: [string, string] | null = prenesOd <= aktDo ? [max(prenesOd, aktOd), aktDo] : null;
    if (vyDo < vyOd || zdroje.length === 0) {
      radky.push({ ...zaklad, stav: "BEZ_VYUCTOVANI", preneseno: preneseno ?? [aktOd, aktDo], duvodPrenosu: duvod });
      continue;
    }
    sluzbyDo[s.id] = vyDo;
    radky.push({ ...zaklad, od: vyOd, do: vyDo, preneseno, duvodPrenosu: preneseno ? duvod : null, zdroje, castka: zdroje.reduce((a, z) => a + z.podil, 0) });
  }

  // Zalohy: vse, co mel najemce za dny obdobi zaplatit (kazdy mesic cela zaloha), bez dnu,
  // ktere uz pokrylo drivejsi vyuctovani. Prenesene naklady se vyuctuji pozdeji proti
  // zalohám tehdejsiho obdobi — za kazdy den se zaloha zapocita prave jednou.
  let zalohy = 0;
  const zalohyObdobi: ObdobiZalohNajemce[] = [];
  for (let t = cas(P[0]); t <= cas(P[1]); t += DEN) {
    const d = naIso(t);
    if (drivePokryto(d)) continue;
    const z = zalohaDne(najem, d);
    const mesicne = Math.round(z.celkem * z.dnuVMesici * 100) / 100;
    zalohy += z.celkem;
    const posledni = zalohyObdobi[zalohyObdobi.length - 1];
    if (posledni && posledni.mesicne === mesicne && pridejDny(posledni.do, 1) === d) { posledni.do = d; posledni.castka += z.celkem; }
    else zalohyObdobi.push({ mesicne, od: d, do: d, castka: z.celkem });
  }
  for (const o of zalohyObdobi) o.castka = Math.round(o.castka * 100) / 100;

  const vyuctovane = radky.filter((r) => r.stav === "VYUCTOVANO");
  const skupiny: SkupinaVyuctovani[] = [];
  for (const r of vyuctovane) {
    const g = skupiny.find((x) => x.nazev === (r.skupina ?? null) && r.skupina) ?? null;
    if (g) { g.radky.push(r); g.castka += r.castka; } else skupiny.push({ nazev: r.skupina ?? null, radky: [r], castka: r.castka });
  }
  const naklady = vyuctovane.reduce((a, r) => a + r.castka, 0);
  return {
    od: P[0], do: P[1], sluzby: radky, skupiny, naklady, zalohy, rozdil: zalohy - naklady, zalohyObdobi,
    sluzbyDo, chybiOdecet: vyuctovane.some((r) => r.zdroje.some((z) => z.chybiOdecet)),
    priblizne: vyuctovane.some((r) => r.zdroje.some((z) => z.priblizne?.length)),
  };
}

/** Pocet dnu vyuctovanych u sluzby (pro popisky). */
export const dnuSluzby = (r: RadekSluzby) => (r.od && r.do ? dnuVObdobi(r.od, r.do) : 0);

/** Sluzby nemovitosti pripravene pro pruvodce (stejne na serveru i v prohlizeci). */
export function sluzbyProNajemce(
  services: {
    id: string; type: string; provider: string; groupName: string | null; chargedToTenant: boolean;
    contractStart: Date | string | null; activeTo: Date | string | null; monthlyCost: number; annualCost: number | null;
  }[],
  vyuctovani: (VyuctovaniVstup & { serviceId: string })[],
  typy: Record<string, { name: string; icon: string }>,
  meraky: MerakSeStavy[],
  druhyProIkonu: (ikona: string | undefined) => string[],
  jednotkaDruhu: (druh: string) => string | null,
  nazev: (type: string) => string,
): SluzbaProNajemce[] {
  const den = (d: Date | string | null) => (d ? new Date(d).toISOString().slice(0, 10) : null);
  return services.map((s) => {
    const druhy = druhyProIkonu(typy[s.type]?.icon);
    const m = meraky.filter((x) => druhy.includes(x.druh));
    return {
      id: s.id, nazev: nazev(s.type), dodavatel: s.provider, skupina: s.groupName?.trim() || null, prectena: s.chargedToTenant,
      aktivniOd: den(s.contractStart), aktivniDo: den(s.activeTo),
      vaha: s.monthlyCost + (s.annualCost ?? 0) / 12,
      vyuctovani: vyuctovani.filter((v) => v.serviceId === s.id),
      meraky: m, jednotka: m[0] ? jednotkaDruhu(m[0].druh) : null,
    };
  });
}

/** Od kdy se v tomto vyuctovani pocitaji zalohy (od zacatku obdobi). */
export const zacatekZaloh = (v: VysledekNajemce) => v.od;
