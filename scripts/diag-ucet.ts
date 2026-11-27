/** Diagnostika Stavu uctu nemovitosti: z ceho se skladaji prijmy a vydaje (jen cte). NEMOVITOST = cast nazvu. */
import { PrismaClient } from "@prisma/client";
import { nactiNavrhPlatby } from "../src/lib/pravidelnePlatbyData";

const prisma = new PrismaClient();
const NAZEV = (process.env.NEMOVITOST || "apartmán").toLowerCase();
const kc = (n: number) => `${Math.round(n).toLocaleString("cs-CZ")} Kč`;

async function main() {
  const p = (await prisma.property.findMany()).find((x) => x.name.toLowerCase().includes(NAZEV));
  if (!p) { console.log("Nemovitost nenalezena"); return; }
  console.log(`${p.name}\n`);
  const tx = await prisma.transaction.findMany({ where: { propertyId: p.id }, orderBy: { date: "asc" } });
  console.log(`POHYBY (Transaction) — ${tx.length}:`);
  for (const t of tx) console.log(`  ${t.date.toISOString().slice(0, 10)}  ${kc(t.amount).padStart(12)}  ${t.category.padEnd(18)} ${t.sourceKey ?? "-"}  ${t.description ?? ""}${t.proplacenoPohybId ? " [proplaceno]" : ""}`);
  const navrh = await nactiNavrhPlatby(p.id);
  const evid = navrh.filter((x) => x.zaplaceno?.zdroj === "EVIDENCE");
  console.log(`\nZAPLACENÉ PŘEDPISY (evidence, započtené navíc k pohybům) — ${evid.length}:`);
  for (const x of evid) console.log(`  ${x.zaplaceno!.datum}  ${kc((x.castka >= 0 ? 1 : -1) * x.zaplaceno!.castka).padStart(12)}  ${x.druh.padEnd(10)} ${x.klic}${x.zaplaceno!.zBanky ? " [z banky]" : ""}  ${x.popis}`);
  const nez = navrh.filter((x) => x.stav === "nezaplaceno");
  console.log(`\nNEZAPLACENÉ PŘEDPISY — ${nez.length}:`);
  for (const x of nez) console.log(`  ${x.datum}  ${kc(x.castka).padStart(12)}  ${x.druh.padEnd(10)} ${x.skupina.nazev} · ${x.popis}`);
  const banka = await prisma.bankovniPohyb.findMany({ where: { propertyId: p.id }, orderBy: { datum: "asc" } });
  console.log(`\nBANKA (pohyby přiřazené k nemovitosti) — ${banka.length}:`);
  for (const b of banka) console.log(`  ${b.datum.toISOString().slice(0, 10)}  ${kc(b.castka).padStart(12)}  ${b.stav.padEnd(11)} ${JSON.stringify(b.parovani)?.slice(0, 120)}  ${b.nazevProtiuctu ?? ""}`);
  const kt = await prisma.kratkodobeObdobi.findMany({ where: { propertyId: p.id } });
  console.log(`\nKRÁTKODOBÁ OBDOBÍ: ${kt.map((o) => `${o.od.toISOString().slice(0, 10)}–${o.do?.toISOString().slice(0, 10) ?? "dosud"}`).join(", ") || "žádná"}`);
  const sluzby = await prisma.service.findMany({ where: { propertyId: p.id }, select: { type: true, provider: true, monthlyCost: true, contractStart: true, activeTo: true } });
  console.log(`SLUŽBY: ${sluzby.map((s) => `${s.type}/${s.provider} ${s.monthlyCost} od ${s.contractStart?.toISOString().slice(0, 10)}`).join("; ")}`);
  const users = new Map((await prisma.user.findMany({ select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const owners = await prisma.propertyOwner.findMany({ where: { propertyId: p.id } });
  console.log(`\nVLASTNÍCI BYTU: ${owners.map((o) => `${users.get(o.userId)} ${o.share} %`).join(", ") || "nezadáni (= 100 % každý)"}`);
  for (const l of await prisma.loan.findMany({ where: { propertyId: p.id }, include: { vlastnici: true } })) {
    console.log(`ÚVĚR ${l.lender} ${l.monthlyPayment} Kč/měs., aktivní ${l.isActive}, vlastníci úvěru: ${l.vlastnici.map((v) => users.get(v.userId)).join(", ") || "NEZADÁNI (dělí se podle podílů na bytě)"}`);
  }
  const prijmy = [...tx.map((t) => t.amount), ...evid.map((x) => (x.castka >= 0 ? 1 : -1) * x.zaplaceno!.castka)];
  console.log(`\nSOUČET: příjmy ${kc(prijmy.filter((x) => x > 0).reduce((a, x) => a + x, 0))}, výdaje ${kc(-prijmy.filter((x) => x < 0).reduce((a, x) => a + x, 0))}`);
}
main().finally(() => prisma.$disconnect());
