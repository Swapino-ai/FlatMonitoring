/**
 * Sonda REST API katastru nemovitostí (api-kn.cuzk.gov.cz).
 *
 * Dokumentaci ze sandboxu precist nejde — vystup na cuzk.gov.cz je zablokovany.
 * Proto se API oslovi odsud, z Actions, a sonda vypise, co opravdu vraci:
 * nejprv popis sluzby, pak jmeno hlavicky, kterou uzna klic, a nakonec jeden
 * skutecny dotaz. Nic nemeni, jen cte.
 */

const KLIC = process.env.KATASTR_API_KEY ?? "";
const ZAKLAD = "https://api-kn.cuzk.gov.cz";

function zkratka(s: string, n = 600) {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

async function zkus(cesta: string, hlavicky: Record<string, string> = {}) {
  const url = cesta.startsWith("http") ? cesta : ZAKLAD + cesta;
  try {
    const r = await fetch(url, { headers: { Accept: "application/json", ...hlavicky } });
    const typ = r.headers.get("content-type") ?? "?";
    const telo = await r.text();
    return { url, status: r.status, typ, telo };
  } catch (e) {
    return { url, status: 0, typ: "-", telo: `spojení selhalo: ${(e as Error).message}` };
  }
}

/** Ze stranky udela cisty text, at je v logu videt, co je na ni napsano. */
function text(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** Vypise endpointy z OpenAPI specifikace. */
function vypisSpecifikaci(telo: string): boolean {
  try {
    const j = JSON.parse(telo) as { paths?: Record<string, Record<string, unknown>> };
    if (!j.paths) return false;
    console.log("  SPECIFIKACE, endpointy:");
    for (const [cesta, metody] of Object.entries(j.paths)) {
      console.log(`    ${Object.keys(metody).join(",").toUpperCase()} ${cesta}`);
    }
    return true;
  } catch {
    return false;
  }
}

/** Popis sluzby a hledani strojove citelne specifikace. */
async function krok1() {
  console.log("\n=== 1. Popis služby a specifikace ===");
  const cesty = [
    "/", "/Popis",
    "/swagger/v1/swagger.json", "/swagger/index.html", "/openapi.json",
    "/api/swagger.json", "/v1/openapi.json", "/api-docs",
  ];

  for (const c of cesty) {
    const v = await zkus(c);
    console.log(`\n[${v.status}] ${v.url}  (${v.typ})`);

    if (v.telo.startsWith("{") && vypisSpecifikaci(v.telo)) continue;
    console.log(`  ${zkratka(text(v.telo), c === "/Popis" ? 4000 : 500)}`);
  }

  // Swagger UI si adresu specifikace bere z initializeru — odtud se dozvime,
  // kde specifikace opravdu lezi
  console.log("\n--- adresa specifikace ze Swagger UI ---");
  const init = await zkus("/swagger/swagger-initializer.js");
  console.log(`[${init.status}] ${init.url}`);
  console.log(`  ${zkratka(init.telo, 800)}`);

  for (const m of init.telo.matchAll(/["']([^"']*\.(?:json|yaml|yml))["']/g)) {
    const adresa = m[1].startsWith("http") ? m[1] : new URL(m[1], `${ZAKLAD}/swagger/`).toString();
    const spec = await zkus(adresa);
    console.log(`\n[${spec.status}] ${spec.url}`);
    if (!vypisSpecifikaci(spec.telo)) console.log(`  ${zkratka(spec.telo, 600)}`);
  }
}

/** Ktera hlavicka klic uzna. Bez toho je vse ostatni hadani. */
async function krok2(): Promise<Record<string, string> | null> {
  console.log("\n=== 2. Jméno hlavičky pro klíč ===");
  if (!KLIC) {
    console.log("KATASTR_API_KEY není nastavený — krok 2 a 3 se přeskočí.");
    return null;
  }
  console.log(`Klíč je nastavený, délka ${KLIC.length} znaků (hodnota se nevypisuje).`);

  const varianty: Record<string, string>[] = [
    { ApiKey: KLIC },
    { "Api-Key": KLIC },
    { "X-Api-Key": KLIC },
    { apikey: KLIC },
    { Authorization: `ApiKey ${KLIC}` },
    { Authorization: `Bearer ${KLIC}` },
  ];

  // Ciselnik kraju je nejnevinnejsi dotaz, jaky takove API muze mit
  const testovaci = ["/api/v1/ciselniky/kraje", "/api/v1/kraje", "/ciselniky/kraje", "/api/ciselniky/kraje"];

  for (const h of varianty) {
    for (const c of testovaci) {
      const v = await zkus(c, h);
      const jmeno = Object.keys(h)[0];
      console.log(`[${v.status}] ${jmeno} → ${c}  ${zkratka(v.telo, 200)}`);
      if (v.status === 200) {
        console.log(`  FUNGUJE: hlavička ${jmeno}, endpoint ${c}`);
        return h;
      }
    }
  }
  console.log("Žádná kombinace hlavičky a adresy neprošla — viz kroky výše ve výpisu.");
  return null;
}

/** Skutecny dotaz na nemovitost, kdyz uz vime, jak se autentizovat. */
async function krok3(hlavicky: Record<string, string>) {
  console.log("\n=== 3. Dotaz na konkrétní údaje ===");
  const cesty = [
    "/api/v1/ciselniky/katastralniUzemi?nazev=Nov%C3%BD%20Bor",
    "/api/v1/katastralniUzemi?nazev=Nov%C3%BD%20Bor",
    "/api/v1/jednotky?katastralniUzemi=707333&cisloDomovni=1",
    "/api/v1/stavby?katastralniUzemi=707333",
    "/api/v1/parcely?katastralniUzemi=707333&parcelniCislo=1",
  ];
  for (const c of cesty) {
    const v = await zkus(c, hlavicky);
    console.log(`\n[${v.status}] ${v.url}`);
    console.log(`  ${zkratka(v.telo, 1500)}`);
  }
}

async function main() {
  await krok1();
  const hlavicky = await krok2();
  if (hlavicky) await krok3(hlavicky);
  console.log("\nHotovo. Sonda nic nemění, jen čte.");
}

main();

export {};
