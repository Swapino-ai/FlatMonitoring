/**
 * Sonda: jak na Sreality najit nabidky v male obci (Velemin / Oparno).
 * Zkousi ruzne tvary adres vypisu a hleda v nich konkretni inzerat.
 */
import { nactiStranku } from "../src/lib/market/util";

const HLEDANE = "2993688652";
const DETAIL = "https://www.sreality.cz/detail/prodej/byt/3+kk/velemin-oparno-/2993688652";

function vysledky(data: unknown): any[] {
  const q = (data as any)?.props?.pageProps?.dehydratedState?.queries;
  if (!Array.isArray(q)) return [];
  for (const x of q) {
    const r = x?.state?.data?.results;
    if (Array.isArray(r) && r.length && "priceCzk" in r[0]) return r;
  }
  return [];
}

function najdiKlice(o: any, cesta = "", out: string[] = [], hloubka = 0): string[] {
  if (!o || typeof o !== "object" || hloubka > 7) return out;
  for (const [k, v] of Object.entries(o)) {
    const c = `${cesta}.${k}`;
    if (/locality|region|district|municipal|ward|quarter|city|okres|gps|lat|lon/i.test(k) && (typeof v !== "object" || v === null)) out.push(`${c} = ${JSON.stringify(v)}`);
    if (typeof v === "object") najdiKlice(v, c, out, hloubka + 1);
  }
  return out;
}

async function zkus(popis: string, url: string) {
  try {
    const { data } = await nactiStranku(url);
    const r = vysledky(data);
    const total = JSON.stringify(data).match(/"resultSize":(\d+)|"totalCount":(\d+)|"pagination":\{[^}]*"total":(\d+)/);
    const nalezen = r.some((z) => String(z.id) === HLEDANE);
    console.log(`${nalezen ? "NAŠEL" : "     "} ${popis.padEnd(34)} ${r.length} na stránce ${total ? `(celkem ${total.slice(1).find(Boolean)})` : ""} ${url}`);
    if (r[0]) console.log(`       první: ${r[0].name} · ${r[0].locality?.city} · ${r[0].locality?.cityPart ?? ""}`);
  } catch (e) {
    console.log(`  CHYBA ${popis.padEnd(34)} ${(e as Error).message.slice(0, 120)}`);
  }
}

async function main() {
  console.log("== Detail inzerátu: údaje o lokalitě ==");
  try {
    const { data } = await nactiStranku(DETAIL);
    for (const r of najdiKlice((data as any)?.props?.pageProps).slice(0, 80)) console.log("  " + r);
  } catch (e) { console.log("  detail chyba:", (e as Error).message); }

  console.log("\n== Výpisy ==");
  const b = "https://www.sreality.cz/hledani/prodej/byty";
  await zkus("obec velemin", `${b}/velemin`);
  await zkus("obec velemin-oparno", `${b}/velemin-oparno`);
  await zkus("okres litomerice", `${b}/okres-litomerice`);
  await zkus("litomerice", `${b}/litomerice`);
  await zkus("okres param", `${b}?okresy=litomerice`);
  await zkus("region query", `${b}?region=Velem%C3%ADn&region-typ=municipality`);
  await zkus("bbox lat/lon", `${b}?lat-max=50.56&lat-min=50.50&lon-max=14.00&lon-min=13.90`);
  await zkus("bbox lat/lng", `${b}?lat_max=50.56&lat_min=50.50&lng_max=14.00&lng_min=13.90`);
  await zkus("kraj", `${b}/ustecky-kraj`);
  await zkus("kraj řazeno nejnovější", `${b}/ustecky-kraj?razeni=nejnovejsi`);
}

main();
