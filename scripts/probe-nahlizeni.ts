/**
 * Detailni stranka jednotky a stavby v Nahlizeni.
 *
 * Predchozi sonda zkousela ?id= na strance InformaceO — to je ale stranka
 * *vyhledavaci*, proto vracela formular. Detail se bude jmenovat jinak
 * (InformaceOJednotce apod.). Spravnou odpoved pozname podle toho, ze stranka
 * nese udaje objektu: Abertamy, cislo domovni 437, LV 712.
 */

const STAVBA = 176431403;
const JEDNOTKA = 222360403;

const HLAVICKY = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "cs-CZ,cs;q=0.9",
};

const ZAKLAD = "https://nahlizenidokn.cuzk.gov.cz";

const adresy: { url: string; popis: string }[] = [];

// Jednotka uz je overena: ZobrazObjekt.aspx?typ=jednotka&id=… vrati detail.
// Zbyva slovo pro stavbu — "stavba" vraci "Spatna identifikace objektu".
for (const typ of ["budova", "stavba", "objekt", "bud", "st"]) {
  adresy.push({
    url: `${ZAKLAD}/ZobrazObjekt.aspx?typ=${typ}&id=${STAVBA}`,
    popis: `stavba, typ=${typ}`,
  });
}
adresy.push({
  url: `${ZAKLAD}/ZobrazObjekt.aspx?typ=jednotka&id=${JEDNOTKA}`,
  popis: "jednotka (kontrola)",
});

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
  for (const { url, popis } of adresy) {
    try {
      const r = await fetch(url, { headers: HLAVICKY, redirect: "follow" });
      const cisty = text(await r.text());
      const maUdaje = /Abertamy/i.test(cisty) && (/437/.test(cisty) || /712/.test(cisty));
      const formular = /Vyhled[aá]n[ií]/i.test(cisty);

      console.log(`\n[${r.status}] ${maUdaje ? "*** DETAIL OBJEKTU ***" : formular ? "formulář" : "jiné"} — ${popis}`);
      console.log(`  ${url}`);
      if (maUdaje || !formular) console.log(`  ${cisty.slice(0, 600)}`);
    } catch (e) {
      console.log(`\n[chyba] ${url}: ${(e as Error).message}`);
    }
  }
}

main();

export {};
