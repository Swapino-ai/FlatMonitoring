import { median, odhadZeZarazenych, ohodnot, vahaNabidky, vazenyMedian } from "../src/lib/market/zarazeni";

let chyb = 0;
const over = (n: string, ok: boolean, info?: unknown) => { if (!ok) { chyb++; console.log("CHYBA", n, info ?? ""); } };

over("median sudy", median([1, 3, 2, 4]) === 2.5);
over("median lichy", median([5, 1, 3]) === 3);

const n = { areaM2: 60, disposition: "2+kk", latitude: 50.0, longitude: 14.0, city: "Praha", okruhKm: 3 };
const blizko = ohodnot(n, { areaM2: 62, disposition: "2+kk", latitude: 50.005, longitude: 14.0, city: "Praha", pricePerM2: 100000 }, 100000);
over("blizko doporuceno", blizko.doporuceno && !blizko.mimo, blizko);
const daleko = ohodnot(n, { areaM2: 60, disposition: "2+kk", latitude: 50.05, longitude: 14.0, city: "X", pricePerM2: 100000 }, null);
over("daleko mimo", daleko.mimo, daleko);
const velky = ohodnot(n, { areaM2: 80, disposition: "2+kk", latitude: 50.0, longitude: 14.0, city: "Praha", pricePerM2: 1 }, null);
over("velky mimo", velky.mimo, velky);
const jinaDisp = ohodnot(n, { areaM2: 60, disposition: "1+1", latitude: 50.0, longitude: 14.0, city: "Praha", pricePerM2: 1 }, null);
over("jina dispozice mimo", jinaDisp.mimo && jinaDisp.duvod.startsWith("dispozice"), jinaDisp);
const bezPolohy = ohodnot(n, { areaM2: 60, disposition: "2+kk", latitude: null, longitude: null, city: "Jinde", pricePerM2: 1 }, null);
over("jina obec bez polohy mimo", bezPolohy.mimo, bezPolohy);
const drahy = ohodnot(n, { areaM2: 60, disposition: "2+kk", latitude: 50.0, longitude: 14.0, city: "Praha", pricePerM2: 200000 }, 100000);
over("drahy nedoporucen", !drahy.doporuceno && drahy.duvod.includes("cena"), drahy);

over("prazdny odhad", odhadZeZarazenych([], 50) === null);
// Body po 10 dnech (leden-duben); okno 61 dni pred poslednim
const body = Array.from({ length: 12 }, (_, i) => ({ datum: new Date(Date.UTC(2026, 0, 1 + i * 10)).toISOString().slice(0, 10), pricePerM2: 1000 * (i + 1) }));
const o = odhadZeZarazenych(body, 10)!;
// posledni 2026-04-21; okno > 2026-02-19: body 2026-02-20 .. 04-21 = indexy 5..11 -> 6..12 tis -> median 9 tis
over("okno 2 mesice", o.pocet === 7 && o.perM2 === 9000 && o.hodnota === 90000, o);
over("rada po bodech", o.rada.length === 12 && o.rada[0].hodnota === 10000 && o.rada[1].perM2 === 1500, o.rada.slice(0, 2));

over("vazeny median", vazenyMedian([{ hodnota: 1, vaha: 1 }, { hodnota: 2, vaha: 1 }, { hodnota: 10, vaha: 5 }]) === 10);
over("vazeny median rovne", vazenyMedian([{ hodnota: 1, vaha: 1 }, { hodnota: 3, vaha: 1 }]) === 2);
const nn = { areaM2: 60, typDomu: "PANEL", stavBytu: "PRED_REKONSTRUKCI" };
over("vaha stejny byt", vahaNabidky(nn, { areaM2: 60, typDomu: "PANEL", stavBytu: "PRED_REKONSTRUKCI", vahaRucne: null }) === 8);
over("vaha jiny", vahaNabidky(nn, { areaM2: 75, typDomu: "CIHLA", stavBytu: "PO_REKONSTRUKCI", vahaRucne: null }) === 0.25);
over("vaha rucne", vahaNabidky(nn, { areaM2: 75, typDomu: null, stavBytu: null, vahaRucne: 3 }) === 3);

console.log(chyb ? `${chyb} chyb` : "vše v pořádku");
process.exit(chyb ? 1 : 0);
