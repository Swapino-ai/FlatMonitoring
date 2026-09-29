/**
 * Druha sonda katastru: jak vypada odpoved pro skutecnou nemovitost.
 *
 * Prvni sonda nasla zaklad /api/v1 a jmena endpointu. Tohle zjistuje tvar dat,
 * aby se parser psal podle skutecne odpovedi a ne podle domnenky. Cte
 * nemovitosti z databaze, prelozi obec na katastralni uzemi a vypise, co
 * /Jednotky/Vyhledani vrati. Nic nemeni.
 */
import { prisma } from "../src/lib/db";

const KLIC = process.env.KATASTR_API_KEY ?? "";
const ZAKLAD = "https://api-kn.cuzk.gov.cz/api/v1";

async function ptejSe(cesta: string) {
  const r = await fetch(ZAKLAD + cesta, {
    headers: { Accept: "application/json", ApiKey: KLIC },
  });
  const telo = await r.text();
  return { status: r.status, telo };
}

/** Z ulice "Korunní 734/15" vytahne cislo popisne (734) a orientacni (15). */
function cislaZUlice(ulice: string): { popisne: number | null; orientacni: string | null } {
  const m = ulice.match(/(\d+)\s*\/\s*(\d+[a-zA-Z]?)/);
  if (m) return { popisne: Number(m[1]), orientacni: m[2] };
  const samotne = ulice.match(/(\d+)/);
  return { popisne: samotne ? Number(samotne[1]) : null, orientacni: null };
}

async function main() {
  if (!KLIC) {
    console.log("KATASTR_API_KEY není nastavený.");
    return;
  }

  const stav = await ptejSe("/AplikacniSluzby/StavUctu");
  console.log(`Stav účtu: ${stav.telo}\n`);

  const nemovitosti = await prisma.property.findMany({
    select: { id: true, name: true, street: true, city: true, zip: true, type: true },
    take: 3,
  });
  console.log(`Nemovitostí v databázi: ${nemovitosti.length}\n`);

  for (const n of nemovitosti) {
    console.log(`\n=== ${n.name} — ${n.street}, ${n.city} ===`);
    const cisla = cislaZUlice(n.street);
    console.log(`Z adresy: číslo popisné ${cisla.popisne}, orientační ${cisla.orientacni}`);

    // Obec podle nazvu — cislenik umi hledat, zkusime oboji
    const obce = await ptejSe(`/CiselnikyUzemnichJednotek/Obce?nazev=${encodeURIComponent(n.city)}`);
    console.log(`\nObce [${obce.status}]: ${obce.telo.slice(0, 700)}`);

    const ku = await ptejSe(`/CiselnikyUzemnichJednotek/KatastralniUzemi?nazev=${encodeURIComponent(n.city)}`);
    console.log(`\nKatastrální území [${ku.status}]: ${ku.telo.slice(0, 700)}`);

    // Casti obce potrebujeme pro KodCastiObce, ktery vyhledani jednotky chce
    const casti = await ptejSe(`/CiselnikyUzemnichJednotek/CastiObci?nazev=${encodeURIComponent(n.city)}`);
    console.log(`\nČásti obce [${casti.status}]: ${casti.telo.slice(0, 700)}`);

    if (cisla.popisne == null) {
      console.log("Bez čísla popisného se jednotka hledat nedá — přeskakuji.");
      continue;
    }

    // Kod casti obce z predchozi odpovedi, kdyz nejaky prisel
    let kodCasti: number | null = null;
    try {
      const d = JSON.parse(casti.telo) as { data?: { kod?: number; nazev?: string }[] };
      kodCasti = d.data?.[0]?.kod ?? null;
    } catch { /* odpoved nebyla JSON, vypsala se vys */ }

    if (kodCasti == null) {
      console.log("Kód části obce se nepodařilo zjistit — vyhledání jednotky přeskakuji.");
      continue;
    }

    const jednotky = await ptejSe(
      `/Jednotky/Vyhledani?KodCastiObce=${kodCasti}&CisloDomovni=${cisla.popisne}&TypStavby=1`,
    );
    console.log(`\nJEDNOTKY [${jednotky.status}]:\n${jednotky.telo.slice(0, 3000)}`);

    const stavby = await ptejSe(
      `/Stavby/Vyhledani?KodCastiObce=${kodCasti}&CisloDomovni=${cisla.popisne}&TypStavby=1`,
    );
    console.log(`\nSTAVBY [${stavby.status}]:\n${stavby.telo.slice(0, 2000)}`);
  }

  const konec = await ptejSe("/AplikacniSluzby/StavUctu");
  console.log(`\nStav účtu po sondě: ${konec.telo}`);
}

main().finally(() => prisma.$disconnect());

export {};
