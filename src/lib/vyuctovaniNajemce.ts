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
 * - Zalohy se pocitaji za vyuctovane dny; za vynechane a prenesene sluzby se odecte jejich
 *   podil (podle rozpisu zaloh ve smlouve, jinak podle mesicnich nakladu sluzeb).
 */
import { dnuVObdobi, pridejDny, prunik, rozuctuj, type NajemVstup, type VyuctovaniVstup } from "./vyuctovani";
import { platnyKDatu, type PolozkaZalohy, type ZmenaZaloh } from "./zalohy";
import { retezceMeraku, spotrebaVObdobi, type MerakSeStavy } from "./meraky";

const DEN = 86400000;
const cas = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const naIso = (t: number) => new Date(t).toISOString().slice(0, 10);
const min = (a: string, b: string) => (a < b ? a : b);
const max = (a: string, b: string) => (a > b ? a : b);

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
  metoda: "dny" | "odecty" | "meraky";
  spotreba?: number;
  jednotka?: string | null;
  dnu?: number;
  chybiOdecet?: boolean;
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
  zdroje: ZdrojRadku[];
  castka: number;
  /** Zalohy pripadajici na vyuctovane dny teto sluzby */
  zalohy: number;
}

export interface SkupinaVyuctovani {
  nazev: string | null;
  radky: RadekSluzby[];
  castka: number;
}

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
  /** Zalohy za dny bez prectene sluzby (nelze priradit zadne sluzbe) */
  zalohyNeprirazene: number;
  /** Do kdy je ktera sluzba po tomto vyuctovani vyuctovana */
  sluzbyDo: Record<string, string>;
  chybiOdecet: boolean;
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
    od, do: doDne, sluzby: [], skupiny: [], naklady: 0, zalohy: 0, rozdil: 0, zalohyNeprirazene: 0, sluzbyDo: {}, chybiOdecet: false, chyba,
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

    // Souvisle vyuctovane dny od zacatku; dny, kdy sluzba neplatila, nevadi
    const kryto = (d: string) => !aktivniVDen(s, d) || s.vyuctovani.some((v) => v.od <= d && d <= v.do);
    let posledniKryty: string | null = null;
    for (let t = cas(start); t <= cas(konec); t += DEN) {
      const d = naIso(t);
      if (!kryto(d)) break;
      posledniKryty = d;
    }
    const prenesOd = posledniKryty ? pridejDny(posledniKryty, 1) : start;
    const preneseno: [string, string] | null = prenesOd <= aktDo ? [max(prenesOd, aktOd), aktDo] : null;
    if (!posledniKryty || posledniKryty < aktOd) {
      radky.push({ ...zaklad, stav: "BEZ_VYUCTOVANI", preneseno });
      continue;
    }
    const vyOd = aktOd;
    const vyDo = min(posledniKryty, aktDo);
    if (!vybrana) { radky.push({ ...zaklad, stav: "NEVYBRANA", od: vyOd, do: vyDo, preneseno }); continue; }

    // Podil najemce z jednotlivych vyuctovani dodavatele
    const retezce = retezceMeraku(s.meraky);
    const spotrebaMeraku = (z: string, k: string) => {
      let celkem = 0, nalezeno = false;
      for (const r of retezce) for (const t of (r[0].dvoutarif ? [1, 2] : [1]) as (1 | 2)[]) {
        const x = spotrebaVObdobi(r, z, k, t);
        if (x) { celkem += x.spotreba; nalezeno = true; }
      }
      return nalezeno ? celkem : null;
    };
    const zdroje: ZdrojRadku[] = [];
    for (const v of s.vyuctovani) {
      const I = prunik(v.od, v.do, vyOd, vyDo);
      if (!I) continue;
      const Inajem = prunik(I[0], I[1], najem.od, najem.do ?? I[1]);
      if (!Inajem) continue;
      // 1) Meraky: spotreba najemce / celkova spotreba za obdobi dodavatele
      const celk = retezce.length ? spotrebaMeraku(v.od, v.do) : null;
      const moje = celk ? spotrebaMeraku(Inajem[0], Inajem[1]) : null;
      if (celk && celk > 0 && moje != null) {
        zdroje.push({ id: v.id, od: Inajem[0], do: Inajem[1], podil: v.naklad * (moje / celk), metoda: "meraky", spotreba: Math.round(moje * 1000) / 1000, jednotka: s.jednotka });
        continue;
      }
      // 2) Odecty zadane u vyuctovani dodavatele, 3) podle dnu
      const r = rozuctuj(v, najmy, Inajem);
      const p = r.podily.find((x) => x.leaseId === najem.id);
      if (!p) continue;
      zdroje.push({
        id: v.id, od: Inajem[0], do: Inajem[1], podil: p.podil, metoda: v.rezim === "READINGS" ? "odecty" : "dny",
        spotreba: v.rezim === "READINGS" ? p.spotreba : undefined, jednotka: v.jednotka, dnu: p.dnu, chybiOdecet: p.chybiOdecet,
      });
    }
    sluzbyDo[s.id] = vyDo;
    radky.push({ ...zaklad, od: vyOd, do: vyDo, preneseno, zdroje, castka: zdroje.reduce((a, z) => a + z.podil, 0) });
  }

  // Zalohy: kazdy den najmu v obdobi (i prenesene dny pred nim) se rozdeli mezi prectene sluzby
  const vyuctovaneDny = new Map(radky.filter((r) => r.stav === "VYUCTOVANO" && r.od && r.do).map((r) => [r.sluzbaId, [r.od!, r.do!] as const]));
  const zalohySluzby = new Map<string, number>();
  let neprirazene = 0;
  const zacatek = [P[0], ...[...vyuctovaneDny.values()].map((x) => x[0])].reduce(min);
  for (let t = cas(zacatek); t <= cas(P[1]); t += DEN) {
    const d = naIso(t);
    if (d < najem.od || (najem.do && d > najem.do)) continue;
    const z = zalohaDne(najem, d);
    if (z.celkem <= 0) continue;
    const aktivni = sluzby.filter((s) => s.prectena && aktivniVDen(s, d));
    let rozdeleno = 0;
    const pridej = (id: string, castka: number) => {
      rozdeleno += castka;
      const r = vyuctovaneDny.get(id);
      if (r && r[0] <= d && d <= r[1]) zalohySluzby.set(id, (zalohySluzby.get(id) ?? 0) + castka);
    };
    if (z.polozky?.length) {
      for (const p of z.polozky) if (aktivni.some((s) => s.id === p.serviceId)) pridej(p.serviceId, Math.min(p.amount / z.dnuVMesici, z.celkem - rozdeleno));
    } else {
      const vahy = aktivni.reduce((a, s) => a + Math.max(0, s.vaha), 0);
      if (vahy > 0) for (const s of aktivni) pridej(s.id, (z.celkem * Math.max(0, s.vaha)) / vahy);
    }
    // Co nejde priradit zadne sluzbe, patri do obdobi, kde ho jeste nic nevyuctovalo
    const zbytek = z.celkem - rozdeleno;
    if (zbytek > 0.0001 && d >= P[0] && !drivePokryto(d)) neprirazene += zbytek;
  }
  for (const r of radky) r.zalohy = zalohySluzby.get(r.sluzbaId) ?? 0;

  const vyuctovane = radky.filter((r) => r.stav === "VYUCTOVANO");
  const skupiny: SkupinaVyuctovani[] = [];
  for (const r of vyuctovane) {
    const g = skupiny.find((x) => x.nazev === (r.skupina ?? null) && r.skupina) ?? null;
    if (g) { g.radky.push(r); g.castka += r.castka; } else skupiny.push({ nazev: r.skupina ?? null, radky: [r], castka: r.castka });
  }
  const naklady = vyuctovane.reduce((a, r) => a + r.castka, 0);
  const zalohy = vyuctovane.reduce((a, r) => a + r.zalohy, 0) + neprirazene;
  return {
    od: P[0], do: P[1], sluzby: radky, skupiny, naklady, zalohy, rozdil: zalohy - naklady, zalohyNeprirazene: neprirazene,
    sluzbyDo, chybiOdecet: vyuctovane.some((r) => r.zdroje.some((z) => z.chybiOdecet)),
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
