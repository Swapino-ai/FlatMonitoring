/**
 * Ktere portaly jdou skenovat na pronajmy.
 * Nic nemeni — jen zkusi adresy a vypise, v jakem tvaru data vraci.
 */
import { HLAVICKY_PROHLIZECE } from "../src/lib/market/util";

interface Kandidat { nazev: string; url: string }

const KANDIDATI: Kandidat[] = [
  { nazev: "Sreality (zaveden)", url: "https://www.sreality.cz/hledani/pronajem/byty/praha" },
  { nazev: "Bezrealitky (zamitnut driv)", url: "https://www.bezrealitky.cz/vyhledat?offerType=PRONAJEM&estateType=BYT&location=Praha" },
  { nazev: "UlovDomov", url: "https://www.ulovdomov.cz/pronajem-bytu/praha" },
  { nazev: "iDNES Reality", url: "https://reality.idnes.cz/s/pronajem/byty/praha/" },
  { nazev: "RealityMix", url: "https://www.realitymix.cz/pronajem-bytu/praha/" },
  { nazev: "Bazoš reality", url: "https://reality.bazos.cz/pronajmu/byt/praha/" },
  { nazev: "RE/MAX", url: "https://www.remax-czech.cz/reality/vyhledavani/?sale=2&types=1" },
  { nazev: "Century 21", url: "https://www.century21.cz/pronajem-bytu" },
  { nazev: "Reality.cz", url: "https://reality.cz/pronajem/byty/praha/" },
  { nazev: "M&M Reality", url: "https://www.mmreality.cz/cs/pronajem/byty" },
];

/** Najde v JSON pole objektu, ktere vypada jako inzeraty. */
function najdiInzeraty(uzel: unknown, cesta = "", hloubka = 0): { cesta: string; pocet: number; klice: string[] } | null {
  if (hloubka > 12 || uzel == null || typeof uzel !== "object") return null;
  if (Array.isArray(uzel)) {
    if (uzel.length >= 3 && uzel.every((x) => x && typeof x === "object")) {
      const k = Object.keys(uzel[0] as object).map((x) => x.toLowerCase());
      const maCenu = k.some((x) => x.includes("price") || x.includes("cena") || x.includes("rent"));
      const maPlochu = k.some((x) => x.includes("area") || x.includes("surface") || x.includes("plocha") || x.includes("name") || x.includes("title"));
      if (maCenu && maPlochu) return { cesta, pocet: uzel.length, klice: Object.keys(uzel[0] as object) };
    }
    for (let i = 0; i < Math.min(uzel.length, 5); i++) {
      const n = najdiInzeraty(uzel[i], `${cesta}[${i}]`, hloubka + 1);
      if (n) return n;
    }
    return null;
  }
  for (const [k, v] of Object.entries(uzel as Record<string, unknown>)) {
    const n = najdiInzeraty(v, cesta ? `${cesta}.${k}` : k, hloubka + 1);
    if (n) return n;
  }
  return null;
}

/** Odhad poctu inzeratu v HTML podle vyskytu ceny za mesic. */
function cenyVHtml(html: string): number {
  return (html.match(/\d[\d\s ]{2,}\s*Kč\s*\/\s*měs/gi) ?? []).length
    + (html.match(/\d[\d\s ]{2,}\s*Kč\s*za\s*měs/gi) ?? []).length;
}

async function main() {
  console.log(`Sonda pronájmů — ${new Date().toISOString()}\n${"=".repeat(74)}`);

  for (const k of KANDIDATI) {
    console.log(`\n### ${k.nazev}\n    ${k.url}`);
    try {
      const t0 = Date.now();
      const res = await fetch(k.url, { headers: HLAVICKY_PROHLIZECE, redirect: "follow" });
      const html = await res.text();
      console.log(`    HTTP ${res.status} (${Date.now() - t0} ms, ${Math.round(html.length / 1024)} kB)`);
      if (res.url !== k.url) console.log(`    přesměrováno: ${res.url}`);
      if (!res.ok) continue;

      // Next.js data
      const next = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
      if (next) {
        try {
          const n = najdiInzeraty(JSON.parse(next[1]));
          console.log(`    __NEXT_DATA__: ${n ? `inzeráty na ${n.cesta} (${n.pocet}×)` : "bez rozpoznatelných inzerátů"}`);
          if (n) console.log(`      klíče: ${n.klice.slice(0, 14).join(", ")}`);
        } catch { console.log("    __NEXT_DATA__ se neparsuje"); }
      }

      // Nuxt / Vue
      if (/__NUXT__/.test(html)) console.log("    obsahuje __NUXT__ (Vue) — data v inline skriptu");

      // JSON-LD
      const ld = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)];
      if (ld.length) {
        const typy = ld.map((m) => { try { const j = JSON.parse(m[1]); return Array.isArray(j) ? j[0]?.["@type"] : j["@type"]; } catch { return "?"; } });
        console.log(`    JSON-LD: ${ld.length}× (${typy.join(", ")})`);
      }

      const ceny = cenyVHtml(html);
      console.log(`    cen "Kč/měs" přímo v HTML: ${ceny}`);
      if (!next && !ceny && !ld.length) console.log("    → vypadá na vykreslování až v prohlížeči");
    } catch (e) {
      console.log(`    VÝJIMKA: ${e instanceof Error ? e.message : e}`);
    }
    await new Promise((r) => setTimeout(r, 1800));
  }
  console.log(`\n${"=".repeat(74)}\nSonda dokončena.`);
}
main();
export {};
