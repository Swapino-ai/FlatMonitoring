import { krajNaSlug } from "@/lib/catalogs";
const pripady: [string, string][] = [
  ["Ústecký kraj", "ustecky-kraj"],
  ["Hlavní město Praha", "hlavni-mesto-praha"],
  ["Praha", "hlavni-mesto-praha"],
  ["Kraj Vysočina", "kraj-vysocina"],
  ["Vysočina", "kraj-vysocina"],
  ["Liberecký kraj", "liberecky-kraj"],
  ["Moravskoslezský kraj", "moravskoslezsky-kraj"],
  ["Slovensko", ""],
  ["", ""],
];
let chyb = 0;
for (const [vstup, cekano] of pripady) {
  const dostal = krajNaSlug(vstup);
  const ok = dostal === cekano;
  if (!ok) chyb++;
  console.log(`${ok ? "OK " : "CHYBA"} "${vstup}" -> "${dostal}" (čekáno "${cekano}")`);
}
console.log(chyb === 0 ? "vše v pořádku" : `${chyb} chyb`);
process.exit(chyb === 0 ? 0 : 1);
export {};
