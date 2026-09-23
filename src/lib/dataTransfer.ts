/** Prenos vsech dat aplikace — zaloha i stehovani mezi databazemi. */

import { prisma } from "./db";

export interface Zaloha {
  verze: 1;
  vytvoreno: string;
  tabulky: Record<string, unknown[]>;
}

/** Poradi je dulezite pri obnove — nadrazene zaznamy musi byt driv. */
export async function exportujVse(): Promise<Zaloha> {
  return {
    verze: 1,
    vytvoreno: new Date().toISOString(),
    tabulky: {
      user: await prisma.user.findMany(),
      property: await prisma.property.findMany(),
      propertyOwner: await prisma.propertyOwner.findMany(),
      loan: await prisma.loan.findMany(),
      lease: await prisma.lease.findMany(),
      transaction: await prisma.transaction.findMany(),
      service: await prisma.service.findMany(),
      valuation: await prisma.valuation.findMany(),
      rentEstimate: await prisma.rentEstimate.findMany(),
      marketScan: await prisma.marketScan.findMany(),
      marketListing: await prisma.marketListing.findMany(),
      marketIndex: await prisma.marketIndex.findMany(),
      scanRun: await prisma.scanRun.findMany(),
    },
  };
}

export interface VysledekObnovy {
  obnoveno: Record<string, number>;
  smazano: boolean;
}

/**
 * Nahradi obsah databaze zalohou. Data prichazi od uzivatele, takze je
 * prevadime pres vlastni mapovani — nikdy nepredavame cizi objekt primo.
 */
export async function obnovVse(zaloha: Zaloha): Promise<VysledekObnovy> {
  if (zaloha?.verze !== 1) throw new Error("Neznámý formát zálohy.");
  const t = zaloha.tabulky ?? {};
  if (!Array.isArray(t.user) || t.user.length === 0) {
    throw new Error("Záloha neobsahuje žádného uživatele — po obnově by se nešlo přihlásit.");
  }

  const d = (v: unknown) => (v == null ? null : new Date(String(v)));
  const dPovinne = (v: unknown) => new Date(String(v));
  const c = (v: unknown, z = 0) => (typeof v === "number" ? v : Number(v ?? z) || z);
  const s = (v: unknown) => (v == null ? null : String(v));

  return prisma.$transaction(async (tx) => {
    // Mazani v opacnem poradi nez vkladani, kvuli cizim klicum
    await tx.marketListing.deleteMany();
    await tx.marketScan.deleteMany();
    await tx.marketIndex.deleteMany();
    await tx.scanRun.deleteMany();
    await tx.rentEstimate.deleteMany();
    await tx.valuation.deleteMany();
    await tx.propertyOwner.deleteMany();
    await tx.service.deleteMany();
    await tx.transaction.deleteMany();
    await tx.lease.deleteMany();
    await tx.loan.deleteMany();
    await tx.property.deleteMany();
    await tx.user.deleteMany();

    const obnoveno: Record<string, number> = {};

    const users = (t.user as any[]).map((x) => ({
      id: String(x.id), email: String(x.email).toLowerCase(), name: String(x.name),
      passwordHash: String(x.passwordHash), role: x.role === "OWNER" ? "OWNER" : "PARTNER",
      createdAt: dPovinne(x.createdAt ?? new Date()),
    }));
    obnoveno.user = (await tx.user.createMany({ data: users })).count;

    const properties = (t.property as any[] ?? []).map((x) => ({
      id: String(x.id), type: String(x.type ?? "BYT"),
      name: String(x.name), street: String(x.street), city: String(x.city),
      zip: String(x.zip), district: s(x.district), country: String(x.country ?? "CZ"),
      latitude: x.latitude == null ? null : c(x.latitude),
      longitude: x.longitude == null ? null : c(x.longitude),
      region: s(x.region),
      disposition: s(x.disposition), areaM2: c(x.areaM2),
      floor: x.floor == null ? null : Math.round(c(x.floor)),
      hasBalcony: !!x.hasBalcony, hasCellar: !!x.hasCellar, hasParking: !!x.hasParking,
      buildYear: x.buildYear == null ? null : Math.round(c(x.buildYear)),
      cadastralNo: s(x.cadastralNo),
      purchaseDate: dPovinne(x.purchaseDate), purchasePrice: c(x.purchasePrice),
      acquisitionCosts: c(x.acquisitionCosts), renovationCosts: c(x.renovationCosts),
      landShareValue: c(x.landShareValue),
      depreciationGroup: Math.round(c(x.depreciationGroup, 5)),
      depreciationMethod: x.depreciationMethod === "ACCELERATED" ? "ACCELERATED" : "STRAIGHT",
      depreciationStart: x.depreciationStart == null ? null : Math.round(c(x.depreciationStart)),
      status: String(x.status ?? "RENTED"),
      saleDate: d(x.saleDate), salePrice: x.salePrice == null ? null : c(x.salePrice),
      notes: s(x.notes),
    }));
    if (properties.length) obnoveno.property = (await tx.property.createMany({ data: properties })).count;

    const owners = (t.propertyOwner as any[] ?? []).map((x) => ({
      id: String(x.id), propertyId: String(x.propertyId), userId: String(x.userId),
      share: c(x.share, 100), note: s(x.note), createdAt: dPovinne(x.createdAt ?? new Date()),
    }));
    if (owners.length) obnoveno.propertyOwner = (await tx.propertyOwner.createMany({ data: owners })).count;

    const loans = (t.loan as any[] ?? []).map((x) => ({
      id: String(x.id), propertyId: String(x.propertyId),
      type: String(x.type ?? "HYPOTEKA_NA_BYDLENI"), lender: String(x.lender),
      contractNo: s(x.contractNo), principal: c(x.principal), interestRate: c(x.interestRate),
      startDate: dPovinne(x.startDate), termMonths: Math.round(c(x.termMonths)),
      fixationEnd: d(x.fixationEnd), monthlyPayment: c(x.monthlyPayment),
      currentBalance: c(x.currentBalance), balanceAsOf: dPovinne(x.balanceAsOf ?? new Date()),
      isActive: x.isActive !== false, notes: s(x.notes),
    }));
    if (loans.length) obnoveno.loan = (await tx.loan.createMany({ data: loans })).count;

    const leases = (t.lease as any[] ?? []).map((x) => ({
      id: String(x.id), propertyId: String(x.propertyId), tenantName: String(x.tenantName),
      tenantEmail: s(x.tenantEmail), tenantPhone: s(x.tenantPhone),
      startDate: dPovinne(x.startDate), endDate: d(x.endDate),
      rentMonthly: c(x.rentMonthly), utilitiesMonthly: c(x.utilitiesMonthly), deposit: c(x.deposit),
      indexationClause: !!x.indexationClause, paymentDay: Math.round(c(x.paymentDay, 15)),
      isActive: x.isActive !== false, notes: s(x.notes),
    }));
    if (leases.length) obnoveno.lease = (await tx.lease.createMany({ data: leases })).count;

    const transactions = (t.transaction as any[] ?? []).map((x) => ({
      id: String(x.id), propertyId: String(x.propertyId), date: dPovinne(x.date),
      amount: c(x.amount), category: String(x.category),
      description: s(x.description), taxTreatment: String(x.taxTreatment ?? "EXPENSE_DEDUCTIBLE"),
      isRecurring: !!x.isRecurring, documentRef: s(x.documentRef),
    }));
    if (transactions.length) obnoveno.transaction = (await tx.transaction.createMany({ data: transactions })).count;

    const services = (t.service as any[] ?? []).map((x) => ({
      id: String(x.id), propertyId: String(x.propertyId), type: String(x.type),
      provider: String(x.provider), contractNo: s(x.contractNo),
      monthlyCost: c(x.monthlyCost), annualCost: x.annualCost == null ? null : c(x.annualCost),
      contractStart: d(x.contractStart), contractEnd: d(x.contractEnd),
      noticePeriodMonths: Math.round(c(x.noticePeriodMonths)),
      isBundleable: x.isBundleable !== false, notes: s(x.notes),
    }));
    if (services.length) obnoveno.service = (await tx.service.createMany({ data: services })).count;

    const valuations = (t.valuation as any[] ?? []).map((x) => ({
      id: String(x.id), propertyId: String(x.propertyId), date: dPovinne(x.date),
      value: c(x.value), pricePerM2: x.pricePerM2 == null ? null : c(x.pricePerM2),
      source: String(x.source), confidence: s(x.confidence),
      sampleSize: x.sampleSize == null ? null : Math.round(c(x.sampleSize)),
      comparables: x.comparables ?? undefined, notes: s(x.notes),
    }));
    if (valuations.length) obnoveno.valuation = (await tx.valuation.createMany({ data: valuations })).count;

    const rentEstimates = (t.rentEstimate as any[] ?? []).map((x) => ({
      id: String(x.id), propertyId: String(x.propertyId), date: dPovinne(x.date),
      monthlyRent: c(x.monthlyRent),
      rentPerM2: x.rentPerM2 == null ? null : c(x.rentPerM2),
      p25: x.p25 == null ? null : c(x.p25),
      p75: x.p75 == null ? null : c(x.p75),
      source: String(x.source), confidence: s(x.confidence),
      sampleSize: x.sampleSize == null ? null : Math.round(c(x.sampleSize)),
      comparables: x.comparables ?? undefined, notes: s(x.notes),
    }));
    if (rentEstimates.length) obnoveno.rentEstimate = (await tx.rentEstimate.createMany({ data: rentEstimates })).count;

    // Denik nema cizi klice, muze se obnovit az nakonec
    const behy = (t.scanRun as any[] ?? []).map((x) => ({
      id: String(x.id), startedAt: dPovinne(x.startedAt),
      finishedAt: d(x.finishedAt), trigger: String(x.trigger), dealType: String(x.dealType),
      propertyId: s(x.propertyId), propertyName: String(x.propertyName),
      city: String(x.city), category: String(x.category), status: String(x.status),
      listingsFound: Math.round(c(x.listingsFound)),
      okruhKm: x.okruhKm == null ? null : c(x.okruhKm),
      result: s(x.result), message: s(x.message),
    }));
    if (behy.length) obnoveno.scanRun = (await tx.scanRun.createMany({ data: behy })).count;

    return { obnoveno, smazano: true };
  }, { timeout: 120_000 });
}
