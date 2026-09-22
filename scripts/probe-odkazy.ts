/**
 * Jak se sklada odkaz na detail inzeratu Sreality.
 *
 * Dosavadni tvar /detail/<typ>/byt/x/x/<id> se spolehal na to, ze portal
 * zastupne "x" v ceste prepise sam. Zjistujeme, jestli to plati.
 * Nic nemeni, jen cte.
 */
import { HLAVICKY_PROHLIZECE, nactiNextData } from "../src/lib/market/util";

const VYPIS = "https://www.sreality.cz/hledani/prodej/byty/praha";

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

async function zkus(popis: string, url: string) {
  const r = await fetch(url, { headers: HLAVICKY_PROHLIZECE, redirect: "follow" });
  await r.text();
  console.log(`    ${popis}`);
  console.log(`      ${url}`);
  console.log(`      → HTTP ${r.status}${r.url !== url ? ` · přesměrováno na ${r.url}` : ""}`);
  await new Promise((s) => setTimeout(s, 1500));
}

async function main() {
  console.log(`Sonda odkazů Sreality — ${new Date().toISOString()}\n${"=".repeat(74)}\n`);

  // 1. Jak odkazy vypadaji primo v HTML vypisu — to je zdroj pravdy
  const html = await (await fetch(VYPIS, { headers: HLAVICKY_PROHLIZECE })).text();
  const odkazy = [...new Set(html.match(/\/detail\/[^"'\\ ]+/g) ?? [])].slice(0, 8);
  console.log(`### Odkazy nalezené v HTML výpisu (${odkazy.length} ukázek)`);
  for (const o of odkazy) console.log(`    ${o}`);
  console.log();

  // 2. Cely prvni zaznam — hledame pole, ze kterych se cesta sklada
  const data = await nactiNextData(VYPIS);
  const zaznamy = najdiVysledky(data);
  console.log(`### První záznam z dat stránky (${zaznamy.length} celkem)`);
  console.log(JSON.stringify(zaznamy[0], null, 2).slice(0, 2500));
  console.log();

  // 3. Porovnani tvaru adresy na prvnim skutecnem inzeratu
  const z = zaznamy[0];
  if (z?.id) {
    console.log(`### Tvary adresy pro inzerát ${z.id}`);
    await zkus("dosavadní (zástupné x/x)", `https://www.sreality.cz/detail/prodej/byt/x/x/${z.id}`);
    await zkus("jen id", `https://www.sreality.cz/detail/${z.id}`);
    if (z.seoLocality || z.locality?.seoName) {
      const lok = z.seoLocality ?? z.locality?.seoName;
      await zkus("se slugem lokality", `https://www.sreality.cz/detail/prodej/byt/x/${lok}/${z.id}`);
    }
  }

  console.log("=".repeat(74));
  console.log("Sonda dokončena.");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
