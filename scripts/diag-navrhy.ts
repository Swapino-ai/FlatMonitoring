/** Diagnostika: vlastnici a posledni oceneni po nemovitostech (jen cte). */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const users = await prisma.user.findMany({ select: { id: true, name: true } });
  const jmeno = new Map(users.map((u) => [u.id, u.name]));
  for (const p of await prisma.property.findMany({ include: { owners: true, valuations: { orderBy: { date: "desc" }, take: 2 } }, orderBy: { name: "asc" } })) {
    console.log(`${p.name.padEnd(28)} podle=${p.oceneniPodle ? "ano" : "-"} | vlastníci: ${p.owners.map((o) => `${jmeno.get(o.userId) ?? "?"} ${o.share} %`).join(", ") || "žádní (= 100 % každý)"} | ocenění: ${p.valuations.map((v) => `${v.source} ${Math.round(v.value)} (${v.date.toISOString().slice(0, 10)})`).join("; ")}`);
  }
}
main().finally(() => prisma.$disconnect());
