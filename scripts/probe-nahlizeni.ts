/**
 * Posledni otazka k odkazu do Nahlizeni: jak vypada vyhledavaci formular.
 *
 * Deset nazvu parametru s ?…= vratilo jen formular a identifikator v ceste
 * konci 404 — primy odkaz pres id tedy neexistuje. Zbyva zjistit, jestli
 * formular odesila GET (pak jde odkaz slozit z jeho poli) nebo POST
 * s ochranou proti CSRF (pak z cizi stranky odkazovat nejde).
 */

const HLAVICKY = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "cs-CZ,cs;q=0.9",
};

async function rozeberFormular(url: string) {
  const r = await fetch(url, { headers: HLAVICKY });
  const html = await r.text();
  console.log(`\n=== ${url} [${r.status}] ===`);

  for (const f of html.matchAll(/<form[^>]*>/gi)) {
    console.log(`  FORM: ${f[0]}`);
  }
  for (const i of html.matchAll(/<(input|select)[^>]*>/gi)) {
    const tag = i[0];
    const jmeno = tag.match(/name="([^"]+)"/i)?.[1];
    const typ = tag.match(/type="([^"]+)"/i)?.[1] ?? "select";
    if (jmeno) console.log(`    ${typ}: ${jmeno}`);
  }
}

async function main() {
  await rozeberFormular("https://nahlizenidokn.cuzk.gov.cz/VyberBudovu/Jednotka/InformaceO");
  await rozeberFormular("https://nahlizenidokn.cuzk.gov.cz/VyberBudovu/Stavba/InformaceO");
}

main();

export {};
