/**
 * Cteni stavu meraku z Evidence SVJ (externi aplikace domu).
 *
 * Jen serverova cast: klic (SVJ_API_KLIC) se nesmi dostat do prohlizece. Adresa
 * a klic jsou v promennych prostredi na Vercelu (SVJ_API_URL, SVJ_API_KLIC).
 * Domena je za Cloudflare Access: service token se posila v hlavickach
 * CF-Access-Client-Id / CF-Access-Client-Secret (SVJ_CF_CLIENT_ID, SVJ_CF_CLIENT_SECRET).
 * Stavy se meni jen pri zapisu odectu, proto cache 5 minut.
 *
 * Prevzate odecty se ukladaji jako stavy meraku se zdrojem "SVJ": datum predani
 * nebo vraceni bytu → k teto udalosti, jinak jako prubezny odecet. Rucne zapsany
 * stav se nikdy neprepisuje.
 */
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
  cloudflare: "stav nedostupný — Cloudflare nepustil dotaz (zkontroluj service token SVJ_CF_CLIENT_ID / SVJ_CF_CLIENT_SECRET)",
  nenalezen: "stav nedostupný — měřák s tímto číslem v SVJ není",
  vypnuto: "stav nedostupný — rozhraní SVJ je vypnuté",
  nedostupne: "stav nedostupný",
};

export const svjNastaveno = () => !!process.env.SVJ_API_URL && !!process.env.SVJ_API_KLIC;

/** Odecty meraku z Evidence SVJ (od nejnovejsiho). Nikdy nevyhodi chybu. */
export async function nactiMerakSvj(cislo: string, limit = 1): Promise<SvjVysledek> {
  const url = process.env.SVJ_API_URL?.replace(/\/+$/, "");
  const klic = process.env.SVJ_API_KLIC;
  if (!url || !klic) return { ok: false, chyba: "nenastaveno" };
  try {
    const cfId = process.env.SVJ_CF_CLIENT_ID;
    const cfSecret = process.env.SVJ_CF_CLIENT_SECRET;
    const r = await fetch(`${url}/api/ext/meraky/${encodeURIComponent(cislo)}?limit=${Math.min(500, Math.max(1, limit))}`, {
      headers: {
        "X-API-Key": klic,
        // Cloudflare Access (service token) — bez nej domena dotaz nepusti
        ...(cfId && cfSecret ? { "CF-Access-Client-Id": cfId, "CF-Access-Client-Secret": cfSecret } : {}),
        Accept: "application/json",
      },
      // Cloudflare pri odmitnuti presmeruje na prihlaseni — to neni odpoved rozhrani
      redirect: "manual",
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(8000),
    });
    const typ = r.headers.get("content-type") ?? "";
    if ((r.status >= 300 && r.status < 400) || r.status === 403 || (r.ok && !typ.includes("json"))) return { ok: false, chyba: "cloudflare" };
    if (r.status === 401) return { ok: false, chyba: "klic" };
    if (r.status === 404) return { ok: false, chyba: "nenalezen" };
    if (r.status === 503) return { ok: false, chyba: "vypnuto" };
    if (!r.ok) return nedostupne(cislo, `server SVJ odpověděl HTTP ${r.status}`);
    const data = (await r.json()) as { meraky?: SvjMerak[] };
    return Array.isArray(data.meraky) ? { ok: true, meraky: data.meraky } : nedostupne(cislo, "odpověď SVJ nemá seznam měřáků");
  } catch (e) {
    const zprava = e instanceof Error ? `${e.name === "TimeoutError" ? "SVJ neodpovědělo do 8 s" : e.message}${e.cause instanceof Error ? ` (${e.cause.message})` : ""}` : String(e);
    return nedostupne(cislo, /invalid url|failed to parse url/i.test(zprava) ? `neplatná adresa SVJ_API_URL — musí začínat https://` : zprava);
  }
}

/** Nedostupne s duvodem: ukaze se v aplikaci a zapise do logu Vercelu (bez klicu). */
function nedostupne(cislo: string, detail: string): SvjVysledek {
  console.error(`[SVJ] měřák ${cislo}: ${detail}`);
  return { ok: false, chyba: "nedostupne", detail };
}

/** Vyber spravneho meraku, kdyz ma stejne cislo vic mericich mist (jiny byt, kategorie). */
export function vyberMerak(meraky: SvjMerak[], byt: string | null | undefined): SvjMerak | null {
  const bezNadrzi = meraky.filter((m) => !m.nadrz);
  const kandidati = bezNadrzi.length ? bezNadrzi : meraky;
  if (byt) {
    const b = byt.trim().toLowerCase();
    return kandidati.find((m) => (m.byt ?? "").trim().toLowerCase() === b) ?? null;
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

/**
 * Prevezme odecty ze SVJ k merakum nemovitosti: kdyz ma nemovitost cislo bytu v SVJ,
 * kazdy aktivni merak s vyrobnim cislem se tam dohleda podle nej. Bezi pri
 * otevreni stranky (diky cache nejvys jednou za 5 minut na merak). Nikdy nevyhodi chybu.
 */
export async function synchronizujSvj(propertyId: string): Promise<Record<string, SvjStavMeraku>> {
  const vysledek: Record<string, SvjStavMeraku> = {};
  try {
    // Byt v SVJ je nastaveny u nemovitosti; meraky se hledaji podle vyrobniho cisla
    const nemovitost = await prisma.property.findUnique({ where: { id: propertyId }, select: { svjByt: true } });
    if (!nemovitost?.svjByt) return vysledek;
    const byt = nemovitost.svjByt;
    const meraky = await prisma.merak.findMany({
      where: { propertyId, aktivni: true, cislo: { not: null } },
      include: { stavy: { select: { datum: true, udalost: true, leaseId: true } } },
    });
    if (!meraky.length) return vysledek;
    const smlouvy = await prisma.lease.findMany({ where: { propertyId }, select: { id: true, startDate: true, endDate: true } });

    for (const m of meraky) {
      const odp = await nactiMerakSvj(m.cislo!.trim(), 500);
      if (!odp.ok) { vysledek[m.id] = { posledni: null, chyba: POPIS_CHYBY_SVJ[odp.chyba] + (odp.detail ? ` (${odp.detail})` : ""), prevzato: 0 }; continue; }
      const svj = vyberMerak(odp.meraky, byt);
      if (!svj) {
        vysledek[m.id] = { posledni: null, chyba: `stav nedostupný — v SVJ není měřák č. ${m.cislo} u bytu ${byt}`, prevzato: 0 };
        continue;
      }
      const k = prevodJednotky(svj.jednotka, DRUH_MERAKU_MAP.get(m.druh)?.jednotka ?? "");
      const prepocti = (n: number | null) => (n == null ? null : Math.round(n * k * 1000) / 1000);
      const nejnovejsi = svj.odecty[0];
      const tn = nejnovejsi ? tarifyOdectu(nejnovejsi) : null;
      vysledek[m.id] = { posledni: nejnovejsi && tn ? { datum: nejnovejsi.datum, t1: prepocti(tn.t1), t2: prepocti(tn.t2) } : null, chyba: null, prevzato: 0 };

      // Viceterifovy merak v SVJ: v aplikaci taky dvoutarif
      if (!m.dvoutarif && svj.odecty.some((o) => (o.hodnoty?.length ?? 0) > 1)) {
        await prisma.merak.update({ where: { id: m.id }, data: { dvoutarif: true } });
      }

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
          await prisma.stavMeraku.create({
            data: { merakId: m.id, leaseId: u.leaseId, udalost: u.udalost, datum, hodnota: prepocti(t.t1), hodnota2: prepocti(t.t2), zdroj: "SVJ" },
          });
        }
        dnyMeraku.add(o.datum);
        vysledek[m.id].prevzato++;
      }
    }
  } catch (e) {
    // SVJ nesmi shodit stranku — stav se jen neprevezme
    console.error("[SVJ] převzetí odečtů selhalo:", e instanceof Error ? e.message : e);
  }
  return vysledek;
}
