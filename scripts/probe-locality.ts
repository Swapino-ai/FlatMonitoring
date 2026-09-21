/**
 * Jak Srealitam spravne rict, ve kterem meste hledat.
 * Praha/Brno/Ostrava v ceste funguji, mensi mesta (Litomerice) vraci 404.
 */
import { UA_PROHLIZEC } from "../src/lib/market/util";

async function zkus(popis: string, url: string) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA_PROHLIZEC, "Accept-Language": "cs-CZ,cs;q=0.9" } });
    const html = await res.text();
    const m = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    let pocet = 0, total: unknown = "—", prvni = "";
    if (m) {
      const d = JSON.parse(m[1]);
      total = d?.props?.pageProps?.total ?? "—";
      const qs = d?.props?.pageProps?.dehydratedState?.queries ?? [];
      for (const q of qs) {
        const r = q?.state?.data?.results;
        if (Array.isArray(r) && r.length && "priceCzk" in r[0]) {
          pocet = r.length;
          prvni = `${r[0].name} · ${r[0].locality?.city ?? "?"} ${r[0].locality?.cityPart ?? ""}`;
          break;
        }
      }
    }
    console.log(`  ${res.status === 200 ? "✓" : "✗"} ${String(res.status).padEnd(4)} ${popis}`);
    console.log(`       ${url}`);
    if (res.status === 200) console.log(`       total=${total} results=${pocet}${prvni ? ` · ${prvni}` : ""}`);
  } catch (e) {
    console.log(`  ! CHYBA ${popis}: ${e instanceof Error ? e.message : e}`);
  }
  await new Promise((r) => setTimeout(r, 1200));
}

async function main() {
  console.log("=== A) Tvary adresy pro Litoměřice ===");
  const base = "https://www.sreality.cz/hledani/prodej/byty";
  await zkus("holé jméno (současný kód)", `${base}/litomerice`);
  await zkus("kraj + město", `${base}/ustecky-kraj/litomerice`);
  await zkus("okres", `${base}/okres-litomerice`);
  await zkus("kraj + okres", `${base}/ustecky-kraj/okres-litomerice`);
  await zkus("jen kraj", `${base}/ustecky-kraj`);

  console.log("\n=== B) Kontrola, že velká města dál fungují ===");
  for (const m of ["praha", "brno", "ostrava", "plzen"]) await zkus(m, `${base}/${m}`);

  console.log("\n=== C) Další okresní města ===");
  for (const m of ["kladno", "jihlava", "decin", "trutnov"]) await zkus(m, `${base}/${m}`);

  console.log("\n=== D) Našeptávač lokalit (dal by se použít k překladu města na adresu) ===");
  for (const u of [
    "https://www.sreality.cz/api/cs/v2/localities?category_main_cb=1&phrase=Litom%C4%9B%C5%99ice",
    "https://www.sreality.cz/api/v1/cs/suggestions?phrase=Litom%C4%9B%C5%99ice",
    "https://www.sreality.cz/api/cs/v1/localities/suggest?phrase=Litomerice",
  ]) {
    try {
      const r = await fetch(u, { headers: { "User-Agent": UA_PROHLIZEC, Accept: "application/json" } });
      const t = await r.text();
      console.log(`  ${r.status} ${u}`);
      if (r.ok) console.log(`       ${t.slice(0, 300)}`);
    } catch (e) { console.log(`  ! ${u}: ${e instanceof Error ? e.message : e}`); }
    await new Promise((r) => setTimeout(r, 1200));
  }
}
main();
export {};
