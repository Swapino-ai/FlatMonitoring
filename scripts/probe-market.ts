/**
 * Diagnostika dostupnosti inzertnich portalu.
 *
 * Nemeni zadna data — jen vyzkousi ruzne varianty adres a vypise, co vratily.
 * Spousti se z GitHub Actions, protoze ta ma na rozdil od vyvojoveho prostredi
 * otevreny internet.
 */

interface Pokus {
  nazev: string;
  url: string;
  headers?: Record<string, string>;
}

const UA_BOT = "Mozilla/5.0 (compatible; FlatMonitoring/0.1; osobni evidence nemovitosti)";
const UA_PROHLIZEC =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const POKUSY: Pokus[] = [
  // --- Sreality: ruzne verze a tvary API ---
  {
    nazev: "sreality v2 /api/cs/v2/estates (soucasny kod)",
    url: "https://www.sreality.cz/api/cs/v2/estates?category_main_cb=1&category_type_cb=1&locality=Praha&per_page=5&page=1",
    headers: { "User-Agent": UA_BOT, Accept: "application/json" },
  },
  {
    nazev: "sreality v2 + hlavicky prohlizece",
    url: "https://www.sreality.cz/api/cs/v2/estates?category_main_cb=1&category_type_cb=1&locality=Praha&per_page=5&page=1",
    headers: {
      "User-Agent": UA_PROHLIZEC,
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "cs-CZ,cs;q=0.9",
      Referer: "https://www.sreality.cz/hledani/prodej/byty/praha",
    },
  },
  {
    nazev: "sreality v2 bez locality",
    url: "https://www.sreality.cz/api/cs/v2/estates?category_main_cb=1&category_type_cb=1&per_page=5",
    headers: { "User-Agent": UA_PROHLIZEC, Accept: "application/json" },
  },
  {
    nazev: "sreality v1",
    url: "https://www.sreality.cz/api/cs/v1/estates?category_main_cb=1&category_type_cb=1&per_page=5",
    headers: { "User-Agent": UA_PROHLIZEC, Accept: "application/json" },
  },
  {
    nazev: "sreality bez jazykove casti /api/v2/estates",
    url: "https://www.sreality.cz/api/v2/estates?category_main_cb=1&category_type_cb=1&per_page=5",
    headers: { "User-Agent": UA_PROHLIZEC, Accept: "application/json" },
  },
  {
    nazev: "sreality obycejna HTML stranka vypisu",
    url: "https://www.sreality.cz/hledani/prodej/byty/praha",
    headers: { "User-Agent": UA_PROHLIZEC, "Accept-Language": "cs-CZ,cs;q=0.9" },
  },

  // --- Bezrealitky ---
  {
    nazev: "bezrealitky vyhledat (soucasny kod)",
    url: "https://www.bezrealitky.cz/vyhledat?offerType=PRODEJ&estateType=BYT&location=Praha",
    headers: { "User-Agent": UA_BOT, "Accept-Language": "cs-CZ,cs;q=0.9" },
  },
  {
    nazev: "bezrealitky vyhledat + hlavicky prohlizece",
    url: "https://www.bezrealitky.cz/vyhledat?offerType=PRODEJ&estateType=BYT&location=Praha",
    headers: { "User-Agent": UA_PROHLIZEC, "Accept-Language": "cs-CZ,cs;q=0.9" },
  },
  {
    nazev: "bezrealitky GraphQL endpoint (existuje?)",
    url: "https://api.bezrealitky.cz/graphql",
    headers: { "User-Agent": UA_PROHLIZEC },
  },
];

function popisObsah(telo: string): string {
  const t = telo.trim();
  if (t.startsWith("{") || t.startsWith("[")) {
    try {
      const j = JSON.parse(t);
      const klice = Array.isArray(j) ? `pole[${j.length}]` : Object.keys(j).slice(0, 12).join(", ");
      const vnorene = j?._embedded?.estates;
      const pocet = Array.isArray(vnorene) ? ` | _embedded.estates: ${vnorene.length} polozek` : "";
      const vzorek = Array.isArray(vnorene) && vnorene[0]
        ? `\n      vzorek: ${JSON.stringify(vnorene[0]).slice(0, 260)}`
        : "";
      return `JSON — klice: ${klice}${pocet}${vzorek}`;
    } catch {
      return `vypada jako JSON, ale neparsuje se: ${t.slice(0, 160)}`;
    }
  }
  if (t.startsWith("<")) {
    const nextData = t.match(/id="__NEXT_DATA__"[^>]*>([\s\S]{0,200})/);
    const title = t.match(/<title>([^<]*)<\/title>/)?.[1] ?? "";
    return `HTML — <title>${title}</title>` +
      (nextData ? `\n      __NEXT_DATA__ pritomno, zacatek: ${nextData[1].slice(0, 160)}` : "\n      __NEXT_DATA__ NENALEZENO");
  }
  return `jine: ${t.slice(0, 160)}`;
}

async function main() {
  console.log(`Sonda portalu — ${new Date().toISOString()}`);
  console.log("=".repeat(70));

  for (const p of POKUSY) {
    console.log(`\n### ${p.nazev}`);
    console.log(`    ${p.url}`);
    try {
      const zacatek = Date.now();
      const res = await fetch(p.url, { headers: p.headers, redirect: "follow" });
      const ms = Date.now() - zacatek;
      const telo = await res.text();

      console.log(`    HTTP ${res.status} ${res.statusText} (${ms} ms, ${telo.length} B)`);
      console.log(`    content-type: ${res.headers.get("content-type") ?? "—"}`);
      if (res.url !== p.url) console.log(`    presmerovano na: ${res.url}`);
      console.log(`    ${popisObsah(telo)}`);
    } catch (e) {
      console.log(`    VYJIMKA: ${e instanceof Error ? e.message : String(e)}`);
    }

    await new Promise((r) => setTimeout(r, 1500)); // ohleduplne tempo
  }

  console.log("\n" + "=".repeat(70));
  console.log("Sonda dokoncena.");
}

main();
