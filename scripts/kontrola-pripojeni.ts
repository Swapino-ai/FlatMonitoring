/**
 * Kontrola tvaru pripojovacich retezcu.
 *
 * Prisma pri spatnem tvaru hlasi jen "P1013: scheme is not recognized", coz
 * neporadi, co je spatne. Nejcastejsi chyba je, ze se do hodnoty secretu
 * vlozil i nazev promenne ("DATABASE_URL=postgresql://...") nebo cely prikaz
 * psql, ktery Neon nabizi na dashboardu.
 *
 * Hodnotu nikdy nevypisujeme — jen co je na ni v neporadku.
 */
const OCEKAVANA_SCHEMATA = ["postgresql://", "postgres://"];

interface Nalez { promenna: string; problem: string; rada: string }

function zkontroluj(nazev: string, hodnota: string | undefined): Nalez | null {
  if (!hodnota || hodnota.trim() === "") {
    return { promenna: nazev, problem: "není vůbec nastavená",
      rada: `Settings → Secrets and variables → Actions → New repository secret, jméno ${nazev}.` };
  }

  const h = hodnota.trim();

  if (h.startsWith(`${nazev}=`) || /^[A-Z_]+=/.test(h)) {
    return { promenna: nazev, problem: "hodnota začíná názvem proměnné",
      rada: `Ulož jen samotný řetězec od "postgresql://" dál, bez "${nazev}=" na začátku.` };
  }
  if (h.startsWith("psql")) {
    return { promenna: nazev, problem: "hodnota je celý příkaz psql",
      rada: "Z příkazu vezmi jen tu část v uvozovkách, od \"postgresql://\" dál." };
  }
  if (h.startsWith('"') || h.startsWith("'")) {
    return { promenna: nazev, problem: "hodnota je v uvozovkách",
      rada: "Uvozovky na začátku a konci smaž." };
  }
  if (!OCEKAVANA_SCHEMATA.some((s) => h.startsWith(s))) {
    // Prvnich par znaku pred "://" neni tajemstvi a napovi, co se stalo
    const zacatek = h.slice(0, Math.min(12, h.indexOf("://") + 3 || 12));
    return { promenna: nazev, problem: `začíná "${zacatek}…" místo "postgresql://"`,
      rada: "Zkopíruj řetězec znovu z Neonu, Dashboard → Connection string." };
  }
  if (h !== hodnota) {
    return { promenna: nazev, problem: "na začátku nebo konci je mezera či nový řádek",
      rada: "Ulož hodnotu znovu bez okolních mezer." };
  }

  return null;
}

const pooled = process.env.DATABASE_URL;
const direct = process.env.DIRECT_URL;

const nalezy = [
  zkontroluj("DATABASE_URL", pooled),
  zkontroluj("DIRECT_URL", direct),
].filter((n): n is Nalez => n !== null);

if (nalezy.length > 0) {
  console.error("Připojovací řetězce nejsou v pořádku:\n");
  for (const n of nalezy) {
    console.error(`  ${n.promenna}: ${n.problem}`);
    console.error(`    → ${n.rada}\n`);
  }
  process.exit(1);
}

// Prohozene retezce nejsou chyba tvaru, ale migrace pres pooler delaji potize
if (pooled && direct) {
  const pooledJePooled = pooled.includes("-pooler");
  const directJePooled = direct.includes("-pooler");
  if (!pooledJePooled && directJePooled) {
    console.error("DATABASE_URL a DIRECT_URL vypadají prohozeně:");
    console.error("  DATABASE_URL má být ten s \"-pooler\" v adrese, DIRECT_URL ten bez něj.");
    process.exit(1);
  }
  if (!pooledJePooled) {
    console.log("Poznámka: DATABASE_URL neobsahuje \"-pooler\". Funguje to, ale přijdeš o sdílení spojení.");
  }
}

console.log("Připojovací řetězce mají správný tvar.");
