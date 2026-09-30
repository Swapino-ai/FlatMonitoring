import { nepokryto, prunik, rozuctuj, vyuctovaniNajemce, zalohyZaRozsah, type NajemVstup, type VyuctovaniVstup } from "../src/lib/vyuctovani";

let chyby = 0;
function ok(popis: string, podminka: boolean, detail?: unknown) {
  if (!podminka) { chyby++; console.error("CHYBA:", popis, detail ?? ""); }
}
const blizko = (a: number, b: number, eps = 0.01) => Math.abs(a - b) < eps;

const A: NajemVstup = { id: "A", nazev: "A", od: "2024-01-01", do: "2025-06-30", utilitiesMonthly: 3000 };
const B: NajemVstup = { id: "B", nazev: "B", od: "2025-07-15", do: null, utilitiesMonthly: 4000 };

// Rok 2025 (365 dni), naklad 36 500 -> 100 Kc/den
const rok: VyuctovaniVstup = {
  id: "v1", od: "2025-01-01", do: "2025-12-31", naklad: 36500, zalohyDodavateli: 30000,
  rezim: "DAYS", odecty: {},
};
const r = rozuctuj(rok, [A, B]);
ok("A ma 181 dni", r.podily.find((p) => p.leaseId === "A")?.dnu === 181, r.podily);
ok("B ma 170 dni (15.7.-31.12.)", r.podily.find((p) => p.leaseId === "B")?.dnu === 170, r.podily);
ok("vlastnik 14 dni prazdno", r.vlastnik.dnu === 14, r.vlastnik);
ok("podily + vlastnik = naklad",
  blizko(r.podily.reduce((a, p) => a + p.podil, 0) + r.vlastnik.podil, 36500), r);
ok("A = 18 100", blizko(r.podily[0].podil, 18100));
ok("dodavatel: nedoplatek 6 500", blizko(r.vysledekDodavatel, -6500));

// Orez: jen cast roku pro najemce A
const orez = rozuctuj(rok, [A, B], ["2025-01-01", "2025-03-31"]);
ok("orez A = 90 dni", orez.podily.find((p) => p.leaseId === "A")?.dnu === 90, orez.podily);
ok("orez B = 0", orez.podily.find((p) => p.leaseId === "B")?.dnu === 0);

// Prekryv: dva najmy ve stejny den se deli rovnym dilem
const P1: NajemVstup = { id: "P1", nazev: "P1", od: "2025-01-01", do: null, utilitiesMonthly: 0 };
const P2: NajemVstup = { id: "P2", nazev: "P2", od: "2025-01-01", do: null, utilitiesMonthly: 0 };
const p = rozuctuj(rok, [P1, P2]);
ok("prekryv 50/50", blizko(p.podily[0].podil, 18250) && blizko(p.podily[1].podil, 18250), p.podily);

// Odecty
const vod: VyuctovaniVstup = {
  id: "v2", od: "2025-01-01", do: "2025-12-31", naklad: 10000, zalohyDodavateli: 0,
  rezim: "READINGS", jednotka: "m3", spotrebaVlastnik: 20, odecty: { A: 30, B: 50 },
};
const o = rozuctuj(vod, [A, B]);
ok("cena za m3 = 100", blizko(o.jednotkovaCena!, 100), o);
ok("A = 3000, B = 5000, vlastnik 2000",
  blizko(o.podily[0].podil, 3000) && blizko(o.podily[1].podil, 5000) && blizko(o.vlastnik.podil, 2000), o);
const bezOdectu = rozuctuj({ ...vod, odecty: { A: 30 } }, [A, B]);
ok("chybejici odecet je oznacen", bezOdectu.podily.find((x) => x.leaseId === "B")?.chybiOdecet === true);
ok("bez spotreby chyba", rozuctuj({ ...vod, odecty: {}, spotrebaVlastnik: 0 }, [A, B]).chyba != null);

// Nepokryto
ok("nepokryto sloucene", JSON.stringify(nepokryto(["2025-01-01", "2025-01-10"],
  [{ od: "2025-01-03", do: "2025-01-05" }])) === JSON.stringify([["2025-01-01", "2025-01-02"], ["2025-01-06", "2025-01-10"]]));
ok("pokryto zcela", nepokryto(["2025-01-01", "2025-01-10"], [{ od: "2024-12-01", do: "2025-02-01" }]).length === 0);

// Zalohy: cely leden 3000, pul unora = 14/28
ok("zalohy leden", blizko(zalohyZaRozsah(A, "2025-01-01", "2025-01-31"), 3000));
ok("zalohy pul unora", blizko(zalohyZaRozsah(A, "2025-02-01", "2025-02-14"), 1500));
const H: NajemVstup = { ...A, historieZaloh: [
  { validFrom: "2024-01-01", amount: 2000 }, { validFrom: "2025-02-01", amount: 3000 },
] };
ok("zmena zaloh v case", blizko(zalohyZaRozsah(H, "2025-01-01", "2025-02-28"), 2000 + 3000));
ok("mimo najem 0", zalohyZaRozsah(A, "2025-08-01", "2025-08-31") === 0);

// Vyuctovani najemce: A cely rok 2025 (do 30.6.), sluzba voda pokryta celym rokem
const sluzby = [{ id: "s1", nazev: "Elektřina", dodavatel: "ČEZ", prectena: true, vyuctovani: [rok] }];
const vA = vyuctovaniNajemce(A, [A, B], sluzby, "2025-01-01", "2025-12-31");
ok("orezano na dobu najmu", vA.do === "2025-06-30", vA);
ok("naklady A 18100", blizko(vA.naklady, 18100), vA);
ok("zalohy A 6 x 3000", blizko(vA.zalohy, 18000), vA);
ok("doplatek A 100", blizko(vA.rozdil, -100), vA);
ok("kompletni", !vA.neuplne);
const mezera = vyuctovaniNajemce(A, [A, B], [{ ...sluzby[0], vyuctovani: [{ ...rok, od: "2025-03-01" }] }], "2025-01-01", "2025-06-30");
ok("chybejici vyuctovani je videt", mezera.neuplne && mezera.radky[0].chybi[0][0] === "2025-01-01", mezera.radky[0]);
ok("mimo najem chyba", vyuctovaniNajemce(A, [A, B], sluzby, "2026-01-01", "2026-02-01").chyba != null);
ok("neprectena sluzba se nepocita", vyuctovaniNajemce(A, [A, B], [{ ...sluzby[0], prectena: false }], "2025-01-01", "2025-06-30").radky.length === 0);
ok("prunik", prunik("2025-01-01", "2025-01-31", "2025-01-15", null)?.[0] === "2025-01-15");

console.log(chyby ? `${chyby} chyb` : "vše v pořádku");
process.exit(chyby ? 1 : 0);
