/**
 * Ktery tvar adresy Nahlizeni do KN otevre konkretni stavbu.
 *
 * Katastralni API dava vnitrni id stavby (napr. 176431403). Kdyz Nahlizeni
 * pouziva stejna id, da se z aplikace odkazovat primo na objekt misto na
 * hledani. Zkousi se nekolik tvaru; rozhoduje, co vrati stranku s obsahem
 * a ne chybu. Sonda nic nemeni, jen cte verejne stranky bez prihlaseni.
 */

// Stavba z Abertam, kterou vratila predchozi sonda — verejny udaj
const STAVBA = 176431403;
const KU = 600016;

const adresy = [
  `https://nahlizenidokn.cuzk.gov.cz/ZobrazObjekt.aspx?typ=Stavba&id=${STAVBA}`,
  `https://nahlizenidokn.cuzk.gov.cz/ZobrazObjekt.aspx?encrypted=&typ=Stavba&id=${STAVBA}`,
  `https://nahlizenidokn.cuzk.gov.cz/VyberBudovu/Stavba/Informace/${STAVBA}`,
  `https://nahlizenidokn.cuzk.gov.cz/VyberBudovu.aspx?typ=Stavba&ku=${KU}`,
  `https://nahlizenidokn.cuzk.gov.cz/VyberBudovu.aspx`,
  `https://nahlizenidokn.cuzk.gov.cz/`,
];

function text(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  for (const url of adresy) {
    try {
      const r = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html" },
        redirect: "follow",
      });
      const telo = await r.text();
      console.log(`\n[${r.status}] ${url}`);
      console.log(`  koncová adresa: ${r.url}`);
      console.log(`  ${text(telo).slice(0, 500)}`);
    } catch (e) {
      console.log(`\n[chyba] ${url}: ${(e as Error).message}`);
    }
  }
}

main();

export {};
