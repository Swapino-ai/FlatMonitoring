import { median, odhadZeZarazenych, ohodnot } from "../src/lib/market/zarazeni";

let chyb = 0;
const over = (n: string, ok: boolean, info?: unknown) => { if (!ok) { chyb++; console.log("CHYBA", n, info ?? ""); } };

over("median sudy", median([1, 3, 2, 4]) === 2.5);
over("median lichy", median([5, 1, 3]) === 3);

const n = { areaM2: 60, disposition: "2+kk", latitude: 50.0, longitude: 14.0, city: "Praha", okruhKm: 3 };
const blizko = ohodnot(n, { areaM2: 62, disposition: "2+kk", latitude: 50.005, longitude: 14.0, city: "Praha", pricePerM2: 100000 }, 100000);
over("blizko doporuceno", blizko.doporuceno && !blizko.mimo, blizko);
const daleko = ohodnot(n, { areaM2: 60, disposition: "2+kk", latitude: 50.2, longitude: 14.0, city: "X", pricePerM2: 100000 }, null);
over("daleko mimo", daleko.mimo, daleko);
const velky = ohodnot(n, { areaM2: 120, disposition: "4+1", latitude: 50.0, longitude: 14.0, city: "Praha", pricePerM2: 1 }, null);
over("velky mimo", velky.mimo, velky);
const drahy = ohodnot(n, { areaM2: 60, disposition: "2+kk", latitude: 50.0, longitude: 14.0, city: "Praha", pricePerM2: 200000 }, 100000);
over("drahy nedoporucen", !drahy.doporuceno && drahy.duvod.includes("cena"), drahy);

over("prazdny odhad", odhadZeZarazenych([], 50) === null);
const body = Array.from({ length: 12 }, (_, i) => ({ datum: `2026-01-${String(i + 1).padStart(2, "0")}`, pricePerM2: 1000 * (i + 1) }));
const o = odhadZeZarazenych(body, 10)!;
// posledni okno: 3..12 tisic -> median 7.5 tis
over("okno 10", o.pocet === 10 && o.perM2 === 7500 && o.hodnota === 75000, o);
over("rada po bodech", o.rada.length === 12 && o.rada[0].hodnota === 10000 && o.rada[1].perM2 === 1500, o.rada.slice(0, 2));

console.log(chyb ? `${chyb} chyb` : "vše v pořádku");
process.exit(chyb ? 1 : 0);
