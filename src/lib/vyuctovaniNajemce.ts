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
  /** Vse, co mel najemce za dny tohoto obdobi na zalohach zaplatit */
  zalohyZaplaceno: number;
  /** Zalohy, ktere se nevyuctovavaji (sluzba se nepreuctovava / nema vyuctovani): pausal */
  zalohyPausal: { nazev: string; castka: number }[];
  /** Zalohy za dny obdobi u sluzeb, ktere se zatim nevyuctovaly — zapoctou se s nimi pozdeji */
  zalohyPrenesene: { nazev: string; castka: number; duvod: string }[];
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
    od, do: doDne, sluzby: [], skupiny: [], naklady: 0, zalohy: 0, rozdil: 0, zalohyNeprirazene: 0, zalohyZaplaceno: 0, zalohyPrenesene: [], zalohyPausal: [], sluzbyDo: {}, chybiOdecet: false, priblizne: false, chyba,
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
    // Odecty prirazene k udalostem: konecny odecet vyuctovani dodavatele, predani a vraceni bytu.
    // Kde jsou, plati presne (bez ohledu na datum); jinak se bere nejblizsi zapsany stav.
    type Hranice = { vyuctovaniKonec?: string; vyuctovaniZacatek?: string; lease?: { id: string; udalost: "ZACATEK" | "KONEC" } };
    const predchoziVyuctovani = (vId: string) => {
      const v = s.vyuctovani.find((x) => x.id === vId);
      return v ? s.vyuctovani.filter((x) => x.do < v.od).sort((a, b) => b.do.localeCompare(a.do))[0] ?? null : null;
    };
    const prirazeny = (stavy: MerakSeStavy["stavy"], h: Hranice | undefined, t: 1 | 2): string | null => {
      if (!h) return null;
      const ma = (x: MerakSeStavy["stavy"][number]) => (t === 2 ? x.hodnota2 : x.hodnota) != null;
      const vId = h.vyuctovaniKonec ?? (h.vyuctovaniZacatek ? predchoziVyuctovani(h.vyuctovaniZacatek)?.id : undefined);
      const x = (vId ? stavy.find((y) => ma(y) && y.vyuctovani?.includes(vId)) : undefined)
        ?? (h.lease ? stavy.find((y) => ma(y) && y.leaseId === h.lease!.id && y.udalost === h.lease!.udalost) : undefined);
      return x?.datum ?? null;
    };
    const spotrebaMeraku = (z: string, k: string, hz?: Hranice, hk?: Hranice): { celkem: number; priblizne: Odchylka[] } | null => {
      let celkem = 0, nalezeno = false;
      const priblizne: Odchylka[] = [];
      for (const r of retezce) for (const t of (r[0].dvoutarif ? [1, 2] : [1]) as (1 | 2)[]) {
        const stavy = r.flatMap((m) => m.stavy);
        const dny = [...new Set(stavy.filter((x) => (t === 2 ? x.hodnota2 : x.hodnota) != null).map((x) => x.datum))].sort();
        if (dny.length < 2) continue;
        const nejblizsi = (cil: string, pred?: string) => dny.filter((d) => !pred || d > pred)
          .reduce<string | null>((a, d) => (!a || Math.abs(cas(d) - cas(cil)) < Math.abs(cas(a) - cas(cil)) ? d : a), null);
        const pa = prirazeny(stavy, hz, t);
        const a = pa ?? nejblizsi(z);
        const pb = prirazeny(stavy, hk, t);
        const b = pb && a && pb > a ? pb : a ? nejblizsi(k, a) : null;
        if (!a || !b) continue;
        const x = spotrebaVObdobi(r, a, b, t);
        if (!x) continue;
        for (const [chtene, pouzite, presne] of [[z, a, !!pa], [k, b, !!pb && pb === b]] as const) {
          if (!presne && Math.abs(cas(pouzite) - cas(chtene)) > 3 * DEN && !priblizne.some((p) => p.chtene === chtene && p.pouzite === pouzite)) priblizne.push({ chtene, pouzite });
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
        // Hranice podilu najemce: zacatek/konec vyuctovani dodavatele, nebo predani/vraceni bytu
        const hz: Hranice = Inajem[0] === v.od ? { vyuctovaniZacatek: v.id, lease: { id: najem.id, udalost: "ZACATEK" } } : { lease: { id: najem.id, udalost: "ZACATEK" } };
        const hk: Hranice = Inajem[1] === v.do ? { vyuctovaniKonec: v.id, lease: { id: najem.id, udalost: "KONEC" } } : { lease: { id: najem.id, udalost: "KONEC" } };
        if (Inajem[0] !== najem.od) delete hz.lease;
        if (Inajem[1] !== najem.do) delete hk.lease;
        const moje = spotrebaMeraku(Inajem[0], Inajem[1], hz, hk);
        const odectyCelkem = v.rezim === "READINGS" ? Object.values(v.odecty).reduce((a, x) => a + x, 0) + (v.spotrebaVlastnik ?? 0) : 0;
        const celkMeraky = spotrebaMeraku(v.od, v.do, { vyuctovaniZacatek: v.id }, { vyuctovaniKonec: v.id });
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

  // Zalohy: kazdy den najmu v obdobi (i prenesene dny pred nim) se rozdeli mezi prectene sluzby
  const vyuctovaneDny = new Map(radky.filter((r) => r.stav === "VYUCTOVANO" && r.od && r.do).map((r) => [r.sluzbaId, [r.od!, r.do!] as const]));
  const zalohySluzby = new Map<string, number>();
  // Zalohy za dny tohoto obdobi u sluzeb, ktere se zatim nevyuctovaly — zapocitaji se pozdeji se sluzbou
  const prenesZaloh = new Map<string, number>();
  let zaplaceno = 0;
  const neprirazene = 0;
  const pausal = new Map<string, number>();
  const zacatek = [P[0], ...[...vyuctovaneDny.values()].map((x) => x[0])].reduce(min);
  for (let t = cas(zacatek); t <= cas(P[1]); t += DEN) {
    const d = naIso(t);
    if (d < najem.od || (najem.do && d > najem.do)) continue;
    const z = zalohaDne(najem, d);
    if (z.celkem <= 0) continue;
    const vObdobi = d >= P[0] && !drivePokryto(d);
    if (vObdobi) zaplaceno += z.celkem;
    const aktivni = sluzby.filter((s) => s.prectena && aktivniVDen(s, d));
    let rozdeleno = 0;
    const pridej = (id: string, castka: number) => {
      rozdeleno += castka;
      const r = vyuctovaneDny.get(id);
      if (r && r[0] <= d && d <= r[1]) zalohySluzby.set(id, (zalohySluzby.get(id) ?? 0) + castka);
      else if (vObdobi) prenesZaloh.set(id, (prenesZaloh.get(id) ?? 0) + castka);
    };
    // Zaloha, kterou nejde vyuctovat proti nakladum (sluzba se nepreuctovava, neplati nebo k ni
    // nikdy neprijde vyuctovani a neni komu ji dat) = pausal: nevraci se ani nedoplaci
    const pausalem = (nazev: string, castka: number) => {
      rozdeleno += castka;
      if (vObdobi && castka > 0) pausal.set(nazev, (pausal.get(nazev) ?? 0) + castka);
    };
    if (z.polozky?.length) {
      // Celkova zaloha se rozdeli podle rozpisu (i kdyz se soucet rozpisu od zalohy lisi)
      const soucet = z.polozky.reduce((a, p) => a + Math.max(0, p.amount), 0);
      const koef = soucet > 0 ? (z.celkem * z.dnuVMesici) / soucet : 0;
      // Zaloha na sluzbu, ktera nema zadne vyuctovani od dodavatele (napr. "Teplo" v rozpisu,
      // ale SVJ uctuje teplou vodu, uklid, vytah), jde do spolecneho baliku pro sluzby bez
      // vlastni zalohy — podle jejich mesicnich nakladu
      let balik = 0;
      const balikPolozky: { nazev: string; castka: number }[] = [];
      for (const p of z.polozky) {
        const castka = (Math.max(0, p.amount) * koef) / z.dnuVMesici;
        const s = aktivni.find((x) => x.id === p.serviceId);
        if (!s) { pausalem(sluzby.find((x) => x.id === p.serviceId)?.nazev ?? "Ostatní", castka); continue; }
        if (s.vyuctovani.length) pridej(p.serviceId, castka);
        else { balik += castka; balikPolozky.push({ nazev: s.nazev, castka }); }
      }
      const vlastni = new Set(z.polozky.map((p) => p.serviceId));
      const prijemci = aktivni.filter((s) => !vlastni.has(s.id) && s.vyuctovani.length > 0);
      if (balik > 0 && prijemci.length) {
        const vahy = prijemci.reduce((a, s) => a + Math.max(0, s.vaha), 0);
        for (const s of prijemci) pridej(s.id, balik * (vahy > 0 ? Math.max(0, s.vaha) / vahy : 1 / prijemci.length));
      } else for (const x of balikPolozky) pausalem(x.nazev, x.castka);
    } else {
      const vahy = aktivni.reduce((a, s) => a + Math.max(0, s.vaha), 0);
      if (vahy > 0) for (const s of aktivni) pridej(s.id, (z.celkem * Math.max(0, s.vaha)) / vahy);
      else pausalem("Zálohy bez přeúčtovaných služeb", z.celkem);
    }
  }
  for (const r of radky) r.zalohy = zalohySluzby.get(r.sluzbaId) ?? 0;

  const vyuctovane = radky.filter((r) => r.stav === "VYUCTOVANO");
  const skupiny: SkupinaVyuctovani[] = [];
  for (const r of vyuctovane) {
    const g = skupiny.find((x) => x.nazev === (r.skupina ?? null) && r.skupina) ?? null;
    if (g) { g.radky.push(r); g.castka += r.castka; } else skupiny.push({ nazev: r.skupina ?? null, radky: [r], castka: r.castka });
  }
  // Pausal: co se na zalohach vybere, to se spotrebuje — je v nakladech i zalohach stejne
  const pausalCelkem = [...pausal.values()].reduce((a, x) => a + x, 0);
  const naklady = vyuctovane.reduce((a, r) => a + r.castka, 0) + pausalCelkem;
  const zalohy = vyuctovane.reduce((a, r) => a + r.zalohy, 0) + neprirazene + pausalCelkem;
  return {
    od: P[0], do: P[1], sluzby: radky, skupiny, naklady, zalohy, rozdil: zalohy - naklady, zalohyNeprirazene: neprirazene,
    zalohyZaplaceno: Math.round(zaplaceno * 100) / 100,
    zalohyPausal: [...pausal.entries()].filter(([, c]) => c >= 0.5).map(([nazev, castka]) => ({ nazev, castka: Math.round(castka * 100) / 100 })),
    // Vsechny sluzby, ktere se presouvaji do dalsiho vyuctovani — i bez vlastni zalohy (uklid, vytah ...)
    zalohyPrenesene: radky.filter((r) => (prenesZaloh.get(r.sluzbaId) ?? 0) >= 0.5
      || (r.vybrana && sluzby.find((x) => x.id === r.sluzbaId)?.prectena && (r.stav === "BEZ_VYUCTOVANI" || (r.stav === "VYUCTOVANO" && !!r.preneseno)))).map((r) => ({
      nazev: r.nazev, castka: Math.round((prenesZaloh.get(r.sluzbaId) ?? 0) * 100) / 100,
      duvod: r.duvodPrenosu ?? (r.stav === "NEVYBRANA" ? "služba není v tomto vyúčtování vybraná" : "dodavatel zatím nevyúčtoval"),
    })),
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
    notes?: string | null; merak?: boolean | null;
  }[],
  vyuctovani: (VyuctovaniVstup & { serviceId: string })[],
  typy: Record<string, { name: string; icon: string }>,
  meraky: MerakSeStavy[],
  druhyProIkonu: (ikona: string | undefined, sluzba: { merak?: boolean | null; provider?: string | null; groupName?: string | null; notes?: string | null }) => string[],
  jednotkaDruhu: (druh: string) => string | null,
  nazev: (type: string) => string,
): SluzbaProNajemce[] {
  const den = (d: Date | string | null) => (d ? new Date(d).toISOString().slice(0, 10) : null);
  return services.map((s) => {
    const druhy = druhyProIkonu(typy[s.type]?.icon, s);
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

/** Od kdy se v tomto vyuctovani pocitaji zalohy (vcetne prenesenych dnu pred obdobim). */
export const zacatekZaloh = (v: VysledekNajemce) =>
  v.sluzby.filter((r) => r.stav === "VYUCTOVANO" && r.od).map((r) => r.od!).reduce((a, x) => (x < a ? x : a), v.od);
