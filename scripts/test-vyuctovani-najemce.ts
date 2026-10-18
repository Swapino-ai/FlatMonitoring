/** Kontrola pruvodce vyuctovanim pro najemce na typickych situacich. */
import { vyuctujNajemci, type SluzbaProNajemce } from "../src/lib/vyuctovaniNajemce";

let chyby = 0;
const over = (popis: string, ok: boolean, detail = "") => { console.log(`${ok ? "✓" : "✗"} ${popis}${detail ? ` (${detail})` : ""}`); if (!ok) chyby++; };
const kc = (n: number) => Math.round(n);

// Najemce od 1. 7. 2025, zaloha 3 000 Kc/mes.
const najem = { id: "L", nazev: "Novák", od: "2025-07-01", do: null, utilitiesMonthly: 3000 };
const sluzba = (id: string, x: Partial<SluzbaProNajemce>): SluzbaProNajemce => ({
  id, nazev: id, dodavatel: "D", skupina: null, prectena: true, aktivniOd: null, aktivniDo: null, vaha: 1000,
  vyuctovani: [], meraky: [], jednotka: null, ...x,
});
const v = (id: string, od: string, doDne: string, naklad: number) => ({ id, od, do: doDne, naklad, zalohyDodavateli: 0, rezim: "DAYS" as const, odecty: {} });

// Voda: dodavatel vyuctoval cely rok 2025 (36 500 Kc = 100/den)
// Elektrina: dodavatel vyuctoval jen do 30. 9. 2025
// Internet: zacal az 1. 1. 2026 (v obdobi neplatil)
const sluzby = [
  sluzba("voda", { skupina: "Voda a teplo", vyuctovani: [v("v1", "2025-01-01", "2025-12-31", 36500)] }),
  sluzba("teplo", { skupina: "Voda a teplo", vyuctovani: [v("t1", "2025-01-01", "2025-12-31", 18250)] }),
  sluzba("elektrina", { vyuctovani: [v("e1", "2025-01-01", "2025-09-30", 27300)] }),
  sluzba("internet", { aktivniOd: "2026-01-01", vyuctovani: [] }),
];
const r = vyuctujNajemci(najem, [najem], sluzby, "2025-07-01", "2025-12-31", null);
const radek = (id: string) => r.sluzby.find((x) => x.sluzbaId === id)!;
over("voda: jen dny nájemce (184 dní × 100 Kč)", kc(radek("voda").castka) === 18400, String(kc(radek("voda").castka)));
over("elektřina: vyúčtováno do 30. 9.", radek("elektrina").do === "2025-09-30");
over("elektřina: 1. 10. – 31. 12. přeneseno", JSON.stringify(radek("elektrina").preneseno) === JSON.stringify(["2025-10-01", "2025-12-31"]));
over("internet: v období neplatil", radek("internet").stav === "NEPLATILA");
over("skupina Voda a teplo se součtem", r.skupiny.some((g) => g.nazev === "Voda a teplo" && g.radky.length === 2));
// Zalohy: 3 000/mes; vahy voda/teplo/elektrina 1:1:1 (internet neplati) → elektrina za rijen–prosinec se prenese
const zalohyCele = 6 * 3000;
const prenesene = 3 * 1000; // tretina zaloh rijen–prosinec
over("zálohy bez přenesené elektřiny", Math.abs(r.zalohy - (zalohyCele - prenesene)) < 2, `${kc(r.zalohy)} ≈ ${zalohyCele - prenesene}`);

// Dalsi vyuctovani za 2026: elektrina navaze od 1. 10. 2025
const sluzby2 = sluzby.map((s) => s.id === "elektrina" ? { ...s, vyuctovani: [...s.vyuctovani, v("e2", "2025-10-01", "2026-09-30", 36500)] } : s);
const drive = [{ od: r.od, do: r.do, sluzbyDo: r.sluzbyDo }];
const r2 = vyuctujNajemci(najem, [najem], sluzby2, "2026-01-01", "2026-06-30", null, drive);
const e2 = r2.sluzby.find((x) => x.sluzbaId === "elektrina")!;
over("faktura přesahující konec období se nekrájí — přenese se s důvodem", e2.stav === "BEZ_VYUCTOVANI" && /přesahuje/.test(e2.duvodPrenosu ?? ""), e2.duvodPrenosu ?? "");
const r2b = vyuctujNajemci(najem, [najem], sluzby2, "2026-01-01", "2026-09-30", null, drive);
const e2b = r2b.sluzby.find((x) => x.sluzbaId === "elektrina")!;
over("další vyúčtování: elektřina od 1. 10. 2025 celou fakturou", e2b.od === "2025-10-01" && e2b.do === "2026-09-30" && Math.round(e2b.castka) === 36500, `${e2b.od} – ${e2b.do}, ${Math.round(e2b.castka)}`);
over("další vyúčtování: voda za 2026 bez vyúčtování dodavatele → přenese se", r2.sluzby.find((x) => x.sluzbaId === "voda")!.stav === "BEZ_VYUCTOVANI");
over("další vyúčtování: internet od 1. 1. 2026 bez faktury → přenese se", r2.sluzby.find((x) => x.sluzbaId === "internet")!.stav === "BEZ_VYUCTOVANI");

// Vynechana sluzba: jeji zalohy se nepocitaji
const r3 = vyuctujNajemci(najem, [najem], sluzby, "2025-07-01", "2025-12-31", ["voda"]);
over("vybraná jen voda: náklad jen voda", kc(r3.naklady) === 18400);
over("vybraná jen voda: zálohy jen její třetina", Math.abs(r3.zalohy - 6000) < 2, String(kc(r3.zalohy)));

// Meraky: najemce od 1. 7., faktura za cely rok 2025 (1 000 kWh, 6 000 Kc)
const merak = (stavy: [string, number][]) => ({ id: "m", druh: "ELEKTRINA", nazev: null, aktivni: true, dvoutarif: false, nahrazujeId: null,
  stavy: stavy.map(([datum, hodnota]) => ({ datum, hodnota, hodnota2: null })) });
const el = (stavy: [string, number][]) => [sluzba("el", { vyuctovani: [v("f", "2025-01-01", "2025-12-31", 6000)], meraky: [merak(stavy)], jednotka: "kWh" })];
const rm = vyuctujNajemci(najem, [najem], el([["2025-01-01", 0], ["2025-07-01", 400], ["2025-12-31", 1000]]), "2025-07-01", "2025-12-31", null);
const m1 = rm.sluzby[0];
over("měřáky: 600 z 1 000 kWh → 3 600 Kč", m1.zdroje[0]?.metoda === "meraky" && Math.round(m1.castka) === 3600, `${m1.zdroje[0]?.metoda} ${Math.round(m1.castka)}`);
const rm2 = vyuctujNajemci(najem, [najem], el([["2025-01-01", 0], ["2025-12-31", 1000]]), "2025-07-01", "2025-12-31", null);
over("chybí stav k předání → nevyúčtuje se, napíše k jakému dni", rm2.sluzby[0].stav === "BEZ_VYUCTOVANI" && /1\. 7\. 2025/.test(rm2.sluzby[0].duvodPrenosu ?? ""), rm2.sluzby[0].duvodPrenosu ?? "");
const celyRok = { ...najem, od: "2025-01-01" };
const rm3 = vyuctujNajemci(celyRok, [celyRok], el([]), "2025-01-01", "2025-12-31", null);
over("nájemce celou dobu sám → celá faktura bez měřáků", rm3.sluzby[0].zdroje[0]?.metoda === "cele" && Math.round(rm3.sluzby[0].castka) === 6000);

console.log(chyby ? `${chyby} chyb` : "vše v pořádku");
process.exit(chyby ? 1 : 0);
