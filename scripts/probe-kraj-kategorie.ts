/**
 * Dve otazky naraz:
 *
 * 1. Prijima kraj i jine kategorie nez byty? Overeny byl jen /byty/ustecky-kraj,
 *    ale sken ted zkousi i /garaze/ustecky-kraj.
 * 2. Neomezuje Sreality cetnost? V logu uzivatele tentyz tvar adresy jednou
 *    projde a o par radku niz vraci 404 — to nevypada na neplatnou adresu.
 *
 * Nic nemeni, jen cte.
 */
import { HLAVICKY_PROHLIZECE } from "../src/lib/market/util";

async function stav(url: string): Promise<number> {
  const r = await fetch(url, { headers: HLAVICKY_PROHLIZECE, redirect: "manual" });
  await r.text().catch(() => "");
  return r.status;
}

async function main() {
  console.log(`Kraj × kategorie a četnost — ${new Date().toISOString()}\n${"=".repeat(74)}\n`);

  console.log("### Kraj s různými kategoriemi (mezi dotazy 2 s)");
  for (const cesta of ["byty", "garaze", "garazova-stani", "domy", "komercni/sklady", "pozemky"]) {
    for (const typ of ["prodej", "pronajem"]) {
      const url = `https://www.sreality.cz/hledani/${typ}/${cesta}/ustecky-kraj`;
      const s = await stav(url);
      console.log(`  ${s === 200 ? "OK " : "!! "} ${s}  ${typ}/${cesta}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  console.log("\n### Totéž bez čekání — dvanáct dotazů hned po sobě");
  // Kdyz zacnou vracet 404 az od nejakeho poradi, je to omezeni cetnosti,
  // ne neplatna adresa
  for (let i = 1; i <= 12; i++) {
    const s = await stav("https://www.sreality.cz/hledani/prodej/byty/ustecky-kraj");
    console.log(`  ${i.toString().padStart(2)}. ${s === 200 ? "OK " : "!! "} ${s}`);
  }

  console.log("\n### Po pauze 20 s znovu");
  await new Promise((r) => setTimeout(r, 20000));
  console.log(`  ${await stav("https://www.sreality.cz/hledani/prodej/byty/ustecky-kraj")}`);

  console.log(`\n${"=".repeat(74)}\nSonda dokončena.`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
