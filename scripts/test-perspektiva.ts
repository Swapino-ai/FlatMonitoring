/** Kontrola narovnani dokladu: homografie zobrazi rohy presne a obdelnik zustane obdelnikem. */
import { aplikuj, homografie, narovnej, velikostVysledku } from "../src/lib/perspektiva";

let chyby = 0;
const over = (popis: string, ok: boolean, detail = "") => { console.log(`${ok ? "✓" : "✗"} ${popis}${detail ? ` (${detail})` : ""}`); if (!ok) chyby++; };
const blizko = (a: number, b: number) => Math.abs(a - b) < 1e-6;

const z = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }];
const na = [{ x: 10, y: 20 }, { x: 90, y: 5 }, { x: 110, y: 70 }, { x: 0, y: 60 }];
const H = homografie(z, na);
over("rohy se zobrazi presne", z.every((b, i) => { const p = aplikuj(H, b.x, b.y); return blizko(p.x, na[i].x) && blizko(p.y, na[i].y); }));
const I = homografie(z, z);
over("totozne rohy = identita", blizko(aplikuj(I, 37, 12).x, 37) && blizko(aplikuj(I, 37, 12).y, 12));
over("velikost podle delsich stran", JSON.stringify(velikostVysledku([{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 600 }, { x: 0, y: 600 }], 2000)) === '{"w":300,"h":600}');
over("velikost se zmensi na max", velikostVysledku([{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 3000 }, { x: 0, y: 3000 }], 2000).w === 2000);

// Zdroj 4×4: leva pulka cerna, prava bila; vyrez prave pulky musi byt cely bily
const sw = 4, sh = 4, data = new Uint8ClampedArray(sw * sh * 4);
for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) { const v = x >= 2 ? 255 : 0; data.set([v, v, v, 255], (y * sw + x) * 4); }
const out = narovnej({ data, width: sw, height: sh }, [{ x: 2, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 2, y: 4 }], 2, 4);
over("vyrez prave pulky je bily", [...out].filter((_, i) => i % 4 !== 3).every((v) => v > 200), [...out.slice(0, 8)].join(","));

console.log(chyby ? `${chyby} chyb` : "vše v pořádku");
process.exit(chyby ? 1 : 0);
