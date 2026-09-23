/**
 * Kontrola prepoctu po vyrazeni nabidky.
 *
 * Bohusovice: medián tahnou nahoru nabídky z Roudnice. Po jejich vyrazeni
 * musi hodnota klesnout — a snimek musi zustat cely, protoze je to doklad.
 */
function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
}

interface N { klic: string; pricePerM2: number; mesto: string }

function prepocitej(snimek: N[], vyrazene: Set<string>, plocha: number) {
  const ceny = snimek
    .filter((n) => !vyrazene.has(n.klic))
    .map((n) => n.pricePerM2)
    .sort((a, b) => a - b);
  return {
    vzorek: ceny.length,
    zaM2: Math.round(quantile(ceny, 0.5)),
    hodnota: ceny.length >= 3 ? Math.round(quantile(ceny, 0.5) * plocha) : null,
  };
}

// Bohušovice levné, Roudnice drahá
const SNIMEK: N[] = [
  { klic: "S|1", pricePerM2: 38000, mesto: "Bohušovice" },
  { klic: "S|2", pricePerM2: 41000, mesto: "Bohušovice" },
  { klic: "S|3", pricePerM2: 43000, mesto: "Bohušovice" },
  { klic: "S|4", pricePerM2: 68000, mesto: "Roudnice" },
  { klic: "S|5", pricePerM2: 72000, mesto: "Roudnice" },
];
const PLOCHA = 62;

let chyb = 0;
const kontrola = (popis: string, skutecnost: unknown, ocekavani: unknown) => {
  const ok = JSON.stringify(skutecnost) === JSON.stringify(ocekavani);
  if (!ok) chyb++;
  console.log(`  ${ok ? "OK " : "!! "} ${popis}`);
  console.log(`       ${JSON.stringify(skutecnost)}${ok ? "" : ` — čekáno ${JSON.stringify(ocekavani)}`}`);
};

const puvodni = prepocitej(SNIMEK, new Set(), PLOCHA);
kontrola("bez vyřazení — medián táhne Roudnice nahoru",
  puvodni, { vzorek: 5, zaM2: 43000, hodnota: 2666000 });

const bezRoudnice = prepocitej(SNIMEK, new Set(["S|4", "S|5"]), PLOCHA);
kontrola("po vyřazení Roudnice — hodnota klesne",
  bezRoudnice, { vzorek: 3, zaM2: 41000, hodnota: 2542000 });

const prilisMalo = prepocitej(SNIMEK, new Set(["S|3", "S|4", "S|5"]), PLOCHA);
kontrola("zbyly dvě nabídky — hodnota se nepřepisuje",
  prilisMalo.hodnota, null);

kontrola("snímek zůstává celý", SNIMEK.length, 5);

console.log(chyb === 0 ? "\nPřepočet po vyřazení funguje." : `\n${chyb} případů neprošlo.`);
process.exitCode = chyb === 0 ? 0 : 1;

// Samostatny modul — jinak by se promenne srazely s ostatnimi skripty
export {};
