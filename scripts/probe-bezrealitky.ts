/** Hleda, jak Bezrealitkam spravne rict, ve kterem meste hledat. */
import { nactiNextData } from "../src/lib/market/util";

const VARIANTY = [
  { nazev: "location=Praha (soucasny)", q: "offerType=PRODEJ&estateType=BYT&location=Praha" },
  { nazev: "regionOsmIds Praha R435514", q: "offerType=PRODEJ&estateType=BYT&regionOsmIds=R435514" },
  { nazev: "osm_ids alternativa", q: "offerType=PRODEJ&estateType=BYT&osm_ids=R435514" },
  { nazev: "priamo /praha v ceste", q: "", url: "https://www.bezrealitky.cz/vyhledat/praha" },
  { nazev: "bez filtru mesta", q: "offerType=PRODEJ&estateType=BYT" },
];

function adresa(a: Record<string, unknown>): string {
  const k = Object.keys(a).find((x) => x.startsWith("address"));
  return k && typeof a[k] === "string" ? (a[k] as string) : "";
}

async function main() {
  for (const v of VARIANTY) {
    const url = v.url ?? `https://www.bezrealitky.cz/vyhledat?${v.q}`;
    console.log(`\n### ${v.nazev}\n   ${url}`);
    try {
      const d: any = await nactiNextData(url);
      const cache = d?.props?.pageProps?.apolloCache ?? {};
      const ads = Object.entries(cache).filter(([k]) => /^Advert:/.test(k)).map(([, x]) => x as Record<string, unknown>);
      console.log(`   inzerátů: ${ads.length}`);
      const czk = ads.filter((a) => a.currency === "CZK");
      console.log(`   z toho v CZK: ${czk.length}`);
      for (const a of ads.slice(0, 6)) {
        console.log(`     ${a.currency} ${a.price} | ${a.disposition} ${a.surface} m² | "${adresa(a)}"`);
      }
      console.log(`   filtr v pageProps: ${JSON.stringify(d?.props?.pageProps?.filter)?.slice(0, 220)}`);
    } catch (e) {
      console.log(`   VYJIMKA: ${e instanceof Error ? e.message : e}`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}
main();
export {};
