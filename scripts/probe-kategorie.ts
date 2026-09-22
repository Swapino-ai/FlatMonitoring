/**
 * Ktere kategorie Sreality jdou skenovat krome bytu.
 *
 * Scraper ma v adrese natvrdo "byty", takze garaz ani nebytovy prostor
 * nenajde. Sonda zkusi kandidatske cesty a u tech funkcnich vypise, co
 * v datech skutecne je — hlavne jestli je u nich plocha a cena za m².
 * Nic nemeni, jen cte.
 */
import { nactiStranku } from "../src/lib/market/util";

const CESTY = [
  "byty", "domy", "pozemky", "komercni", "ostatni",
  // Uzsi tvary, kdyby se kategorie delila dal
  "ostatni/garaz", "ostatni/garaze", "garaze",
  "komercni/sklady", "komercni/kancelare",
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
  console.log(`Sonda kategorií Sreality — ${new Date().toISOString()}\n${"=".repeat(74)}\n`);

  for (const cesta of CESTY) {
    const url = `https://www.sreality.cz/hledani/prodej/${cesta}/praha`;
    console.log(`### ${cesta}`);
    console.log(`    ${url}`);
    try {
      const { data } = await nactiStranku(url);
      const z = najdiVysledky(data);
      console.log(`    OK · ${z.length} záznamů`);
      // Podkategorie rozhoduji, jestli v ni garaz vubec je
      const podkategorie = [...new Set(z.map((x) => x.categorySubCb?.name).filter(Boolean))];
      console.log(`    podkategorie: ${podkategorie.join(", ") || "—"}`);
      const sPlochou = z.filter((x) => x.priceCzkPerSqM > 0).length;
      console.log(`    s cenou za m²: ${sPlochou}/${z.length}`);
      for (const x of z.slice(0, 3)) {
        console.log(`      · "${x.name}" | ${x.priceCzk} Kč | perSqM=${x.priceCzkPerSqM ?? "—"} | sub="${x.categorySubCb?.name ?? "—"}" | main="${x.categoryMainCb?.name ?? "—"}"`);
      }
    } catch (e) {
      console.log(`    selhalo: ${(e as Error).message.slice(0, 120)}`);
    }
    console.log();
    await new Promise((s) => setTimeout(s, 1800));
  }

  console.log("=".repeat(74));
  console.log("Sonda dokončena.");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
