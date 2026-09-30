/**
 * Test porovnani zaloh najemce se sluzbami. Ciste funkce, zadna sit ani databaze.
 */
import { popisPorovnani, porovnejProNemovitost, porovnejZalohy, type SluzbaVstup } from "../src/lib/zalohy";

const sl = (type: string, monthly: number, chargedToTenant: boolean, annual: number | null = null): SluzbaVstup =>
  ({ type, provider: "X", monthlyCost: monthly, annualCost: annual, chargedToTenant });

let chyb = 0;
function over(nazev: string, ok: boolean, detail = "") {
  if (!ok) chyb++;
  console.log(`${ok ? "OK   " : "CHYBA"} ${nazev}${detail ? ` — ${detail}` : ""}`);
}

const sluzby = [sl("WATER", 800, true), sl("HEATING", 2300, true), sl("INTERNET", 600, false), sl("SVJ_FEE", 1500, false)];

over("nic k porovnani → null", porovnejZalohy(0, [sl("INTERNET", 600, false)]) === null);

const a = porovnejZalohy(2500, sluzby)!;
over("2 500 proti 3 100 → nedoplaci", a.stav === "nedoplaci" && a.naklady === 3100 && a.rozdil === -600 && a.rozdilRocne === -7200,
  `${a.stav}, rozdil ${a.rozdil}`);
over("neprectene sluzby se nepocitaji (jen voda + teplo)", a.polozky.length === 2);

over("3 100 proti 3 100 → sedi", porovnejZalohy(3100, sluzby)!.stav === "sedi");
over("3 150 (v toleranci 155) → sedi", porovnejZalohy(3150, sluzby)!.stav === "sedi");
over("3 300 (mimo toleranci) → preplaci", porovnejZalohy(3300, sluzby)!.stav === "preplaci");
over("nulove zalohy a prectene sluzby → nedoplaci", porovnejZalohy(0, sluzby)!.stav === "nedoplaci");
over("zalohy bez oznacene sluzby → neoznaceno", porovnejZalohy(2500, [sl("WATER", 800, false)])!.stav === "neoznaceno");

// Tolerance je aspon 100 Kc i u male castky, jinak by 30 Kc rozdil u 200 Kc nakladu varoval
over("male naklady: rozdil 60 Kc u 200 Kc → sedi (tolerance 100)", porovnejZalohy(260, [sl("WASTE", 200, true)])!.stav === "sedi");

// Rocni platba se rozpocita na mesice
const r = porovnejZalohy(1000, [sl("INSURANCE", 0, true, 12000)])!;
over("rocni 12 000 = 1 000 mesicne → sedi", r.naklady === 1000 && r.stav === "sedi", `naklady ${r.naklady}`);

// Platna smlouva rozhoduje, drivejsi se nepocita
const najmy = [
  { tenantName: "Stary", utilitiesMonthly: 9999, isActive: false },
  { tenantName: "Novy", utilitiesMonthly: 3100, isActive: true },
];
const n = porovnejProNemovitost(najmy, sluzby)!;
over("pouzije se jen platna smlouva", n.stav === "sedi" && n.najemce === "Novy");
over("bez platne smlouvy → null", porovnejProNemovitost([{ tenantName: "S", utilitiesMonthly: 1, isActive: false }], sluzby) === null);

// Texty: kazdy stav ma vysvetleni, ktere obsahuje castky
const t = popisPorovnani(a);
over("popis nedoplatku nese castky", /2\s?500/.test(t.text) && /3\s?100/.test(t.text) && /600/.test(t.text) && t.tone === "warn", t.text);
over("popis shody je dobry", popisPorovnani(porovnejZalohy(3100, sluzby)!).tone === "good");

console.log(chyb === 0 ? "\nvše v pořádku" : `\n${chyb} chyb`);
process.exit(chyb === 0 ? 0 : 1);
export {};
