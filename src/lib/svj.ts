/**
 * Cteni stavu meraku z Evidence SVJ (externi aplikace domu).
 *
 * Jen serverova cast: klic (SVJ_API_KLIC) se nesmi dostat do prohlizece. Adresa
 * a klic jsou v promennych prostredi na Vercelu (SVJ_API_URL, SVJ_API_KLIC).
 * Domena je za Cloudflare Access: service token se posila v hlavickach
 * CF-Access-Client-Id / CF-Access-Client-Secret (SVJ_CF_CLIENT_ID, SVJ_CF_CLIENT_SECRET).
 * Stavy se prebiraji samy jednou za mesic (po odeslani stranky, nebrzdi ji), jinak tlacitkem.
 *
 * Prevzate odecty se ukladaji jako stavy meraku se zdrojem "SVJ": datum predani
 * nebo vraceni bytu → k teto udalosti, jinak jako prubezny odecet. Rucne zapsany
 * stav se nikdy neprepisuje.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { denISO } from "./format";
import { DRUH_MERAKU_MAP } from "./meraky";

export interface SvjOdecet {
  datum: string;
  hodnoty: { nazev: string | null; stav: number }[];
  vynulovano_po?: boolean;
}
export interface SvjMerak {
  cislo: string;
  kategorie: string | null;
  byt: string | null;
  jednotka: string | null;
  nadrz?: boolean;
  odecty: SvjOdecet[];
}

export type SvjChyba = "nenastaveno" | "klic" | "cloudflare" | "nenalezen" | "vypnuto" | "nedostupne";
export type SvjVysledek = { ok: true; meraky: SvjMerak[] } | { ok: false; chyba: SvjChyba; detail?: string };

export const POPIS_CHYBY_SVJ: Record<SvjChyba, string> = {
  nenastaveno: "napojení na SVJ není nastavené (SVJ_API_URL, SVJ_API_KLIC)",
  klic: "stav nedostupný — chybný klíč k Evidenci SVJ",
  cloudflare: "stav nedostupný — Cloudflare nepustil dotaz",
  nenalezen: "stav nedostupný — měřák s tímto číslem v SVJ není",
  vypnuto: "stav nedostupný — rozhraní SVJ je vypnuté",
  nedostupne: "stav nedostupný",
};

export const svjNastaveno = () => !!process.env.SVJ_API_URL?.trim() && !!process.env.SVJ_API_KLIC?.trim();

/** Odecty meraku z Evidence SVJ (od nejnovejsiho). Nikdy nevyhodi chybu. */
export async function nactiMerakSvj(cislo: string, limit = 1, cerstve = false): Promise<SvjVysledek> {
  const url = hodnotaPromenne("SVJ_API_URL")?.replace(/\/+$/, "");
  const klic = hodnotaPromenne("SVJ_API_KLIC");
  if (!url || !klic) return { ok: false, chyba: "nenastaveno" };
  const cfId = hodnotaPromenne("SVJ_CF_CLIENT_ID");
  const cfSecret = hodnotaPromenne("SVJ_CF_CLIENT_SECRET");
  // Hodnoty klicu se nikdy nesmi dostat do hlaseni ani do logu
  const skryj = (t: string) => [klic, cfId, cfSecret, process.env.SVJ_API_KLIC, process.env.SVJ_CF_CLIENT_ID, process.env.SVJ_CF_CLIENT_SECRET]
    .filter((x): x is string => !!x && x.length >= 4)
    .reduce((acc, x) => acc.split(x).join("•••"), t);
  try {
    const hlavicky: Record<string, string> = {
      "X-API-Key": klic,
      // Cloudflare Access (service token) — bez nej domena dotaz nepusti
      ...(cfId && cfSecret ? { "CF-Access-Client-Id": cfId, "CF-Access-Client-Secret": cfSecret } : {}),
      Accept: "application/json",
    };
    // Presmerovani (napr. www → bez www) se nasleduje rucne, at hlavicky zustanou;
    // presmerovani na prihlaseni Cloudflare Access znamena odmitnuti
    let adresa = `${url}/api/ext/meraky/${encodeURIComponent(cislo)}?limit=${Math.min(500, Math.max(1, limit))}`;
    let r: Response | null = null;
    for (let krok = 0; krok < 4; krok++) {
      r = await fetch(adresa, {
        headers: hlavicky, redirect: "manual", signal: AbortSignal.timeout(8000),
        // Rucni synchronizace chce cerstva data, jinak staci cache 5 minut
        ...(cerstve ? { cache: "no-store" as const } : { next: { revalidate: 300 } }),
      });
      if (r.status < 300 || r.status >= 400) break;
      const kam = r.headers.get("location");
      if (!kam) break;
      const cil = new URL(kam, adresa);
      if (/cloudflareaccess\.com$/i.test(cil.hostname) || cil.pathname.startsWith("/cdn-cgi/access")) {
        return { ok: false, chyba: "cloudflare", detail: `přesměrování na přihlášení Cloudflare Access (${cil.hostname}) — token nebyl přijat; v Cloudflare Access musí mít aplikace pravidlo s akcí „Service Auth“ pro tento token` };
      }
      adresa = cil.toString();
    }
    if (!r) return nedostupne(cislo, "bez odpovědi");
    const typ = r.headers.get("content-type") ?? "";
    if (r.status >= 300 && r.status < 400) return { ok: false, chyba: "cloudflare", detail: `HTTP ${r.status} → ${r.headers.get("location") ?? "?"}` };
    if (r.status === 403) {
      const cf = r.headers.get("cf-ray") ? "Cloudflare" : "server";
      return { ok: false, chyba: "cloudflare", detail: `${cf} odpověděl HTTP 403 — token nemá přístup (pravidlo „Service Auth“ v Cloudflare Access)` };
    }
    if (r.ok && !typ.includes("json")) return { ok: false, chyba: "cloudflare", detail: `odpověď není JSON (${typ || "bez typu"}) z ${new URL(adresa).hostname} — nejspíš přihlašovací stránka` };
    if (r.status === 401) return { ok: false, chyba: "klic" };
    if (r.status === 404) return { ok: false, chyba: "nenalezen" };
    if (r.status === 503) return { ok: false, chyba: "vypnuto" };
    if (!r.ok) return nedostupne(cislo, `server SVJ odpověděl HTTP ${r.status}`);
    const data = (await r.json()) as { meraky?: SvjMerak[] };
    return Array.isArray(data.meraky) ? { ok: true, meraky: data.meraky } : nedostupne(cislo, "odpověď SVJ nemá seznam měřáků");
  } catch (e) {
    const zprava = skryj(e instanceof Error ? `${e.name === "TimeoutError" ? "SVJ neodpovědělo do 8 s" : e.message}${e.cause instanceof Error ? ` (${e.cause.message})` : ""}` : String(e));
    return nedostupne(cislo, /invalid url|failed to parse url/i.test(zprava) ? `neplatná adresa SVJ_API_URL — musí začínat https://` : zprava);
  }
}

/**
 * Hodnota promenne prostredi: jen prvni souvisly retezec. Pri vkladani do Vercelu se
 * hodnota snadno zdvoji nebo prida konec radku — to by jako hlavicka neproslo.
 */
function hodnotaPromenne(nazev: string): string | undefined {
  const v = process.env[nazev]?.trim().split(/\s+/)[0];
  return v || undefined;
}

/** Nedostupne s duvodem: ukaze se v aplikaci a zapise do logu Vercelu (bez klicu). */
function nedostupne(cislo: string, detail: string): SvjVysledek {
  console.error(`[SVJ] měřák ${cislo}: ${detail}`);
  return { ok: false, chyba: "nedostupne", detail };
}

/** Oznaceni bytu pro porovnani: "Byt č. 1", "byt 1" i "1" je totez. */
function normalizujByt(b: string | null | undefined): string {
  const t = (b ?? "").toLowerCase().replace(/\s+/g, "");
  const cislo = t.replace(/^(byt|b\.?|č\.?|c\.?|jednotka|j\.?)+/g, "").replace(/^(č\.?|c\.?)/, "");
  return cislo || t;
}

/**
 * Vyber spravneho meraku, kdyz ma stejne cislo vic mericich mist (jiny byt, kategorie).
 * Vyrobni cislo je obvykle jedinecne: jediny nalezeny merak se vezme bez ohledu na byt.
 */
export function vyberMerak(meraky: SvjMerak[], byt: string | null | undefined): SvjMerak | null {
  const bezNadrzi = meraky.filter((m) => !m.nadrz);
  const kandidati = bezNadrzi.length ? bezNadrzi : meraky;
  if (kandidati.length === 1) return kandidati[0];
  if (byt) {
    const b = normalizujByt(byt);
    return kandidati.find((m) => normalizujByt(m.byt) === b) ?? null;
  }
  return kandidati[0] ?? null;
}

/** Prevod jednotky SVJ na jednotku meraku v aplikaci (napr. litry na m³). */
export function prevodJednotky(z: string | null, na: string): number {
  const j = (z ?? "").toLowerCase().replace(/\s/g, "").replace("³", "3");
  const cil = na.toLowerCase().replace("³", "3");
  if (cil === "m3" && j === "l") return 1 / 1000;
  if (cil === "m3" && j === "hl") return 1 / 10;
  if (cil === "kwh" && j === "mwh") return 1000;
  return 1;
}

/** Hodnoty odectu jako T1 / T2 (VT / NT); u jednoducheho meraku jen T1. */
export function tarifyOdectu(o: SvjOdecet): { t1: number | null; t2: number | null } {
  const h = o.hodnoty ?? [];
  if (h.length <= 1) return { t1: h[0]?.stav ?? null, t2: null };
  const najdi = (re: RegExp) => h.find((x) => re.test(x.nazev ?? ""))?.stav;
  return { t1: najdi(/^(VT|T1)$/i) ?? h[0].stav, t2: najdi(/^(NT|T2)$/i) ?? h[1].stav };
}

export interface SvjStavMeraku {
  /** Posledni stav ze SVJ, nebo popis chyby */
  posledni: { datum: string; t1: number | null; t2: number | null } | null;
  chyba: string | null;
  prevzato: number;
}

/** Jak casto se stavy ze SVJ prebiraji samy (jinak tlacitkem). */
export const SVJ_INTERVAL_DNU = 30;

/**
 * Prevezme odecty ze SVJ k merakum nemovitosti: kdyz ma nemovitost cislo bytu v SVJ,
 * kazdy aktivni merak s vyrobnim cislem se tam dohleda podle nej. Dotazy bezi souber,
 * nove stavy se zapisou jednim dotazem a vysledek se ulozi k nemovitosti (stranky pak
 * SVJ vubec nevolaji). Nikdy nevyhodi chybu.
 */
export async function synchronizujSvj(propertyId: string, cerstve = false): Promise<Record<string, SvjStavMeraku>> {
  const vysledek: Record<string, SvjStavMeraku> = {};
  try {
    // Byt v SVJ je nastaveny u nemovitosti; meraky se hledaji podle vyrobniho cisla
    const nemovitost = await prisma.property.findUnique({ where: { id: propertyId }, select: { svjByt: true } });
    if (!nemovitost?.svjByt) return vysledek;
    const byt = nemovitost.svjByt;
    const [meraky, smlouvy] = await Promise.all([
      prisma.merak.findMany({
        where: { propertyId, aktivni: true, cislo: { not: null } },
        include: { stavy: { select: { datum: true } } },
      }),
      prisma.lease.findMany({ where: { propertyId }, select: { id: true, startDate: true, endDate: true } }),
    ]);
    const odpovedi = await Promise.all(meraky.map((m) => nactiMerakSvj(m.cislo!.trim(), 500, cerstve)));
    const nove: Prisma.StavMerakuCreateManyInput[] = [];
    const dvoutarifni: string[] = [];

    meraky.forEach((m, i) => {
      const odp = odpovedi[i];
      if (!odp.ok) { vysledek[m.id] = { posledni: null, chyba: POPIS_CHYBY_SVJ[odp.chyba] + (odp.detail ? ` (${odp.detail})` : ""), prevzato: 0 }; return; }
      const svj = vyberMerak(odp.meraky, byt);
      if (!svj) {
        vysledek[m.id] = { posledni: null, chyba: `stav nedostupný — měřák č. ${m.cislo} je v SVJ u bytů ${odp.meraky.map((x) => x.byt ?? "bez bytu").join(", ")}, ne u bytu ${byt}`, prevzato: 0 };
        return;
      }
      const k = prevodJednotky(svj.jednotka, DRUH_MERAKU_MAP.get(m.druh)?.jednotka ?? "");
      const prepocti = (n: number | null) => (n == null ? null : Math.round(n * k * 1000) / 1000);
      const nejnovejsi = svj.odecty[0];
      const tn = nejnovejsi ? tarifyOdectu(nejnovejsi) : null;
      vysledek[m.id] = { posledni: nejnovejsi && tn ? { datum: nejnovejsi.datum, t1: prepocti(tn.t1), t2: prepocti(tn.t2) } : null, chyba: null, prevzato: 0 };

      // Viceterifovy merak v SVJ: v aplikaci taky dvoutarif
      if (!m.dvoutarif && svj.odecty.some((o) => (o.hodnoty?.length ?? 0) > 1)) dvoutarifni.push(m.id);

      const dnyMeraku = new Set(m.stavy.map((x) => denISO(x.datum)));
      for (const o of svj.odecty) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(o.datum) || dnyMeraku.has(o.datum)) continue;
        const t = tarifyOdectu(o);
        if (t.t1 == null) continue;
        const datum = new Date(`${o.datum}T00:00:00Z`);
        // Den predani nebo vraceni bytu: stav patri k teto udalosti
        const zacatek = smlouvy.find((s) => denISO(s.startDate) === o.datum);
        const konec = smlouvy.find((s) => s.endDate && denISO(s.endDate) === o.datum);
        // Vraceni a predani dalsimu najemci tyz den maji stejny stav
        const udalosti = [
          ...(konec ? [{ udalost: "KONEC", leaseId: konec.id }] : []),
          ...(zacatek ? [{ udalost: "ZACATEK", leaseId: zacatek.id }] : []),
        ];
        for (const u of udalosti.length ? udalosti : [{ udalost: "ODECET", leaseId: null }]) {
          nove.push({ merakId: m.id, leaseId: u.leaseId, udalost: u.udalost, datum, hodnota: prepocti(t.t1), hodnota2: prepocti(t.t2), vynulovanoPo: o.vynulovano_po === true, zdroj: "SVJ" });
        }
        dnyMeraku.add(o.datum);
        vysledek[m.id].prevzato++;
      }
    });

    await prisma.$transaction([
      ...(dvoutarifni.length ? [prisma.merak.updateMany({ where: { id: { in: dvoutarifni } }, data: { dvoutarif: true } })] : []),
      ...(nove.length ? [prisma.stavMeraku.createMany({ data: nove })] : []),
      prisma.property.update({ where: { id: propertyId }, data: { svjSyncAt: new Date(), svjStav: vysledek as unknown as Prisma.InputJsonValue } }),
    ]);
  } catch (e) {
    // SVJ nesmi shodit stranku — stav se jen neprevezme
    console.error("[SVJ] převzetí odečtů selhalo:", e instanceof Error ? e.message : e);
  }
  return vysledek;
}

/** Automaticke prevzeti, jen kdyz je nastaveny byt a od posledniho uplynul mesic. */
export async function synchronizujSvjKdyzJeCas(propertyId: string): Promise<void> {
  const p = await prisma.property.findUnique({ where: { id: propertyId }, select: { svjByt: true, svjSyncAt: true } }).catch(() => null);
  if (!p?.svjByt || !svjNastaveno()) return;
  if (p.svjSyncAt && Date.now() - p.svjSyncAt.getTime() < SVJ_INTERVAL_DNU * 86400000) return;
  await synchronizujSvj(propertyId);
}
