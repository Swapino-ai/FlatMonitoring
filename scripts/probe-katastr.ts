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

  // Popis odkazuje na "Podrobnou specifikaci API ve standardu OpenAPI" —
  // ten odkaz je to, co potrebujeme
  console.log("\n--- odkazy ze stránky Popis ---");
  const popis = await zkus("/Popis");
  const odkazy = new Set<string>();
  for (const m of popis.telo.matchAll(/href="([^"]+)"/g)) {
    if (/\.(css|js|png|ico|svg|woff2?)/.test(m[1])) continue;
    odkazy.add(m[1]);
  }
  for (const o of odkazy) console.log(`  ${o}`);

  // Specifikace muze byt za kterymkoli z nich
  for (const o of odkazy) {
    if (!/spec|openapi|swagger|json|yaml/i.test(o)) continue;
    const adresa = o.startsWith("http") ? o : new URL(o, `${ZAKLAD}/`).toString();
    const spec = await zkus(adresa);
    console.log(`\n[${spec.status}] ${spec.url}  (${spec.typ})`);
    if (!vypisSpecifikaci(spec.telo)) console.log(`  ${zkratka(text(spec.telo), 2500)}`);
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

/**
 * Ktera hlavicka a ktery zaklad cesty klic uzna.
 *
 * Endpointy ze stranky Popis (/AplikacniSluzby/StavUctu) vraci HTML stranku
 * "Chyba 404" — tedy web aplikace, ne API. Cesty v dokumentaci jsou zrejme
 * relativni k nejakemu zakladu, ktery v popisu uveden neni. Hleda se tedy
 * kombinace zakladu a hlavicky; rozliseni je snadne, protoze web vraci HTML
 * a API ma vracet JSON.
 */
async function krok2(): Promise<{ hlavicky: Record<string, string>; zaklad: string } | null> {
  console.log("\n=== 2. Základ cesty a jméno hlavičky ===");
  if (!KLIC) {
    console.log("KATASTR_API_KEY není nastavený — krok 2 a 3 se přeskočí.");
    return null;
  }
  console.log(`Klíč je nastavený, délka ${KLIC.length} znaků (hodnota se nevypisuje).`);

  const zaklady = ["", "/api", "/api/v1", "/api/v1.0", "/v1", "/rest", "/rest/v1", "/kn", "/api/kn", "/sluzby"];
  const varianty: Record<string, string>[] = [
    { ApiKey: KLIC }, { "X-Api-Key": KLIC }, { Authorization: `ApiKey ${KLIC}` },
  ];

  for (const zaklad of zaklady) {
    for (const h of varianty) {
      const jmeno = Object.keys(h)[0];
      const v = await zkus(`${zaklad}/AplikacniSluzby/StavUctu`, h);
      const jsonovy = v.typ.includes("json");
      // HTML znamena, ze odpovida web, ne API — takovy zaklad nema cenu
      const znacka = jsonovy ? "JSON" : "html";
      console.log(`[${v.status}] ${znacka} ${jmeno} → ${zaklad || "/"}  ${zkratka(jsonovy ? v.telo : text(v.telo), 200)}`);

      if (jsonovy) {
        console.log(`  ODPOVÍDÁ API: základ "${zaklad}", hlavička ${jmeno}, HTTP ${v.status}`);
        if (v.status === 200) return { hlavicky: h, zaklad };
      }
    }
  }
  console.log("Žádná kombinace nevrátila JSON — API je jinde, než popis naznačuje.");
  return null;
}

/**
 * Zaklad cesty je /api/v1 a klic prosel. Zbyva zjistit, jak se jmenuji
 * endpointy pro vyhledani jednotky, stavby a parcely — v popisu jsou uvedeny
 * ve tvaru, ktery vraci 404.
 */
async function krok3(hlavicky: Record<string, string>, zaklad: string) {
  console.log("\n=== 3. Specifikace pod zakladem ===");
  for (const c of ["/swagger.json", "/openapi.json", "/swagger/v1/swagger.json", "", "/Popis"]) {
    const v = await zkus(zaklad + c, hlavicky);
    console.log(`\n[${v.status}] ${v.url}  (${v.typ})`);
    if (v.telo.startsWith("{") && vypisSpecifikaci(v.telo)) continue;
    console.log(`  ${zkratka(v.typ.includes("json") ? v.telo : text(v.telo), 800)}`);
  }

  console.log("\n=== 4. Jména endpointů pro nemovitosti ===");
  // Prusinovice (588903) maji katastralni uzemi 733814; cislo domovni 1 tam
  // urcite existuje. Jde o tvar adresy, ne o konkretni vysledek.
  const cesty = [
    "/Jednotky/Vyhledani", "/Jednotka", "/Jednotky",
    "/Stavby/Vyhledani", "/Stavba", "/Stavby",
    "/Parcely/Vyhledani", "/Parcela", "/Parcely",
    "/Ucastnici", "/Vlastnici", "/Rizeni",
    "/CiselnikyIskn", "/CiselnikyUzemnichJednotek",
  ];
  for (const c of cesty) {
    const v = await zkus(zaklad + c, hlavicky);
    const jsonovy = v.typ.includes("json");
    console.log(`[${v.status}] ${jsonovy ? "JSON" : "html"} ${c}  ${jsonovy ? zkratka(v.telo, 500) : ""}`);
  }
}

async function main() {
  await krok1();
  const nalez = await krok2();
  if (nalez) await krok3(nalez.hlavicky, nalez.zaklad);
  console.log("\nHotovo. Sonda nic nemění, jen čte.");
}

main();

export {};
