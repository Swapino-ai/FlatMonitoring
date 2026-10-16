import { mesiceMezi, navrhniPlatby, prehledPlateb, type NajemPlatba, type SluzbaPlatba } from "../src/lib/pravidelnePlatby";
let chyb = 0;
const over = (n: string, ok: boolean, d?: unknown) => { if (!ok) { chyb++; console.error("CHYBA:", n, d ?? ""); } };

over("mesice", JSON.stringify(mesiceMezi("2025-11-20", "2026-02-03")) === '["2025-11","2025-12","2026-01","2026-02"]');

const A: NajemPlatba = { id: "A", nazev: "Novák", od: "2026-01-01", do: null, utilitiesMonthly: 3000, rentMonthly: 10000, paymentDay: 15 };
const sl: SluzbaPlatba = { id: "s1", type: "WATER", provider: "Vodárna", nazevDruhu: "Vodné", monthlyCost: 800, annualCost: null, chargedToTenant: true, contractStart: "2026-02-01" };

const p = navrhniPlatby({ najmy: [A], sluzby: [sl], pohyby: [], dnes: "2026-03-20" });
const nej = p.filter((x) => x.druh === "NAJEM");
over("najem leden-brezen", nej.length === 3 && nej.every((x) => x.castka === 10000 && x.castka > 0), nej.map((x) => x.mesic));
over("den platby", nej[0].datum === "2026-01-15");
over("zalohy 3 mesice", p.filter((x) => x.druh === "ZALOHA").length === 3 && p.filter((x) => x.druh === "ZALOHA").every((x) => x.castka === 3000));
const s = p.filter((x) => x.druh === "SLUZBA");
over("sluzba od unora, zaporna", s.length === 2 && s.every((x) => x.castka === -800) && s[0].mesic === "2026-02", s.map((x) => x.mesic));
over("kategorie sluzby", s[0].kategorie === "UTILITIES");
over("vse nezaplaceno", p.every((x) => x.stav === "nezaplaceno" && !x.zaplaceno));

// Budouci platba se nenavrhuje: splatnost 15., dnes 10.
over("budouci mimo", navrhniPlatby({ najmy: [A], sluzby: [], pohyby: [], dnes: "2026-03-10" }).filter((x) => x.druh === "NAJEM").length === 2);

// Zaplacene (zaznam z prehledu) se poznaji a nesmazou se z navrhu
const zapl = navrhniPlatby({ najmy: [A], sluzby: [sl], pohyby: [], zaplaceno: [{ klic: "najem:A:2026-01", datum: "2026-01-16", castka: 10000 }], dnes: "2026-03-20" });
const jan = zapl.find((x) => x.klic === "najem:A:2026-01")!;
over("zaplaceno", jan.stav === "zaplaceno" && jan.zaplaceno?.datum === "2026-01-16" && jan.zaplaceno.zdroj === "EVIDENCE");
over("ostatni nezaplaceno", zapl.find((x) => x.klic === "najem:A:2026-02")?.stav === "nezaplaceno");
// Starsi platba zauctovana jako pohyb se bere jako zaplacena (jen ke cteni)
const legacy = navrhniPlatby({ najmy: [A], sluzby: [], pohyby: [{ date: "2026-02-15", category: "RENT", sourceKey: "najem:A:2026-02", amount: 10000 }], dnes: "2026-03-20" });
over("pohyb jako zaplaceno", legacy.find((x) => x.klic === "najem:A:2026-02")?.zaplaceno?.zdroj === "POHYB");

// Castecny mesic: nastup 21.1. = 11 z 31 dni
const B: NajemPlatba = { ...A, id: "B", od: "2026-01-21", utilitiesMonthly: 3100 };
const pb = navrhniPlatby({ najmy: [B], sluzby: [], pohyby: [], dnes: "2026-01-31" });
const n1 = pb.find((x) => x.druh === "NAJEM")!;
over("castecny najem", n1.castecny === true && Math.abs(n1.castka - 10000 * 11 / 31) < 0.01 && n1.datum === "2026-01-21", JSON.stringify(n1));
over("castecne zalohy", Math.abs(pb.find((x) => x.druh === "ZALOHA")!.castka - 3100 * 11 / 31) < 0.01);

// Konec najmu: nepokracuje dalsi mesice
const C: NajemPlatba = { ...A, do: "2026-02-28" };
over("po konci nic", navrhniPlatby({ najmy: [C], sluzby: [], pohyby: [], dnes: "2026-05-20" }).filter((x) => x.druh === "NAJEM").length === 2);

// Zmena zaloh v historii
const D: NajemPlatba = { ...A, historieZaloh: [{ validFrom: "2026-01-01", amount: 3000 }, { validFrom: "2026-03-01", amount: 3400 }] };
const pd = navrhniPlatby({ najmy: [D], sluzby: [], pohyby: [], dnes: "2026-03-20" }).filter((x) => x.druh === "ZALOHA");
over("zmena zaloh", pd.map((x) => x.castka).join() === "3000,3000,3400", pd.map((x) => x.castka));
over("bez dat nic", navrhniPlatby({ najmy: [], sluzby: [], pohyby: [], dnes: "2026-03-20" }).length === 0);
// Seskupeni: sluzby podle dodavatele, najem a zalohy podle najemce
{
  const dvaSluzby: SluzbaPlatba[] = [
    { ...sl, id: "e", type: "ELECTRICITY", provider: "ČEZ", nazevDruhu: "Elektřina", contractStart: "2026-03-01" },
    { ...sl, id: "g", type: "GAS", provider: "ČEZ", nazevDruhu: "Plyn", contractStart: "2026-03-01" },
    { ...sl, id: "v", provider: "Vodárna", nazevDruhu: "Vodné", contractStart: "2026-03-01" },
  ];
  const g = navrhniPlatby({ najmy: [A], sluzby: dvaSluzby, pohyby: [], dnes: "2026-03-20" });
  const sk = (typ: string) => new Set(g.filter((x) => x.skupina.typ === typ).map((x) => x.skupina.nazev));
  over("dodavatele", sk("DODAVATEL").size === 2 && sk("DODAVATEL").has("ČEZ") && sk("DODAVATEL").has("Vodárna"), [...sk("DODAVATEL")]);
  over("najemce", [...sk("NAJEMCE")].join() === "Novák");
  over("cez ma dve sluzby", g.filter((x) => x.skupina.nazev === "ČEZ" && x.mesic === "2026-03").length === 2);
}

// Prehled dluhu
{
  const vse = navrhniPlatby({ najmy: [A], sluzby: [sl], pohyby: [], zaplaceno: [
    { klic: "najem:A:2026-01", datum: "2026-01-16", castka: 10000 },
    { klic: "najem:A:2026-02", datum: "2026-02-20", castka: 9000 },      // zaplaceno o 1000 mene
    { klic: "sluzba:s1:2026-02", datum: "2026-02-02", castka: 800 },
  ], dnes: "2026-03-20" });
  const pr = prehledPlateb(vse);
  // najemce: unor nedoplatek 1000 + unor zalohy 3000 + brezen najem 10000 + zalohy 3000 + leden zalohy 3000 = 20000
  over("najemce dluzi", pr.najemciDluzi === 20000, pr.najemciDluzi);
  const n = pr.najemci[0];
  over("rozpis najemce", n.nazev === "Novák" && n.nedoplaceno === 1 && n.nezaplacenych === 4 && n.nejstarsi === "2026-01-15", JSON.stringify(n));
  // sluzba: unor zaplaceno, brezen nezaplaceno 800
  over("dluzim dodavatelum", pr.dluzimDodavatelum === 800 && pr.dodavatele[0].nazev === "Vodárna", JSON.stringify(pr.dodavatele));
  over("zaplaceno celkem", pr.zaplacenoCelkem.prijmy === 19000 && pr.zaplacenoCelkem.vydaje === 800, JSON.stringify(pr.zaplacenoCelkem));
  const navic = prehledPlateb(navrhniPlatby({ najmy: [A], sluzby: [], pohyby: [], zaplaceno: [{ klic: "najem:A:2026-01", datum: "2026-01-15", castka: 10500 }], dnes: "2026-01-20" }));
  over("preplatek", navic.najemci[0].preplaceno === 500 && navic.najemci[0].dluh === 3000, JSON.stringify(navic.najemci[0]));
  over("prazdny", prehledPlateb([]).najemciDluzi === 0);
}

// Uver a vyuctovani sluzeb
{
  const u = { id: "u1", veritel: "Banka", od: "2026-01-10", pocetSplatek: 240, splatka: 12000 };
  const g = navrhniPlatby({ najmy: [A], sluzby: [], pohyby: [], uvery: [u], dnes: "2026-03-20" });
  const spl = g.filter((x) => x.druh === "UVER");
  // prvni splatka o mesic po cerpani: unor a brezen, ne leden
  over("splatky uveru", spl.length === 2 && spl[0].castka === -12000 && spl.every((x) => x.datum.endsWith("-10")) && spl[0].skupina.nazev === "Banka", JSON.stringify(spl.map((x) => x.klic)));
  const v = { id: "v1", datum: "2026-03-05", obdobiOd: "2025-01-01", obdobiDo: "2025-12-31", rozdil: 1500, dodavator: "x", dodavatel: "ČEZ", nazevDruhu: "Elektřina" };
  const g2 = navrhniPlatby({ najmy: [A], sluzby: [], pohyby: [], vyuctovani: [v, { ...v, id: "v2", rozdil: -400, dodavatel: "Vodárna" }], dnes: "2026-03-20" });
  const nedo = g2.find((x) => x.klic === "vyuctovani:v1")!;
  over("nedoplatek", nedo.castka === -1500 && nedo.popis.startsWith("Nedoplatek"), JSON.stringify(nedo));
  const pr = prehledPlateb(g2);
  over("dluh i pohledavka", pr.dluzimDodavatelum === 1500 && pr.dodavateleDluzi === 400, JSON.stringify([pr.dluzimDodavatelum, pr.dodavateleDluzi]));
  const vyrovnano = prehledPlateb(navrhniPlatby({ najmy: [], sluzby: [], pohyby: [], vyuctovani: [v], zaplaceno: [{ klic: "vyuctovani:v1", datum: "2026-03-10", castka: 1500 }], dnes: "2026-03-20" }));
  over("vyrovnano", vyrovnano.dluzimDodavatelum === 0);
}

console.log(chyb ? `${chyb} chyb` : "vše v pořádku");
process.exit(chyb ? 1 : 0);
