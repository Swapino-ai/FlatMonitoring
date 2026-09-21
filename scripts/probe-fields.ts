/**
 * Treti faze: presne tvary poli a chovani filtru.
 * Zjistuje, jak vypada jeden inzerat, jak se strankuje a jak filtrovat dispozici.
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function nextData(url: string): Promise<any | null> {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "cs-CZ,cs;q=0.9" } });
  const html = await res.text();
  const m = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  console.log(`   HTTP ${res.status}, ${html.length} B, __NEXT_DATA__ ${m ? "ano" : "NE"}`);
  return m ? JSON.parse(m[1]) : null;
}

/** Najde v dehydratedState pole results s inzeraty. */
function srealityResults(data: any): any[] | null {
  const queries = data?.props?.pageProps?.dehydratedState?.queries;
  if (!Array.isArray(queries)) return null;
  for (const q of queries) {
    const r = q?.state?.data?.results;
    if (Array.isArray(r) && r.length && "priceCzk" in r[0]) return r;
  }
  return null;
}

async function sreality() {
  console.log("\n" + "=".repeat(74));
  console.log("SREALITY — tvar jednoho inzeratu");

  const data = await nextData("https://www.sreality.cz/hledani/prodej/byty/praha");
  if (!data) return;

  console.log(`   pageProps.total = ${JSON.stringify(data?.props?.pageProps?.total)}`);

  const res = srealityResults(data);
  if (!res) { console.log("   results nenalezeny"); return; }
  console.log(`   results: ${res.length} polozek`);

  const r = { ...res[0] };
  delete r.images;            // obrazky jsou dlouhe a nepotrebujeme je
  delete r.premiseLogo;
  delete r.watchdogBadge;
  console.log("   PRVNI INZERAT (bez obrazku):");
  console.log(JSON.stringify(r, null, 2).split("\n").map((l) => "     " + l).join("\n"));

  // Jak vypada cena a plocha napric vzorkem
  console.log("\n   PREHLED VZORKU:");
  for (const x of res.slice(0, 5)) {
    console.log(`     name="${x.name}" | priceCzk=${JSON.stringify(x.priceCzk)} | perSqM=${JSON.stringify(x.priceCzkPerSqM)} | sub=${JSON.stringify(x.categorySubCb?.name)} | locality=${JSON.stringify(x.locality)?.slice(0, 120)}`);
  }
}

async function srealityFiltry() {
  console.log("\n" + "=".repeat(74));
  console.log("SREALITY — strankovani a filtr dispozice");

  const varianty = [
    { nazev: "strana 2", url: "https://www.sreality.cz/hledani/prodej/byty/praha?strana=2" },
    { nazev: "dispozice 2+kk v ceste", url: "https://www.sreality.cz/hledani/prodej/byty/2+kk/praha" },
    { nazev: "Brno", url: "https://www.sreality.cz/hledani/prodej/byty/brno" },
    { nazev: "Ostrava pronajem", url: "https://www.sreality.cz/hledani/pronajem/byty/ostrava" },
  ];

  for (const v of varianty) {
    console.log(`\n   ### ${v.nazev}: ${v.url}`);
    try {
      const d = await nextData(v.url);
      const r = d ? srealityResults(d) : null;
      console.log(`   total=${JSON.stringify(d?.props?.pageProps?.total)} results=${r?.length ?? 0}`);
      if (r?.length) {
        console.log(`   prvni: "${r[0].name}" | ${JSON.stringify(r[0].priceCzk)} | sub=${JSON.stringify(r[0].categorySubCb?.name)}`);
      }
    } catch (e) {
      console.log(`   VYJIMKA: ${e instanceof Error ? e.message : e}`);
    }
    await new Promise((x) => setTimeout(x, 2000));
  }
}

async function bezrealitky() {
  console.log("\n" + "=".repeat(74));
  console.log("BEZREALITKY — apolloCache");

  const data = await nextData("https://www.bezrealitky.cz/vyhledat?offerType=PRODEJ&estateType=BYT&location=Praha");
  if (!data) return;

  const cache = data?.props?.pageProps?.apolloCache;
  if (!cache) { console.log("   apolloCache chybi"); return; }

  const klice = Object.keys(cache);
  console.log(`   apolloCache: ${klice.length} zaznamu`);
  console.log(`   ukazka klicu: ${klice.slice(0, 15).join(" | ")}`);

  // Zaznamy, ktere vypadaji jako inzerat
  const inzeraty = klice.filter((k) => /^Advert/i.test(k) || /Estate/i.test(k));
  console.log(`   klicu pripominajicich inzerat: ${inzeraty.length}`);

  const vzorekKlic = inzeraty[0] ?? klice.find((k) => {
    const v = cache[k];
    return v && typeof v === "object" && Object.keys(v).some((x) => x.toLowerCase().includes("price"));
  });

  if (vzorekKlic) {
    const v = { ...(cache[vzorekKlic] as Record<string, unknown>) };
    delete (v as any).mainImage;
    delete (v as any).images;
    console.log(`\n   VZOREK "${vzorekKlic}":`);
    console.log(JSON.stringify(v, null, 2).slice(0, 2200).split("\n").map((l) => "     " + l).join("\n"));
  } else {
    console.log("   zadny zaznam s cenou nenalezen");
    console.log(`   ROOT_QUERY klice: ${Object.keys(cache.ROOT_QUERY ?? {}).slice(0, 20).join(" | ")}`);
  }
}

async function main() {
  await sreality();
  await new Promise((r) => setTimeout(r, 2000));
  await srealityFiltry();
  await new Promise((r) => setTimeout(r, 2000));
  await bezrealitky();
  console.log("\nSonda dokoncena.");
}

main();
