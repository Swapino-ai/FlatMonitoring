import { prisma } from "./db";
import { platnyKDatu } from "./zalohy";
import { zajistiNajemce } from "./najemci";

/**
 * Sloupce `monthlyCost` a `utilitiesMonthly` drzi hodnotu platnou dnes. Kdyz
 * je zapsana zmena s datem v budoucnosti, musi se hodnota prepnout v den
 * nastupu — bez planovace to delame pri nacteni stranek. Idempotentni a levne:
 * sahne jen na radky, kde se hodnota skutecne lisi.
 */
export async function srovnejPlatnost(): Promise<void> {
  const dnes = new Date();

  // Ctyri nezavisle dotazy najednou; zapisy se delaji jen tam, kde se hodnota opravdu lisi
  const [, sluzby, smlouvy] = await Promise.all([
    zajistiNajemce(),
    prisma.service.findMany({
      where: { costChanges: { some: {} } },
      select: { id: true, monthlyCost: true, annualCost: true, costChanges: true },
    }),
    prisma.lease.findMany({
      where: { advanceChanges: { some: {} } },
      select: { id: true, utilitiesMonthly: true, advanceChanges: true },
    }),
  ]);

  const zapisy: Promise<unknown>[] = [];
  for (const s of sluzby) {
    const z = platnyKDatu(s.costChanges, dnes);
    if (z && (z.monthlyCost !== s.monthlyCost || (z.annualCost ?? null) !== (s.annualCost ?? null))) {
      zapisy.push(prisma.service.update({ where: { id: s.id }, data: { monthlyCost: z.monthlyCost, annualCost: z.annualCost } }));
    }
  }
  for (const l of smlouvy) {
    const z = platnyKDatu(l.advanceChanges, dnes);
    if (z && z.amount !== l.utilitiesMonthly) {
      zapisy.push(prisma.lease.update({ where: { id: l.id }, data: { utilitiesMonthly: z.amount } }));
    }
  }
  await Promise.all(zapisy);
}
