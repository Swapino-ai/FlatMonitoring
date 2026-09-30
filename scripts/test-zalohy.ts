/**
 * Test porovnani zaloh najemce se sluzbami. Ciste funkce, zadna sit ani databaze.
 */
import {
  casovaOsa, koncovaSerieNesouladu, popisPorovnani, porovnejProNemovitost, porovnejZalohy, type NajemVstup, type SluzbaVstup,
} from "../src/lib/zalohy";

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

// ---------------------------------------------------------------------------
// Cas
// ---------------------------------------------------------------------------
const dnes = new Date(2026, 2, 20); // 20. 3. 2026

const teplo = (zmeny: { od: string; kc: number }[]): SluzbaVstup => ({
  ...sl("HEATING", zmeny[zmeny.length - 1].kc, true),
  historie: zmeny.map((z) => ({ validFrom: z.od, monthlyCost: z.kc, annualCost: null })),
});
const voda = sl("WATER", 800, true);

// Teplo zdrazilo od 1. 10. 2025 z 2 300 na 2 800, zalohy se nezvysily (3 100)
const najem: NajemVstup = {
  tenantName: "Novak", utilitiesMonthly: 3100, isActive: true,
  startDate: "2024-01-01", endDate: null,
  historie: [{ validFrom: "2024-01-01", amount: 3100 }],
};
const sluzbyZdrazeni = [voda, teplo([{ od: "2024-01-01", kc: 2300 }, { od: "2025-10-01", kc: 2800 }])];

const osa = casovaOsa(najem, sluzbyZdrazeni, dnes)!;
const mesice = osa.roky.flatMap((r) => r.mesice);
const zari25 = mesice.find((m) => m.rok === 2025 && m.mesic === 9)!;
const rijen25 = mesice.find((m) => m.rok === 2025 && m.mesic === 10)!;
over("zari 2025 (pred zdrazenim) sedi", zari25.stav === "sedi" && zari25.naklady === 3100, `${zari25.stav} ${zari25.naklady}`);
over("rijen 2025 (po zdrazeni) nedoplaci o 500", rijen25.stav === "nedoplaci" && rijen25.rozdil === -500, `${rijen25.stav} ${rijen25.rozdil}`);
over("osa zacina lednem 2024 a konci breznem 2026", mesice[0].rok === 2024 && mesice[0].mesic === 1 && mesice[mesice.length - 1].rok === 2026 && mesice[mesice.length - 1].mesic === 3);

const r2025 = osa.roky.find((r) => r.rok === 2025)!;
over("rok 2025: 12 mesicu, nedoplatek jen za rijen-prosinec (3 x 500)", r2025.mesicu === 12 && r2025.rozdil === -1500, `rozdil ${r2025.rozdil}`);
const r2026 = osa.roky.find((r) => r.rok === 2026)!;
over("rok 2026: jen leden-brezen (15. brezna uz bylo)", r2026.mesicu === 3 && r2026.rozdil === -1500, `mesicu ${r2026.mesicu}`);

const serie = koncovaSerieNesouladu(osa)!;
over("nesoulad trva od 10/2025, 6 mesicu, celkem -3 000",
  serie.odKdy.rok === 2025 && serie.odKdy.mesic === 10 && serie.mesicu === 6 && serie.dosudRozdil === -3000,
  JSON.stringify(serie));

const pn = porovnejProNemovitost([najem], sluzbyZdrazeni, dnes)!;
over("dnesni porovnani nese odkdy", pn.stav === "nedoplaci" && pn.odKdy?.rok === 2025 && pn.mesicu === 6);
over("text rika odkdy a kolik to dosud stalo", /října 2025/.test(popisPorovnani(pn).text) && /3\s?000/.test(popisPorovnani(pn).text), popisPorovnani(pn).text);

// Zalohy zvyseny od 1. 11. 2025 na 3 600: nesoulad byl jen v rijnu, ted sedi
const najemZvyseno: NajemVstup = {
  ...najem,
  utilitiesMonthly: 3600,
  historie: [{ validFrom: "2024-01-01", amount: 3100 }, { validFrom: "2025-11-01", amount: 3600 }],
};
const osaZv = casovaOsa(najemZvyseno, sluzbyZdrazeni, dnes)!;
over("po zvyseni zaloh dnes sedi", koncovaSerieNesouladu(osaZv) === null);
over("porovnani dnes po zvyseni: sedi, bez varovani", porovnejProNemovitost([najemZvyseno], sluzbyZdrazeni, dnes)!.stav === "sedi");
const rijenZv = osaZv.roky.find((r) => r.rok === 2025)!.mesice.find((m) => m.mesic === 10)!;
over("historicky rijen 2025 zustava nedoplatkem (minulost se neprepisuje)", rijenZv.stav === "nedoplaci" && rijenZv.rozdil === -500);
over("vyuctovani 2025 nese jen ten jeden mesic", osaZv.roky.find((r) => r.rok === 2025)!.rozdil === -500);

// Pred prvnim zaznamem plati prvni hodnota: smlouva zacala 2023, nejstarsi cena je z 2024
const najem2023: NajemVstup = { ...najem, startDate: "2023-01-01", historie: [{ validFrom: "2023-01-01", amount: 3100 }] };
const osa2023 = casovaOsa(najem2023, sluzbyZdrazeni, dnes)!;
over("pred prvni znamou cenou plati prvni (2023 sedi)", osa2023.roky[0].rok === 2023 && osa2023.roky[0].mesice.every((m) => m.stav === "sedi" && m.naklady === 3100));

// Zmena platna od 20. dne se projevi az od dalsiho mesice (referencni je 15.)
const sluzbyUprostred = [voda, teplo([{ od: "2024-01-01", kc: 2300 }, { od: "2025-10-20", kc: 2800 }])];
const osaU = casovaOsa(najem, sluzbyUprostred, dnes)!;
const mU = osaU.roky.flatMap((r) => r.mesice);
over("zmena od 20. 10. se v rijnu jeste neprojevi", mU.find((m) => m.rok === 2025 && m.mesic === 10)!.stav === "sedi");
over("...ale v listopadu ano", mU.find((m) => m.rok === 2025 && m.mesic === 11)!.stav === "nedoplaci");

// Ukoncena smlouva: osa konci koncem smlouvy, ne dneskem
const ukoncena: NajemVstup = { ...najem, isActive: false, endDate: "2024-12-31", historie: [{ validFrom: "2024-01-01", amount: 3100 }] };
const osaK = casovaOsa(ukoncena, sluzbyZdrazeni, dnes)!;
const mK = osaK.roky.flatMap((r) => r.mesice);
over("ukoncena smlouva: posledni mesic je 12/2024", mK[mK.length - 1].rok === 2024 && mK[mK.length - 1].mesic === 12 && osaK.jeAktivni === false);
over("ukoncena smlouva nema nedoplatek (v dobe smlouvy vse sedelo)", osaK.celkemRozdil === 0);

// Smlouva, ktera jeste nezacala
over("smlouva v budoucnu → zadna osa", casovaOsa({ ...najem, startDate: "2027-01-01" }, sluzbyZdrazeni, dnes) === null);

console.log(chyb === 0 ? "\nvše v pořádku" : `\n${chyb} chyb`);
process.exit(chyb === 0 ? 0 : 1);
export {};
