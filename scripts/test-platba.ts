import { naIban } from "../src/lib/ucet";
import { spayd } from "../src/lib/platba";
let chyb = 0;
const over = (n: string, ok: boolean, d?: unknown) => { if (!ok) { chyb++; console.error("CHYBA:", n, d ?? ""); } };

// Znamy par: 19-2000145399/0800 <-> CZ65 0800 0000 1920 0014 5399
over("iban z uctu s predcislim", naIban("19-2000145399/0800") === "CZ6508000000192000145399", naIban("19-2000145399/0800"));
over("iban z hotoveho", naIban("CZ65 0800 0000 1920 0014 5399") === "CZ6508000000192000145399");
over("neplatny ucet", naIban("124/0800") === null);
over("prazdny", naIban("") === null);
// Ucet bez predcisli: 2000145399/0800 neni platny modulo 11 sam o sobe? (test jen ze nespadne)
over("bez predcisli nespadne", (() => { naIban("2000145399/0800"); return true; })());

const q = spayd({ ucet: "19-2000145399/0800", castka: 1234.5, vs: "20260001", zprava: "Vyúčtování služeb 2025" });
over("spayd tvar", q === "SPD*1.0*ACC:CZ6508000000192000145399*AM:1234.50*CC:CZK*X-VS:20260001*MSG:Vyuctovani sluzeb 2025", q);
over("nulova castka", spayd({ ucet: "19-2000145399/0800", castka: 0 }) === null);
over("zly ucet", spayd({ ucet: "x", castka: 100 }) === null);
over("hvezdicka ve zprave", !spayd({ ucet: "19-2000145399/0800", castka: 1, zprava: "a*b" })!.includes("MSG:a*b"));
over("spatny vs se vynecha", !spayd({ ucet: "19-2000145399/0800", castka: 1, vs: "abc" })!.includes("X-VS"));
console.log(chyb ? `${chyb} chyb` : "vše v pořádku");
process.exit(chyb ? 1 : 0);
