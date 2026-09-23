import type { ScanQuery, ScrapedListing } from "./types";

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export const UA_PROHLIZEC =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * Hlavicky bezneho prohlizece. Portaly obcas odpovidaji na pozadavky
 * z datovych center chybou 404 misto 403 — vypada to jako neexistujici
 * stranka, i kdyz je problem v odmitnuti.
 */
export const HLAVICKY_PROHLIZECE: Record<string, string> = {
  "User-Agent": UA_PROHLIZEC,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "cs-CZ,cs;q=0.9,en;q=0.8",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
  "sec-ch-ua": '"Chromium";v="131", "Not_A Brand";v="24"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
};

/** "Hradec Králové" → "hradec-kralove" — tvar, ktery portaly pouzivaji v adresach. */
export function slugMesta(mesto: string): string {
  return mesto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Vytahne __NEXT_DATA__ ze stranky. Oba portaly bezi na Next.js. */
/**
 * Vrati vedle rozparsovanych dat i puvodni HTML — odkazy na detail inzeratu
 * se z dat stranky poskladat nedaji (chybi v nich slug ulice), takze je
 * bereme primo z odkazu ve vypisu.
 */
export async function nactiStranku(url: string): Promise<{ data: unknown; html: string }> {
  const res = await fetch(url, { headers: HLAVICKY_PROHLIZECE, redirect: "follow" });

  if (!res.ok) {
    // 404 ma dve pricinny: bud takova nabidka v obci proste neni (male mesto,
    // okrajova kategorie), nebo portal odmita pozadavky z datoveho centra.
    // Nerozlisime je, takze zminime obe — driv hlaska svadela jen na druhou.
    const napoveda = res.status === 404 || res.status === 403
      ? " — buď v této obci žádná taková nabídka není, nebo portál odmítl požadavek z datového centra. Zkus sken spustit přes GitHub Actions (Actions → Noční sken trhu)."
      : "";
    throw new Error(`HTTP ${res.status} na ${url}${napoveda}`);
  }

  const html = await res.text();
  const m = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("Na stránce chybí __NEXT_DATA__ — patrně se změnila struktura webu.");

  return { data: JSON.parse(m[1]), html };
}

export async function nactiNextData(url: string): Promise<unknown> {
  return (await nactiStranku(url)).data;
}

/**
 * Mapa id inzeratu → adresa detailu, vytazena z odkazu ve vypisu.
 * Tvar cesty je /detail/<typ>/<druh>/<dispozice>/<slug-lokality>/<id>.
 */
export function odkazyZVypisu(html: string): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const m of html.matchAll(/\/detail\/[a-z-]+\/[a-z-]+\/[^"'\\ ]*?\/(\d+)(?=["'\\ ]|$)/g)) {
    if (!mapa.has(m[1])) mapa.set(m[1], `https://www.sreality.cz${m[0]}`);
  }
  return mapa;
}

/** "Prodej bytu 2+kk 43 m²" → 43 */
export function plochaZNazvu(nazev: string | undefined): number | undefined {
  if (!nazev) return undefined;
  const m = nazev.match(/(\d+(?:[.,]\d+)?)\s*m²/);
  return m ? Number(m[1].replace(",", ".")) : undefined;
}

/** Ponecha jen nabidky srovnatelne velikosti a dispozice. */
export function filtrujSrovnatelne(nabidky: ScrapedListing[], query: ScanQuery): ScrapedListing[] {
  let out = nabidky;

  if (query.disposition) {
    out = out.filter((l) => !l.disposition || l.disposition === query.disposition);
  }
  if (query.areaM2) {
    const tolerance = query.toleranceM2 ?? Math.max(10, query.areaM2 * 0.25);
    out = out.filter((l) => l.areaM2 != null && Math.abs(l.areaM2 - query.areaM2!) <= tolerance);
  }
  return out;
}
