/**
 * Overeni scraperu proti zivym portalum. Nezapisuje do databaze.
 * Spousti se z GitHub Actions, kde je otevreny internet.
 */
import { srealitySource } from "../src/lib/market/sreality";
import type { ScanQuery } from "../src/lib/market/types";

const PRIPADY: { nazev: string; query: ScanQuery }[] = [
  { nazev: "Praha 2+kk 54 m² prodej", query: { city: "Praha", disposition: "2+kk", areaM2: 54, dealType: "SALE" } },
  { nazev: "Praha 2+kk 54 m² pronájem", query: { city: "Praha", disposition: "2+kk", areaM2: 54, dealType: "RENT" } },
  { nazev: "Brno 3+1 76 m² prodej", query: { city: "Brno", disposition: "3+1", areaM2: 76, dealType: "SALE" } },
  { nazev: "Ostrava 1+kk 32 m² prodej", query: { city: "Ostrava", disposition: "1+kk", areaM2: 32, dealType: "SALE" } },
];

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

let chyb = 0;

async function main() {
  for (const p of PRIPADY) {
    console.log("\n" + "=".repeat(70));
    console.log(`### ${p.nazev}`);

    for (const zdroj of [srealitySource]) {
      const t0 = Date.now();
      try {
        const n = await zdroj.fetchListings(p.query);
        const s = ((Date.now() - t0) / 1000).toFixed(1);
        console.log(`\n  ${zdroj.name}: ${n.length} srovnatelných nabídek za ${s} s`);

        if (n.length === 0) {
          console.log("    (nic neprošlo filtrem — může být v pořádku u úzkého zadání)");
          continue;
        }

        // Kontroly integrity: bez nich by se do medianu dostaly nesmysly
        const bezCeny = n.filter((x) => !x.price || x.price <= 0);
        const bezPlochy = n.filter((x) => !x.areaM2);
        const bezM2 = n.filter((x) => !x.pricePerM2);
        const spatnaDispozice = n.filter((x) => x.disposition && x.disposition !== p.query.disposition);
        const mimoToleranci = n.filter((x) => x.areaM2 && Math.abs(x.areaM2 - p.query.areaM2!) > Math.max(10, p.query.areaM2! * 0.25));

        if (bezCeny.length) { console.log(`    CHYBA: ${bezCeny.length} bez ceny`); chyb++; }
        if (bezPlochy.length) { console.log(`    CHYBA: ${bezPlochy.length} bez plochy`); chyb++; }
        if (bezM2.length) { console.log(`    CHYBA: ${bezM2.length} bez ceny za m²`); chyb++; }
        if (spatnaDispozice.length) { console.log(`    CHYBA: ${spatnaDispozice.length} se špatnou dispozicí`); chyb++; }
        if (mimoToleranci.length) { console.log(`    CHYBA: ${mimoToleranci.length} mimo toleranci plochy`); chyb++; }

        const perM2 = n.map((x) => x.pricePerM2!).filter(Boolean);
        if (perM2.length) {
          console.log(`    medián: ${Math.round(median(perM2)).toLocaleString("cs-CZ")} Kč/m²`);
          console.log(`    rozpětí: ${Math.round(Math.min(...perM2)).toLocaleString("cs-CZ")} – ${Math.round(Math.max(...perM2)).toLocaleString("cs-CZ")} Kč/m²`);
        }

        for (const x of n.slice(0, 3)) {
          console.log(`    · ${x.disposition ?? "?"} ${x.areaM2 ?? "?"} m² | ${x.price.toLocaleString("cs-CZ")} Kč | ${Math.round(x.pricePerM2 ?? 0).toLocaleString("cs-CZ")} Kč/m² | ${x.district ?? "—"}`);
        }
      } catch (e) {
        console.log(`\n  ${zdroj.name}: VÝJIMKA — ${e instanceof Error ? e.message : e}`);
        chyb++;
      }
    }
  }

  console.log("\n" + "=".repeat(70));
  console.log(chyb === 0 ? "Všechny kontroly prošly." : `NALEZENO ${chyb} problémů.`);
  if (chyb > 0) process.exitCode = 1;
}

main();

export {};
