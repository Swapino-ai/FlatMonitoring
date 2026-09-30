/**
 * Posledni pokus o primy odkaz na stavbu v Nahlizeni.
 *
 * Jednotka funguje: ZobrazObjekt.aspx?typ=jednotka&id=… Pro stavbu vsak pet
 * zkousenych slov vratilo "Spatna identifikace objektu" a odkaz, ktery da
 * aplikace uzivateli, ma podobu ?encrypted=… (neprehledny token).
 *
 * Zbyva overit, jestli nejde o jine slovo pro typ — zkousi se dalsi varianty
 * vcetne velkych pismen a pro kontrolu i parcela, u ktere zname id.
 */

const STAVBA = 176431403;
const PARCELA = 707199403;
const JEDNOTKA = 222360403;

const HLAVICKY = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "cs-CZ,cs;q=0.9",
};

const ZAKLAD = "https://nahlizenidokn.cuzk.gov.cz/ZobrazObjekt.aspx";

const pokusy: { url: string; popis: string }[] = [];
for (const typ of ["Budova", "BUDOVA", "budovy", "stavebniObjekt", "castStavby", "dum"]) {
  pokusy.push({ url: `${ZAKLAD}?typ=${typ}&id=${STAVBA}`, popis: `stavba, typ=${typ}` });
}
pokusy.push(
  { url: `${ZAKLAD}?typ=parcela&id=${PARCELA}`, popis: "parcela (ověření vzoru)" },
  { url: `${ZAKLAD}?typ=jednotka&id=${JEDNOTKA}`, popis: "jednotka (kontrola)" },
);

function text(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  for (const { url, popis } of pokusy) {
    try {
      const r = await fetch(url, { headers: HLAVICKY });
      const cisty = text(await r.text());
      const spatne = /Špatná identifikace|Spatna identifikace/i.test(cisty);
      const udaje = /Abertamy/i.test(cisty);
      console.log(`\n[${r.status}] ${spatne ? "špatná identifikace" : udaje ? "*** DETAIL ***" : "jiné"} — ${popis}`);
      if (!spatne) console.log(`  ${cisty.slice(0, 350)}`);
    } catch (e) {
      console.log(`[chyba] ${popis}: ${(e as Error).message}`);
    }
  }
}

main();

export {};
