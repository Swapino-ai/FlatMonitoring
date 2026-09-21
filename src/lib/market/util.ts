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
export async function nactiNextData(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: HLAVICKY_PROHLIZECE, redirect: "follow" });

  if (!res.ok) {
    // 404 na adrese, ktera jinde funguje, znaci odmitnuti pozadavku z datoveho centra
    const napoveda = res.status === 404 || res.status === 403
      ? " — portál patrně odmítl požadavek z datového centra. Zkus sken spustit přes GitHub Actions (Actions → Měsíční sken trhu)."
      : "";
    throw new Error(`HTTP ${res.status} na ${url}${napoveda}`);
  }

  const html = await res.text();
  const m = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("Na stránce chybí __NEXT_DATA__ — patrně se změnila struktura webu.");

  return JSON.parse(m[1]);
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
