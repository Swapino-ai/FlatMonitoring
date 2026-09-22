/**
 * Overeni, ze odkazy na detail inzeratu, ktere scraper vraci, opravdu funguji.
 *
 * Tvar /detail/<typ>/<druh>/<dispozice>/<slug-lokality>/<id> se z dat stranky
 * poskladat neda — slug ulice v nich neni — takze se bere z odkazu ve vypisu.
 * Tahle sonda spusti skutecny scraper a kazdy vraceny odkaz zkusi otevrit.
 * Nic nemeni, jen cte.
 */
import { srealitySource } from "../src/lib/market/sreality";
import { HLAVICKY_PROHLIZECE } from "../src/lib/market/util";

async function main() {
  console.log(`Ověření odkazů na detail — ${new Date().toISOString()}\n${"=".repeat(74)}\n`);

  let chyb = 0;
  for (const dealType of ["SALE", "RENT"] as const) {
    console.log(`### Praha 2+kk ${dealType === "SALE" ? "prodej" : "pronájem"}`);
    const nabidky = await srealitySource.fetchListings({
      city: "Praha", disposition: "2+kk", areaM2: 54, dealType,
    });

    const bezOdkazu = nabidky.filter((n: { url?: string }) => !n.url).length;
    console.log(`    ${nabidky.length} nabídek, z toho ${bezOdkazu} bez odkazu`);
    if (bezOdkazu > 0) chyb++;

    // Presmerovani vyhodnocujeme rucne: Sreality posilaji holy pozadavek
    // do smycky pres ?noredirect=1, takze "follow" skonci chybou i u zive
    // stranky. Zajima nas prvni odpoved — 200, nebo kam nas posila.
    for (const n of nabidky.filter((x: { url?: string }) => x.url).slice(0, 5)) {
      const r = await fetch(n.url!, { headers: HLAVICKY_PROHLIZECE, redirect: "manual" });
      await r.text().catch(() => "");
      const kam = r.headers.get("location") ?? "";
      // Klienta bez cookies posila Seznam na autologin a v return_url nese
      // puvodni adresu — to je SSO odskok, ne rozbity odkaz. Rozbita adresa
      // vraci 404 (overeno na starem tvaru se zastupnym /x/x/).
      const odskok = kam.includes("noredirect=1")
        || (kam.includes("login.seznam.cz") && decodeURIComponent(kam).includes(n.url!));
      const ok = r.status === 200 || (r.status >= 300 && r.status < 400 && odskok);
      if (!ok) chyb++;
      console.log(`    ${ok ? "OK " : "!! "} HTTP ${r.status}${kam ? ` → ${kam.slice(0, 60)}…` : ""}`);
      console.log(`        ${n.url}`);
      await new Promise((s) => setTimeout(s, 1200));
    }
    console.log();
  }

  console.log("=".repeat(74));
  if (chyb > 0) {
    console.log(`Odkazy NEFUNGUJÍ — ${chyb} problémů.`);
    process.exitCode = 1;
  } else {
    console.log("Všechny ověřené odkazy vedou na živý inzerát.");
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
