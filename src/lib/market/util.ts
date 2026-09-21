import type { ScanQuery, ScrapedListing } from "./types";

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export const UA_PROHLIZEC =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

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
  const res = await fetch(url, {
    headers: { "User-Agent": UA_PROHLIZEC, "Accept-Language": "cs-CZ,cs;q=0.9" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} na ${url}`);

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
