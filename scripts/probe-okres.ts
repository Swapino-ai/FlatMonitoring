/**
 * Co delat, kdyz obec na Sreality vlastni stranku vypisu nema.
 *
 * Bohusovice nad Ohri vraci 404 hned na prvni strance — mala obec proste
 * nema vlastni vypis. Zkousime, jestli jde misto ni nacist okres nebo kraj;
 * okruh podle souradnic pak z vysledku vybere, co je opravdu blizko.
 *
 * Nic nemeni, jen cte.
 */
import { nactiStranku } from "../src/lib/market/util";

const TVARY = [
  // Okres v ruznych podobach
  "okres-litomerice",
  "litomerice-okres",
  "ustecky-kraj/okres-litomerice",
  "ustecky-kraj",
  "kraj-ustecky",
  // Vetsi sousedni mesto jako zaloha
  "litomerice",
];

function najdiVysledky(uzel: unknown, hloubka = 0): any[] {
  if (hloubka > 12 || uzel == null || typeof uzel !== "object") return [];
  if (Array.isArray(uzel)) {
    if (uzel.length >= 3 && uzel.every((x) => x && typeof x === "object" && "priceCzk" in (x as object))) return uzel as any[];
    for (const v of uzel.slice(0, 6)) { const n = najdiVysledky(v, hloubka + 1); if (n.length) return n; }
    return [];
  }
  for (const v of Object.values(uzel as Record<string, unknown>)) {
    const n = najdiVysledky(v, hloubka + 1); if (n.length) return n;
  }
  return [];
}

async function main() {
  console.log(`Sonda okresu a kraje — ${new Date().toISOString()}\n${"=".repeat(74)}\n`);

  // Nejdriv potvrdime, ze obec sama opravdu nejde
  for (const obec of ["bohusovice-nad-ohri", "terezin"]) {
    const url = `https://www.sreality.cz/hledani/prodej/byty/${obec}`;
    try {
      const { data } = await nactiStranku(url);
      console.log(`### ${obec}: OK, ${najdiVysledky(data).length} záznamů`);
    } catch (e) {
      console.log(`### ${obec}: ${(e as Error).message.slice(0, 70)}`);
    }
    await new Promise((s) => setTimeout(s, 1500));
  }
  console.log();

  for (const t of TVARY) {
    const url = `https://www.sreality.cz/hledani/prodej/byty/${t}`;
    console.log(`### ${t}`);
    try {
      const { data } = await nactiStranku(url);
      const z = najdiVysledky(data);
      console.log(`    OK · ${z.length} záznamů`);
      // Zajima nas zaber: ktere obce se ve vysledku objevi
      const obce = [...new Set(z.map((x) => x.locality?.city).filter(Boolean))];
      console.log(`    obce: ${obce.slice(0, 8).join(", ")}${obce.length > 8 ? ` … (${obce.length} celkem)` : ""}`);
      const sGps = z.filter((x) => x.locality?.latitude).length;
      console.log(`    se souřadnicemi: ${sGps}/${z.length}`);
    } catch (e) {
      console.log(`    ${(e as Error).message.slice(0, 80)}`);
    }
    console.log();
    await new Promise((s) => setTimeout(s, 1800));
  }

  console.log("=".repeat(74));
  console.log("Sonda dokončena.");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
