/**
 * Porovna pocty radku ve vsech tabulkach dvou databazi (po migraci).
 * Pouziti: STARA_URL=... NOVA_URL=... npx tsx scripts/porovnej-databaze.ts
 * Adresy se nikdy nevypisuji, jen pocty.
 */
import { PrismaClient } from "@prisma/client";

const stara = new PrismaClient({ datasources: { db: { url: process.env.STARA_URL } } });
const nova = new PrismaClient({ datasources: { db: { url: process.env.NOVA_URL } } });

async function main() {
  const tabulky = Object.keys(stara).filter((k) => !k.startsWith("_") && !k.startsWith("$") && typeof (stara as never)[k] === "object");
  let rozdily = 0;
  let celkem = 0;
  for (const t of tabulky) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [a, b] = await Promise.all([(stara as any)[t].count(), (nova as any)[t].count()]);
    celkem += a;
    const shoda = a === b;
    if (!shoda) rozdily++;
    console.log(`${shoda ? "OK   " : "CHYBA"} ${t.padEnd(22)} stará ${String(a).padStart(7)}  nová ${String(b).padStart(7)}`);
  }
  console.log(`\n${tabulky.length} tabulek, ${celkem} řádků ve staré databázi.`);
  if (rozdily > 0) {
    console.error(`${rozdily} tabulek se liší — migrace není úplná.`);
    process.exit(1);
  }
  console.log("Počty řádků ve všech tabulkách sedí.");
}

main().finally(() => Promise.all([stara.$disconnect(), nova.$disconnect()]));
