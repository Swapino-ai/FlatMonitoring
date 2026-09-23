/**
 * Sken v male obci, kde je nabidek par a druha stranka vypisu neexistuje.
 *
 * Presne tenhle pripad shazoval cely sken: portal na neexistujici strance
 * vrati 404 a s nim se zahodily i nabidky nactene z prvni stranky.
 * Nic nemeni, jen cte.
 */
import { srealitySource } from "../src/lib/market/sreality";

const PRIPADY: { city: string; category: string; dealType: "SALE" | "RENT"; areaM2: number }[] = [
  { city: "Litoměřice", category: "GARAZ", dealType: "SALE", areaM2: 18 },
  { city: "Litoměřice", category: "GARAZ", dealType: "RENT", areaM2: 18 },
  { city: "Litoměřice", category: "BYT", dealType: "SALE", areaM2: 60 },
];

async function main() {
  console.log(`Sken v malé obci — ${new Date().toISOString()}\n${"=".repeat(74)}\n`);

  let chyb = 0;
  for (const p of PRIPADY) {
    const popis = `${p.city} ${p.category} ${p.dealType === "SALE" ? "prodej" : "pronájem"}`;
    try {
      const n = await srealitySource.fetchListings({ ...p });
      // Nula nabidek je legitimni vysledek — v Litomericich se garaze
      // pronajimaji zridka. Nelegitimni je vyjimka.
      console.log(`    OK  ${popis}: ${n.length} nabídek${n.length > 0 && n.length < 3 ? " (malý vzorek — záznam má vzniknout i tak)" : ""}`);
      for (const x of n.slice(0, 3)) {
        // Odkaz je to hlavni, proc ma zaznam vzniknout i pri par nabidkach
        console.log(`          ${x.areaM2 ?? "?"} m² | ${x.price} Kč | ${x.district ?? "—"} | ${x.url ?? "BEZ ODKAZU"}`);
      }
    } catch (e) {
      chyb++;
      console.log(`    !!  ${popis}: ${(e as Error).message.slice(0, 160)}`);
    }
    await new Promise((s) => setTimeout(s, 2000));
  }

  console.log(`\n${"=".repeat(74)}`);
  if (chyb > 0) {
    console.log(`Sken v malé obci stále padá — ${chyb} případů.`);
    process.exitCode = 1;
  } else {
    console.log("Malá obec sken neshodí.");
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
