import { mesiceMezi, navrhniPlatby, type NajemPlatba, type SluzbaPlatba } from "../src/lib/pravidelnePlatby";
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
over("vse navrzeno", p.every((x) => x.stav === "navrzeno"));

// Budouci platba se nenavrhuje: splatnost 15., dnes 10.
over("budouci mimo", navrhniPlatby({ najmy: [A], sluzby: [], pohyby: [], dnes: "2026-03-10" }).filter((x) => x.druh === "NAJEM").length === 2);

// Zauctovane se poznaji a necitaji znovu
const znovu = navrhniPlatby({ najmy: [A], sluzby: [sl], pohyby: [{ date: "2026-01-15", category: "RENT", sourceKey: "najem:A:2026-01" }], dnes: "2026-03-20" });
over("zauctovano", znovu.find((x) => x.klic === "najem:A:2026-01")?.stav === "zauctovano");
over("ostatni stale navrzeno", znovu.find((x) => x.klic === "najem:A:2026-02")?.stav === "navrzeno");

// Rucne zadany pohyb v kategorii a mesici -> "mozna"
const rucne = navrhniPlatby({ najmy: [A], sluzby: [], pohyby: [{ date: "2026-02-10", category: "RENT", sourceKey: null }], dnes: "2026-03-20" });
over("mozna duplicita", rucne.find((x) => x.klic === "najem:A:2026-02")?.stav === "mozna" && !!rucne.find((x) => x.klic === "najem:A:2026-02")?.poznamka);

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

console.log(chyb ? `${chyb} chyb` : "vše v pořádku");
process.exit(chyb ? 1 : 0);
