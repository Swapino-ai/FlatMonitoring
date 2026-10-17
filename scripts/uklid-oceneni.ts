/**
 * Jednorazovy uklid historie oceneni: u odhadu ze zarazenych nabidek (zdroj VYBER)
 * necha za kazdy den jen posledni zaznam. Rucni oceneni nemeni.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const den = (d: Date) => d.toISOString().slice(0, 10);

async function main() {
  const smazat = async (radky: { id: string; propertyId: string; date: Date }[]) => {
    const posledni = new Map<string, string>();
    for (const r of [...radky].sort((a, b) => a.date.getTime() - b.date.getTime())) posledni.set(`${r.propertyId}|${den(r.date)}`, r.id);
    const ponechat = new Set(posledni.values());
    return radky.filter((r) => !ponechat.has(r.id)).map((r) => r.id);
  };
  const v = await smazat(await prisma.valuation.findMany({ where: { source: "VYBER" }, select: { id: true, propertyId: true, date: true } }));
  const n = await smazat(await prisma.rentEstimate.findMany({ where: { source: "VYBER" }, select: { id: true, propertyId: true, date: true } }));
  const a = await prisma.valuation.deleteMany({ where: { id: { in: v } } });
  const b = await prisma.rentEstimate.deleteMany({ where: { id: { in: n } } });
  console.log(`Ocenění: smazáno ${a.count} mezidenních záznamů. Odhady nájmu: smazáno ${b.count}.`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
