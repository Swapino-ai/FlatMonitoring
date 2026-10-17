/** Diagnostika cash flow: po nemovitostech rozpad mesicniho prumeru a jednotlive toky v okne. Jen cte. */
import { PrismaClient } from "@prisma/client";
import { nactiNavrhPlatby } from "../src/lib/pravidelnePlatbyData";
import { prumernyMesicniTok, tokyNemovitosti } from "../src/lib/series";

const prisma = new PrismaClient();
async function main() {
  const props = await prisma.property.findMany({ include: { transactions: true, leases: true, loans: true } });
  for (const p of props) {
    const navrh = await nactiNavrhPlatby(p.id);
    const toky = tokyNemovitosti(navrh, p.transactions);
    const pr = prumernyMesicniTok(toky);
    console.log(`\n=== ${p.name} === průměr ${pr?.mesicne.toFixed(0)} Kč/měs za ${pr?.mesicu} měs.`);
    console.log("  rozpad:", JSON.stringify(Object.fromEntries(Object.entries(pr?.rozpad ?? {}).map(([k, v]) => [k, Math.round(v)]))));
    console.log("  smlouvy:", p.leases.map((l) => `${l.tenantName} ${l.startDate.toISOString().slice(0, 10)}–${l.endDate?.toISOString().slice(0, 10) ?? "…"} nájem ${l.rentMonthly} zálohy ${l.utilitiesMonthly} aktivní ${l.isActive}`).join(" | "));
    console.log("  úvěry:", p.loans.map((u) => `${u.lender} ${u.monthlyPayment}/měs od ${u.startDate.toISOString().slice(0, 10)} aktivní ${u.isActive}`).join(" | "));
    const souhrn = new Map<string, number>();
    for (const n of navrh) { const k = `${n.druh} ${n.mesic}`; souhrn.set(k, (souhrn.get(k) ?? 0) + (n.zaplaceno ? Math.sign(n.castka) * n.zaplaceno.castka : n.castka)); }
    const mesice = [...new Set(navrh.map((n) => n.mesic))].sort().slice(-13);
    for (const m of mesice) {
      const radek = ["NAJEM", "ZALOHA", "SLUZBA", "UVER", "VYUCTOVANI"].map((d) => `${d}=${Math.round(souhrn.get(`${d} ${m}`) ?? 0)}`).join(" ");
      console.log(`  ${m}: ${radek}`);
    }
    console.log("  pohyby:", p.transactions.map((t) => `${t.date.toISOString().slice(0, 10)} ${t.category} ${t.amount}`).join(" | "));
  }
}
main().finally(() => prisma.$disconnect());
