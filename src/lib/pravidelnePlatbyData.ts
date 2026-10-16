import { prisma } from "./db";
import { nazevDruhu } from "./categories";
import { nactiTypySluzeb } from "./typySluzeb";
import { denISO } from "./format";
import { navrhniPlatby, type NavrzenaPlatba } from "./pravidelnePlatby";
import type { PolozkaZalohy } from "./zalohy";

/** Navrh pravidelnych plateb nemovitosti z dat v databazi (pocita server, klient jen zobrazuje). */
export async function nactiNavrhPlatby(propertyId: string): Promise<NavrzenaPlatba[]> {
  const [smlouvy, sluzby, pohyby, zaplaceno, typy] = await Promise.all([
    prisma.lease.findMany({ where: { propertyId }, include: { tenant: true, advanceChanges: { orderBy: { validFrom: "asc" } } } }),
    prisma.service.findMany({ where: { propertyId }, include: { costChanges: { orderBy: { validFrom: "asc" } } } }),
    prisma.transaction.findMany({ where: { propertyId, sourceKey: { not: null } }, select: { date: true, category: true, sourceKey: true, amount: true } }),
    prisma.pravidelnaPlatba.findMany({ where: { propertyId } }),
    nactiTypySluzeb(),
  ]);

  return navrhniPlatby({
    najmy: smlouvy.map((n) => ({
      id: n.id, nazev: n.tenant?.name ?? n.tenantName, od: denISO(n.startDate), do: n.endDate ? denISO(n.endDate) : null,
      utilitiesMonthly: n.utilitiesMonthly, rentMonthly: n.rentMonthly, paymentDay: n.paymentDay,
      historieZaloh: n.advanceChanges.map((z) => ({ validFrom: z.validFrom, amount: z.amount, items: z.items as PolozkaZalohy[] | null })),
    })),
    sluzby: sluzby.map((s) => ({
      id: s.id, type: s.type, provider: s.provider, nazevDruhu: nazevDruhu(typy, s.type),
      monthlyCost: s.monthlyCost, annualCost: s.annualCost, chargedToTenant: s.chargedToTenant,
      contractStart: s.contractStart ? denISO(s.contractStart) : null,
      historie: s.costChanges.map((z) => ({ validFrom: z.validFrom, monthlyCost: z.monthlyCost, annualCost: z.annualCost })),
    })),
    pohyby: pohyby.map((p) => ({ date: denISO(p.date), category: p.category, sourceKey: p.sourceKey, amount: p.amount })),
    zaplaceno: zaplaceno.map((z) => ({ klic: z.klic, datum: denISO(z.paidAt), castka: z.amount })),
    dnes: new Date().toISOString().slice(0, 10),
  });
}

export interface ZauctovanaPlatba {
  id: string;
  datum: string;
  popis: string;
  castka: number;
  mesic: string;
}

/** Pravidelne platby, ktere uz jsou zauctovane (maji klic) — k prehledu a pripadnemu smazani. */
export async function nactiZauctovanePlatby(propertyId: string): Promise<ZauctovanaPlatba[]> {
  const radky = await prisma.transaction.findMany({
    where: { propertyId, sourceKey: { not: null } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    select: { id: true, date: true, description: true, amount: true },
  });
  return radky.map((r) => ({
    id: r.id, datum: denISO(r.date), mesic: denISO(r.date).slice(0, 7), popis: r.description ?? "Pravidelná platba", castka: r.amount,
  }));
}
