import { zkontrolujUcet } from "../src/lib/ucet";
let chyb = 0;
const over = (n: string, ok: boolean) => { if (!ok) { chyb++; console.error("CHYBA:", n); } };
const r = (s: string) => zkontrolujUcet(s);
over("prazdne", r("").ok && r("  ").ok);
// Verejne znamy testovaci ucet: 19-2000145399/0800 (Ceska sporitelna)
over("s predcislim", (r("19-2000145399/0800") as any).hodnota === "19-2000145399/0800");
over("mezery", r(" 19 - 2000145399 / 0800 ").ok);
over("preklep v cisle", !r("19-2000145398/0800").ok);
over("preklep v predcisli", !r("18-2000145399/0800").ok);
over("bez banky", !r("2000145399").ok);
over("kratky kod banky", !r("2000145399/800").ok);
over("nuly", !r("0000000000/0800").ok);
// IBAN: CZ65 0800 0000 1920 0014 5399
over("iban ok", (r("CZ65 0800 0000 1920 0014 5399") as any).hodnota === "CZ6508000000192000145399");
over("iban chybny soucet", !r("CZ66 0800 0000 1920 0014 5399").ok);
over("cizi iban", !r("DE89370400440532013000").ok);
console.log(chyb ? `${chyb} chyb` : "vše v pořádku");
process.exit(chyb ? 1 : 0);
