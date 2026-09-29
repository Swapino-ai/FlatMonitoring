/**
 * Jak se v Nahlizeni odkazuje primo na jednotku nebo stavbu.
 *
 * Zjisteno: cesty /VyberBudovu/Stavba/InformaceO a /VyberBudovu/Jednotka/InformaceO
 * existuji, ale s ?id= vrati vyhledavaci formular — parametr se jmenuje jinak.
 * Identifikator jako dalsi segment cesty konci 404.
 *
 * Sonda zkousi matici nazvu parametru. Spravnou odpoved pozname podle toho, ze
 * stranka obsahuje udaje objektu (Abertamy, 437, LV 712), ne jen formular.
 */

const STAVBA = 176431403;
const JEDNOTKA = 222360403;

const HLAVICKY = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "cs-CZ,cs;q=0.9",
};

const parametry = ["id", "ID", "Id", "idJednotky", "jednotkaId", "kod", "idObjektu", "objektId", "idStavby", "stavbaId"];
const akce = ["InformaceO", "Informace", "Detail", "Zobrazit"];

function text(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Stranka s udaji nese obec a cislo domovni; formular jen popisky poli. */
function maUdaje(cisty: string) {
  return /Abertamy/i.test(cisty) && (/437/.test(cisty) || /712/.test(cisty));
}

async function zkus(url: string) {
  try {
    const r = await fetch(url, { headers: HLAVICKY, redirect: "follow" });
    const cisty = text(await r.text());
    const nalez = maUdaje(cisty);
    if (nalez || (r.status !== 404 && !/Vyhled[aá]n[ií]/i.test(cisty))) {
      console.log(`\n[${r.status}] ${nalez ? "*** ÚDAJE OBJEKTU ***" : "jiná odpověď"} ${url}`);
      console.log(`  ${cisty.slice(0, 400)}`);
    } else {
      console.log(`[${r.status}] ${/Vyhled/i.test(cisty) ? "formulář" : "404"}  ${url}`);
    }
  } catch (e) {
    console.log(`[chyba] ${url}: ${(e as Error).message}`);
  }
}

async function main() {
  const zaklad = "https://nahlizenidokn.cuzk.gov.cz";

  console.log("=== Jednotka: názvy parametru ===");
  for (const p of parametry) await zkus(`${zaklad}/VyberBudovu/Jednotka/InformaceO?${p}=${JEDNOTKA}`);

  console.log("\n=== Stavba: názvy parametru ===");
  for (const p of parametry) await zkus(`${zaklad}/VyberBudovu/Stavba/InformaceO?${p}=${STAVBA}`);

  console.log("\n=== Jiné názvy akce ===");
  for (const a of akce) await zkus(`${zaklad}/VyberBudovu/Jednotka/${a}?id=${JEDNOTKA}`);

  // Odkazy primo ze stranky s vypisem jednotek v dome by prozradily spravny tvar
  console.log("\n=== Odkazy na stránce vyhledání jednotky ===");
  try {
    const r = await fetch(`${zaklad}/VyberBudovu/Jednotka/InformaceO`, { headers: HLAVICKY });
    const html = await r.text();
    const odkazy = new Set<string>();
    for (const m of html.matchAll(/href="([^"]*(?:Informace|Jednotka|Stavba)[^"]*)"/gi)) odkazy.add(m[1]);
    for (const o of odkazy) console.log(`  ${o}`);
  } catch (e) {
    console.log(`  chyba: ${(e as Error).message}`);
  }
}

main();

export {};
