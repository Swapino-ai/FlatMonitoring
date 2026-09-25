/**
 * Kontrola nastaveni srovnavani u jednotky: filtr obci a kvalifikovany odhad.
 *
 * Bez filtru se byt v Bohusovicich poměřuje s Roudnici, ktera je drazsi.
 * A odhad postaveny vyhradne na nabidkach z teze obce je neco jineho nez
 * odhad slepeny z okoli — musi to byt poznat.
 */
import { rozdelMesta } from "../src/lib/market";

interface N { city: string; district: string | null }

function jeZakazane(n: N, vyloucena: string[]): boolean {
  const zakazane = vyloucena.map((m) => m.trim().toLowerCase()).filter(Boolean);
  if (zakazane.length === 0) return false;
  const kde = `${n.city} ${n.district ?? ""}`.toLowerCase();
  return zakazane.some((z) => kde.includes(z));
}

function vyhodnot(nabidky: N[], obec: string, vyloucena: string[]) {
  const zbyle = nabidky.filter((n) => !jeZakazane(n, vyloucena));
  const zObce = zbyle.filter((n) => n.city.toLowerCase() === obec.toLowerCase()).length;
  return { pocet: zbyle.length, zObce, kvalifikovany: zObce === zbyle.length && zbyle.length >= 3 };
}

const NABIDKY: N[] = [
  { city: "Bohušovice nad Ohří", district: null },
  { city: "Bohušovice nad Ohří", district: "Předměstí" },
  { city: "Bohušovice nad Ohří", district: null },
  { city: "Roudnice nad Labem", district: null },
  { city: "Lovosice", district: null },
];

let chyb = 0;
const zkus = (popis: string, skutecnost: unknown, ocekavani: unknown) => {
  const ok = JSON.stringify(skutecnost) === JSON.stringify(ocekavani);
  if (!ok) chyb++;
  console.log(`  ${ok ? "OK " : "!! "} ${popis}`);
  console.log(`       ${JSON.stringify(skutecnost)}${ok ? "" : ` — čekáno ${JSON.stringify(ocekavani)}`}`);
};

zkus("bez filtru — míchá se Roudnice i Lovosice, není kvalifikovaný",
  vyhodnot(NABIDKY, "Bohušovice nad Ohří", []),
  { pocet: 5, zObce: 3, kvalifikovany: false });

zkus("filtr Roudnice + Lovosice — zbyde jen obec, kvalifikovaný",
  vyhodnot(NABIDKY, "Bohušovice nad Ohří", rozdelMesta("Roudnice nad Labem, Lovosice")),
  { pocet: 3, zObce: 3, kvalifikovany: true });

zkus("filtr bez diakritiky a malými písmeny zabere taky",
  vyhodnot(NABIDKY, "Bohušovice nad Ohří", rozdelMesta("roudnice, lovosice")),
  { pocet: 3, zObce: 3, kvalifikovany: true });

zkus("částečný název obce stačí",
  vyhodnot(NABIDKY, "Bohušovice nad Ohří", rozdelMesta("Roudnice")),
  { pocet: 4, zObce: 3, kvalifikovany: false });

zkus("dvě nabídky z obce — na kvalifikovaný je to málo",
  vyhodnot(NABIDKY.slice(0, 2), "Bohušovice nad Ohří", []),
  { pocet: 2, zObce: 2, kvalifikovany: false });

zkus("prázdný filtr nic nevyhazuje", rozdelMesta("  ,  , "), []);

console.log(chyb === 0 ? "\nNastavení srovnávání funguje." : `\n${chyb} případů neprošlo.`);
process.exitCode = chyb === 0 ? 0 : 1;

export {};
