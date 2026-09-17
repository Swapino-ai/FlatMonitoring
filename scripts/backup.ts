/**
 * Zaloha databaze. Pouziva SQLite VACUUM INTO, takze je konzistentni
 * i kdyz aplikace zrovna bezi — na rozdil od prosteho kopirovani souboru.
 *
 *   npm run backup            → zalohy/data-2026-09-17.db
 *   npm run backup -- /jina/cesta
 */
import { PrismaClient } from "@prisma/client";
import { mkdirSync, statSync, readdirSync, unlinkSync, existsSync } from "fs";
import { join, resolve, dirname } from "path";

const KEEP = 30; // kolik zaloh si nechat

async function main() {
  const target = process.argv[2]
    ? resolve(process.argv[2])
    : join(process.cwd(), "zalohy", `data-${new Date().toISOString().slice(0, 10)}.db`);

  mkdirSync(dirname(target), { recursive: true });
  if (existsSync(target)) unlinkSync(target); // VACUUM INTO odmítne existující soubor

  const prisma = new PrismaClient();
  try {
    await prisma.$executeRawUnsafe(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
    const kb = (statSync(target).size / 1024).toFixed(0);
    console.log(`Záloha uložena: ${target} (${kb} kB)`);
  } finally {
    await prisma.$disconnect();
  }

  // Rotace — staré zálohy nad limit smaž
  const dir = dirname(target);
  const backups = readdirSync(dir)
    .filter((f) => /^data-\d{4}-\d{2}-\d{2}\.db$/.test(f))
    .sort()
    .reverse();
  for (const old of backups.slice(KEEP)) {
    unlinkSync(join(dir, old));
    console.log(`Smazána stará záloha: ${old}`);
  }
}

main().catch((e) => {
  console.error("Záloha selhala:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
