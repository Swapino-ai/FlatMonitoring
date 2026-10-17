/** Diagnostika navrhu ke kontrole po nemovitostech (jen cte). */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const props = await prisma.property.findMany({ orderBy: { name: "asc" } });
  for (const p of props) {
    const z = await prisma.zarazeniInzeratu.findMany({ where: { propertyId: p.id }, include: { inzerat: { select: { dealType: true, zmizelAt: true, city: true, disposition: true, areaM2: true } } } });
    const n = z.filter((x) => x.stav === "NAVRH");
    const pocet = (f: (x: (typeof n)[number]) => boolean) => n.filter(f).length;
    console.log(`${p.name.padEnd(28)} sleduje=${p.sledovatTrh} podle=${p.oceneniPodle ?? "-"} | NAVRH ${n.length}: prodej ${pocet((x) => x.inzerat.dealType === "SALE")}, nájem ${pocet((x) => x.inzerat.dealType === "RENT")}, zmizelé ${pocet((x) => !!x.inzerat.zmizelAt)}, jiná dispozice ${pocet((x) => !!p.disposition && x.inzerat.disposition !== p.disposition)} | ZARAZENO ${z.filter((x) => x.stav === "ZARAZENO").length}, VYRAZENO ${z.filter((x) => x.stav === "VYRAZENO").length}`);
  }
}
main().finally(() => prisma.$disconnect());
