/**
 * Jednorazove smazani vsech dosavadnich dat skenu trhu, aby novy system
 * (sledovani, navrhy, zarazovani) zacal od nuly.
 *
 * Maze: stare nabidky a behy skenu, vyrazene nabidky, novou databazi inzeratu
 * (vcetne zarazeni a snimku) a ocenění/odhady najmu vznikle ze skenu.
 * Nemaze: rucni oceneni (rucni, znalec, porizovaci cena) a nastaveni "Sledovat trh".
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const zeSkenu = { source: { in: ["MARKET_SCAN", "VYBER"] } };
  const r = await prisma.$transaction([
    prisma.inzeratSnimek.deleteMany(),
    prisma.inzeratCena.deleteMany(),
    prisma.zarazeniInzeratu.deleteMany(),
    prisma.inzerat.deleteMany(),
    prisma.marketListing.deleteMany(),
    prisma.marketScan.deleteMany(),
    prisma.excludedListing.deleteMany(),
    prisma.scanRun.deleteMany(),
    prisma.valuation.deleteMany({ where: zeSkenu }),
    prisma.rentEstimate.deleteMany({ where: zeSkenu }),
  ]);
  const nazvy = ["snímky", "historie cen", "zařazení", "inzeráty", "staré nabídky", "staré skeny", "vyřazené", "deník skenů", "ocenění ze skenu", "odhady nájmu ze skenu"];
  r.forEach((x, i) => console.log(`${nazvy[i].padEnd(24)} smazáno ${x.count}`));
  console.log("Hotovo. Nový sken začíná od nuly.");
}

main()
  .catch((e) => { console.error("Mazání selhalo:", e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
