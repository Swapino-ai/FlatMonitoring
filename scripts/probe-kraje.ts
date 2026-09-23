/**
 * Overeni, ze vsech ctrnact kraju v katalogu Sreality opravdu prijmou.
 *
 * Nabidnout uzivateli ve vyberu tvar, ktery vraci 404, by bylo horsi nez
 * nenabidnout nic — mysli si, ze ma vyplneno, a sken presto nic nenajde.
 * Overeno zatim jen "ustecky-kraj", zbytek je odvozeny stejnym pravidlem.
 *
 * Nic nemeni, jen cte.
 */
import { KRAJE } from "../src/lib/catalogs";
import { nactiStranku } from "../src/lib/market/util";

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
  console.log(`Ověření krajů — ${new Date().toISOString()}\n${"=".repeat(74)}\n`);

  let chyb = 0;
  for (const k of KRAJE) {
    const url = `https://www.sreality.cz/hledani/prodej/byty/${k.slug}`;
    try {
      const { data } = await nactiStranku(url);
      const z = najdiVysledky(data);
      const ok = z.length > 0;
      if (!ok) chyb++;
      console.log(`  ${ok ? "OK " : "!! "} ${k.slug.padEnd(22)} ${z.length} nabídek`);
    } catch (e) {
      chyb++;
      console.log(`  !!  ${k.slug.padEnd(22)} ${(e as Error).message.slice(0, 60)}`);
    }
    await new Promise((s) => setTimeout(s, 1500)); // ohleduplne tempo
  }

  console.log(`\n${"=".repeat(74)}`);
  if (chyb > 0) {
    console.log(`${chyb} krajů Sreality nepřijaly — ve výběru by byly k ničemu.`);
    process.exitCode = 1;
  } else {
    console.log("Všech 14 krajů Sreality přijímají.");
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
