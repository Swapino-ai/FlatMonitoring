/**
 * Kontrola rozsirovani okruhu.
 *
 * Pravidlo je zamerne jednoduche a predvidatelne: ber nejuzsi okruh, ve kterem
 * uz je cilovy pocet nabidek. Dusledek je, ze kvuli jedne chybejici nabidce
 * muze skocit o stupen vys — to je prijatelnejsi nez chytre vyjimky, kterym
 * pak nikdo nerozumi.
 */
import { okruhyProTyp } from "../src/lib/geo";

function vyber(vzdalenosti: number[], typ: string, cil: number) {
  const kroky = okruhyProTyp(typ);
  let vybrane: number[] = vzdalenosti;
  for (const okruh of kroky) {
    const v = vzdalenosti.filter((d) => d <= okruh);
    vybrane = v;
    if (v.length >= cil) break;
  }
  // Hlasi se nejuzsi okruh, ktery vybrane nabidky opravdu obsahuje — jinak
  // by se u rídkého trhu tvrdilo "rozšířeno na 50 km", i kdyz vsechny lezi bliz
  const nejdal = vybrane.reduce((m, d) => Math.max(m, d), 0);
  const pouzity = kroky.find((k) => k >= nejdal) ?? kroky[kroky.length - 1];
  return { pouzity, pocet: vybrane.length };
}

const PRIPADY: { popis: string; typ: string; vzdalenosti: number[]; cil: number; okruh: number; pocet: number }[] = [
  { popis: "hustý trh — nerozšiřuje se", typ: "BYT", cil: 8,
    vzdalenosti: [0.5, 1, 1.2, 2, 2.5, 2.8, 2.9, 1.1, 0.3, 2.2], okruh: 3, pocet: 10 },
  { popis: "blízko sedm, cíl osm — jde o stupeň dál", typ: "BYT", cil: 8,
    vzdalenosti: [1, 2, 7, 8, 9, 10, 11, 20, 21], okruh: 24, pocet: 9 },
  { popis: "blízko osm — zůstane u dvanácti", typ: "BYT", cil: 8,
    vzdalenosti: [1, 2, 7, 8, 9, 10, 11, 11.5, 20], okruh: 12, pocet: 8 },
  { popis: "skoro nic — okruh podle nejvzdálenější nabídky", typ: "GARAZ", cil: 8,
    vzdalenosti: [3, 45], okruh: 50, pocet: 2 },
  { popis: "dvě blízké nabídky — nehlásit strop", typ: "BYT", cil: 8,
    vzdalenosti: [1, 2.5], okruh: 3, pocet: 2 },
  { popis: "nic v dosahu", typ: "BYT", cil: 8, vzdalenosti: [], okruh: 3, pocet: 0 },
];

let chyb = 0;
for (const p of PRIPADY) {
  const r = vyber(p.vzdalenosti, p.typ, p.cil);
  const ok = r.pouzity === p.okruh && r.pocet === p.pocet;
  if (!ok) chyb++;
  console.log(`  ${ok ? "OK " : "!! "} ${p.popis}`);
  console.log(`       okruh ${r.pouzity} km, ${r.pocet} nabídek${ok ? "" : ` — čekáno ${p.okruh} km / ${p.pocet}`}`);
}

console.log(chyb === 0 ? "\nRozšiřování okruhu funguje." : `\n${chyb} případů neprošlo.`);
process.exitCode = chyb === 0 ? 0 : 1;
