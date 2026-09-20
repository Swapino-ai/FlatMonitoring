/**
 * Obnova ze zalohy vytvorene skriptem backup.ts.
 *
 *   npm run restore -- zalohy/flatmonitoring-2026-09-20.json
 *
 * POZOR: smaze vsechna soucasna data. Vyzaduje potvrzeni, nebo prepinac --ano.
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import { createInterface } from "readline/promises";
import type { Zaloha } from "./backup";

async function main() {
  const soubor = process.argv.find((a) => a.endsWith(".json"));
  const bezDotazu = process.argv.includes("--ano");
  if (!soubor) throw new Error("Použití: npm run restore -- <soubor.json> [--ano]");

  const zaloha = JSON.parse(readFileSync(soubor, "utf8")) as Zaloha;
  if (zaloha.verze !== 1) throw new Error(`Neznámá verze zálohy: ${zaloha.verze}`);

  const pocty = Object.entries(zaloha.tabulky).filter(([, v]) => v.length);
  console.log(`Záloha z ${new Date(zaloha.vytvoreno).toLocaleString("cs-CZ")}`);
  for (const [k, v] of pocty) console.log(`  ${k}: ${v.length} záznamů`);

  if (!bezDotazu) {
    if (!process.stdin.isTTY) throw new Error("Neinteraktivní běh vyžaduje přepínač --ano.");
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const odpoved = await rl.question("\nTímto SMAŽEŠ všechna současná data. Pokračovat? [ano/ne] ");
    rl.close();
    if (odpoved.trim().toLowerCase() !== "ano") {
      console.log("Zrušeno, nic se nezměnilo.");
      return;
    }
  }

  const prisma = new PrismaClient();
  try {
    // Mazani v opacnem poradi nez vkladani, kvuli cizim klicum
    await prisma.marketListing.deleteMany();
    await prisma.marketScan.deleteMany();
    await prisma.marketIndex.deleteMany();
    await prisma.valuation.deleteMany();
    await prisma.service.deleteMany();
    await prisma.transaction.deleteMany();
    await prisma.lease.deleteMany();
    await prisma.loan.deleteMany();
    await prisma.property.deleteMany();
    await prisma.user.deleteMany();

    const t = zaloha.tabulky as Record<string, any[]>;
    const vloz = async (nazev: string, fn: (d: any[]) => Promise<unknown>) => {
      const data = t[nazev] ?? [];
      if (data.length === 0) return;
      await fn(data);
      console.log(`  obnoveno ${nazev}: ${data.length}`);
    };

    await vloz("user", (d) => prisma.user.createMany({ data: d }));
    await vloz("property", (d) => prisma.property.createMany({ data: d }));
    await vloz("loan", (d) => prisma.loan.createMany({ data: d }));
    await vloz("lease", (d) => prisma.lease.createMany({ data: d }));
    await vloz("transaction", (d) => prisma.transaction.createMany({ data: d }));
    await vloz("service", (d) => prisma.service.createMany({ data: d }));
    await vloz("valuation", (d) => prisma.valuation.createMany({ data: d }));
    await vloz("marketScan", (d) => prisma.marketScan.createMany({ data: d }));
    await vloz("marketListing", (d) => prisma.marketListing.createMany({ data: d }));
    await vloz("marketIndex", (d) => prisma.marketIndex.createMany({ data: d }));

    console.log("\nObnova dokončena.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("Obnova selhala:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
