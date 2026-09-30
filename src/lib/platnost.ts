import { prisma } from "./db";
import { platnyKDatu } from "./zalohy";

/**
 * Sloupce `monthlyCost` a `utilitiesMonthly` drzi hodnotu platnou dnes. Kdyz
 * je zapsana zmena s datem v budoucnosti, musi se hodnota prepnout v den
 * nastupu — bez planovace to delame pri nacteni stranek. Idempotentni a levne:
 * sahne jen na radky, kde se hodnota skutecne lisi.
 */
export async function srovnejPlatnost(): Promise<void> {
  const dnes = new Date();

  const sluzby = await prisma.service.findMany({
    where: { costChanges: { some: {} } },
    select: { id: true, monthlyCost: true, annualCost: true, costChanges: true },
  });
  for (const s of sluzby) {
    const z = platnyKDatu(s.costChanges, dnes);
    if (z && (z.monthlyCost !== s.monthlyCost || (z.annualCost ?? null) !== (s.annualCost ?? null))) {
      await prisma.service.update({ where: { id: s.id }, data: { monthlyCost: z.monthlyCost, annualCost: z.annualCost } });
    }
  }

  const smlouvy = await prisma.lease.findMany({
    where: { advanceChanges: { some: {} } },
    select: { id: true, utilitiesMonthly: true, advanceChanges: true },
  });
  for (const l of smlouvy) {
    const z = platnyKDatu(l.advanceChanges, dnes);
    if (z && z.amount !== l.utilitiesMonthly) {
      await prisma.lease.update({ where: { id: l.id }, data: { utilitiesMonthly: z.amount } });
    }
  }
}
