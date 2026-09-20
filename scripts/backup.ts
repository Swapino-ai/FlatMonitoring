/**
 * Export vsech dat do JSON. Nezavisly na databazi — funguje na Neonu stejne
 * jako na cemkoli jinem a nepotrebuje pg_dump ani zadny externi nastroj.
 *
 *   npm run backup                    → zalohy/flatmonitoring-2026-09-20.json
 *   npm run backup -- /jina/cesta.json
 *
 * Obnova: npm run restore -- <soubor>
 */
import { PrismaClient } from "@prisma/client";
import { mkdirSync, writeFileSync, readdirSync, unlinkSync, statSync } from "fs";
import { join, resolve, dirname } from "path";

const KEEP = 30;

export interface Zaloha {
  verze: 1;
  vytvoreno: string;
  tabulky: Record<string, unknown[]>;
}

async function main() {
  const target = process.argv[2]
    ? resolve(process.argv[2])
    : join(process.cwd(), "zalohy", `flatmonitoring-${new Date().toISOString().slice(0, 10)}.json`);

  const prisma = new PrismaClient();
  try {
    // Poradi je dulezite pri obnove — nadrazene zaznamy musi byt driv.
    const tabulky = {
      user: await prisma.user.findMany(),
      property: await prisma.property.findMany(),
      loan: await prisma.loan.findMany(),
      lease: await prisma.lease.findMany(),
      transaction: await prisma.transaction.findMany(),
      service: await prisma.service.findMany(),
      valuation: await prisma.valuation.findMany(),
      marketScan: await prisma.marketScan.findMany(),
      marketListing: await prisma.marketListing.findMany(),
      marketIndex: await prisma.marketIndex.findMany(),
    };

    const zaloha: Zaloha = { verze: 1, vytvoreno: new Date().toISOString(), tabulky };

    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, JSON.stringify(zaloha, null, 2), "utf8");

    const kb = (statSync(target).size / 1024).toFixed(0);
    const pocty = Object.entries(tabulky)
      .filter(([, v]) => v.length > 0)
      .map(([k, v]) => `${k}: ${v.length}`)
      .join(", ");
    console.log(`Záloha uložena: ${target} (${kb} kB)`);
    console.log(`  ${pocty}`);
  } finally {
    await prisma.$disconnect();
  }

  // Rotace
  const dir = dirname(target);
  const stare = readdirSync(dir)
    .filter((f) => /^flatmonitoring-\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort()
    .reverse();
  for (const f of stare.slice(KEEP)) {
    unlinkSync(join(dir, f));
    console.log(`Smazána stará záloha: ${f}`);
  }
}

main().catch((e) => {
  console.error("Záloha selhala:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
