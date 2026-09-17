/**
 * Ukazkova data — tri byty v ruznych situacich, aby byly videt vsechny stavy aplikace.
 * Spusteni: npm run db:seed
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { annuityPayment, loanYearBreakdown } from "../src/lib/finance";

const prisma = new PrismaClient();

async function main() {
  await prisma.marketListing.deleteMany();
  await prisma.marketScan.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.valuation.deleteMany();
  await prisma.service.deleteMany();
  await prisma.lease.deleteMany();
  await prisma.loan.deleteMany();
  await prisma.property.deleteMany();
  await prisma.user.deleteMany();

  await prisma.user.createMany({
    data: [
      { email: "majitel@example.com", name: "Majitel", role: "OWNER", passwordHash: await bcrypt.hash("heslo123", 10) },
      { email: "partner@example.com", name: "Obchodní partner", role: "PARTNER", passwordHash: await bcrypt.hash("heslo123", 10) },
    ],
  });

  const today = new Date();

  // --- Byt 1: Vinohrady, na hypoteku, pronajaty ---
  const vinohrady = await prisma.property.create({
    data: {
      name: "Vinohrady 2+kk",
      street: "Slezská 1234/12", city: "Praha", zip: "12000", district: "Praha 2 - Vinohrady",
      disposition: "2+kk", areaM2: 54, floor: 3, hasBalcony: true, hasCellar: true, buildYear: 1928,
      purchaseDate: new Date("2019-06-15"),
      purchasePrice: 6_450_000, acquisitionCosts: 310_000, renovationCosts: 420_000, landShareValue: 580_000,
      depreciationGroup: 5, depreciationMethod: "STRAIGHT", depreciationStart: 2019,
      status: "RENTED",
      notes: "Cihlový dům, po revitalizaci fasády 2021. Silná lokalita, nízké riziko neobsazenosti.",
    },
  });

  // --- Byt 2: Brno, bez uveru, pronajaty ---
  const brno = await prisma.property.create({
    data: {
      name: "Brno Žabovřesky 3+1",
      street: "Horova 88", city: "Brno", zip: "61600", district: "Žabovřesky",
      disposition: "3+1", areaM2: 76, floor: 5, hasBalcony: true, hasParking: true, buildYear: 1975,
      purchaseDate: new Date("2021-09-01"),
      purchasePrice: 5_200_000, acquisitionCosts: 180_000, renovationCosts: 650_000, landShareValue: 340_000,
      depreciationGroup: 5, depreciationMethod: "STRAIGHT", depreciationStart: 2021,
      status: "RENTED",
      notes: "Panelový dům po zateplení. Koupeno bez úvěru z volných prostředků.",
    },
  });

  // --- Byt 3: Ostrava, vysoka pace, aktualne volny ---
  const ostrava = await prisma.property.create({
    data: {
      name: "Ostrava Poruba 1+kk",
      street: "Hlavní třída 500", city: "Ostrava", zip: "70800", district: "Poruba",
      disposition: "1+kk", areaM2: 32, floor: 2, buildYear: 1968,
      purchaseDate: new Date("2023-03-20"),
      purchasePrice: 1_850_000, acquisitionCosts: 95_000, renovationCosts: 280_000, landShareValue: 120_000,
      depreciationGroup: 5, depreciationMethod: "ACCELERATED", depreciationStart: 2023,
      status: "VACANT",
      notes: "Vysoký hrubý výnos, ale vyšší riziko neobsazenosti. Nájemník odešel v srpnu.",
    },
  });

  // --- Uvery ---
  const loan1Principal = 4_500_000;
  const loan1 = {
    propertyId: vinohrady.id, lender: "Česká spořitelna", contractNo: "HU-2019-88231",
    principal: loan1Principal, interestRate: 4.89,
    startDate: new Date("2019-06-15"), termMonths: 360,
    fixationEnd: new Date(today.getFullYear(), today.getMonth() + 5, 1),
    monthlyPayment: Math.round(annuityPayment(loan1Principal, 4.89, 360)),
    currentBalance: 0, isActive: true,
    notes: "Fixace končí — porovnat nabídky na refinancování.",
  };
  const loan2Principal = 1_400_000;
  const loan2 = {
    propertyId: ostrava.id, lender: "Komerční banka", contractNo: "HU-2023-44120",
    principal: loan2Principal, interestRate: 5.79,
    startDate: new Date("2023-03-20"), termMonths: 300,
    fixationEnd: new Date("2028-03-20"),
    monthlyPayment: Math.round(annuityPayment(loan2Principal, 5.79, 300)),
    currentBalance: 0, isActive: true,
  };
  await prisma.loan.createMany({ data: [loan1, loan2] });

  // --- Najemni smlouvy ---
  await prisma.lease.createMany({
    data: [
      {
        propertyId: vinohrady.id, tenantName: "Jana Nováková", tenantEmail: "novakova@example.com",
        startDate: new Date("2023-07-01"), rentMonthly: 24_500, utilitiesMonthly: 4_200, deposit: 49_000,
        indexationClause: true, paymentDay: 15, isActive: true,
      },
      {
        propertyId: brno.id, tenantName: "Petr Dvořák",
        startDate: new Date("2022-02-01"), rentMonthly: 19_800, utilitiesMonthly: 5_100, deposit: 39_600,
        indexationClause: true, paymentDay: 10, isActive: true,
      },
      {
        propertyId: ostrava.id, tenantName: "Marek Svoboda",
        startDate: new Date("2023-05-01"), endDate: new Date(today.getFullYear(), 7, 31),
        rentMonthly: 11_200, utilitiesMonthly: 3_400, deposit: 22_400, isActive: false,
      },
    ],
  });

  // --- Sluzby: zamerne roztristene, aby bylo videt kde se da usetrit ---
  await prisma.service.createMany({
    data: [
      { propertyId: vinohrady.id, type: "ELECTRICITY", provider: "ČEZ Prodej", monthlyCost: 1_850, contractEnd: new Date("2026-12-31"), noticePeriodMonths: 1 },
      { propertyId: vinohrady.id, type: "INSURANCE", provider: "Allianz", monthlyCost: 480, contractEnd: new Date("2027-05-31") },
      { propertyId: vinohrady.id, type: "SVJ_FEE", provider: "SVJ Slezská 1234", monthlyCost: 3_200, isBundleable: false },
      { propertyId: vinohrady.id, type: "INTERNET", provider: "O2", monthlyCost: 599 },

      { propertyId: brno.id, type: "ELECTRICITY", provider: "innogy", monthlyCost: 2_400 },
      { propertyId: brno.id, type: "GAS", provider: "innogy", monthlyCost: 1_900, contractEnd: new Date("2027-03-31") },
      { propertyId: brno.id, type: "INSURANCE", provider: "Kooperativa", monthlyCost: 610 },
      { propertyId: brno.id, type: "SVJ_FEE", provider: "SVJ Horova", monthlyCost: 4_100, isBundleable: false },
      { propertyId: brno.id, type: "INTERNET", provider: "Vodafone", monthlyCost: 749 },

      { propertyId: ostrava.id, type: "ELECTRICITY", provider: "ČEZ Prodej", monthlyCost: 1_100 },
      { propertyId: ostrava.id, type: "INSURANCE", provider: "Generali", monthlyCost: 390 },
      { propertyId: ostrava.id, type: "SVJ_FEE", provider: "SVJ Hlavní třída", monthlyCost: 2_450, isBundleable: false },
    ],
  });

  // --- Oceneni ---
  await prisma.valuation.createMany({
    data: [
      { propertyId: vinohrady.id, date: new Date("2022-06-01"), value: 8_100_000, pricePerM2: 150_000, source: "EXPERT", confidence: "HIGH" },
      { propertyId: vinohrady.id, date: new Date(today.getFullYear(), today.getMonth() - 1, 1), value: 9_180_000, pricePerM2: 170_000, source: "MARKET_SCAN", confidence: "MEDIUM", sampleSize: 18, notes: "Medián nabídkových cen srovnatelných bytů." },
      { propertyId: brno.id, date: new Date(today.getFullYear(), today.getMonth() - 1, 1), value: 7_220_000, pricePerM2: 95_000, source: "MARKET_SCAN", confidence: "MEDIUM", sampleSize: 12 },
      { propertyId: ostrava.id, date: new Date(today.getFullYear(), today.getMonth() - 1, 1), value: 2_400_000, pricePerM2: 75_000, source: "MARKET_SCAN", confidence: "LOW", sampleSize: 6 },
    ],
  });

  // --- Transakce za poslednich 24 mesicu ---
  const loans = await prisma.loan.findMany();
  const txs: any[] = [];

  for (let i = 23; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 15);
    const year = d.getFullYear();

    for (const [prop, rent, utilities, svj, insurance, energy] of [
      [vinohrady, 24_500, 4_200, 3_200, 480, 1_850],
      [brno, 19_800, 5_100, 4_100, 610, 4_300],
      [ostrava, 11_200, 3_400, 2_450, 390, 1_100],
    ] as const) {
      // Ostrava je od srpna volna
      const vacant = prop.id === ostrava.id && d >= new Date(today.getFullYear(), 7, 1);

      if (!vacant) {
        txs.push({ propertyId: prop.id, date: d, amount: rent, category: "RENT", taxTreatment: "INCOME_RENT", description: "Nájemné", isRecurring: true });
        txs.push({ propertyId: prop.id, date: d, amount: utilities, category: "UTILITIES_ADVANCE", taxTreatment: "PASS_THROUGH", description: "Zálohy na služby", isRecurring: true });
        txs.push({ propertyId: prop.id, date: d, amount: -utilities, category: "UTILITIES", taxTreatment: "PASS_THROUGH", description: "Úhrada služeb dodavatelům", isRecurring: true });
      } else {
        txs.push({ propertyId: prop.id, date: d, amount: -energy, category: "VACANCY_COST", taxTreatment: "EXPENSE_DEDUCTIBLE", description: "Energie při neobsazenosti" });
      }

      txs.push({ propertyId: prop.id, date: d, amount: -svj, category: "SVJ_FEE", taxTreatment: "EXPENSE_DEDUCTIBLE", description: "Příspěvek SVJ", isRecurring: true });
      txs.push({ propertyId: prop.id, date: d, amount: -insurance, category: "INSURANCE", taxTreatment: "EXPENSE_DEDUCTIBLE", description: "Pojištění", isRecurring: true });
    }

    // Splatky uveru — rozdelene na uroky a jistinu
    for (const l of loans) {
      const yb = loanYearBreakdown({ ...l, startDate: new Date(l.startDate) }, year);
      const monthlyInterest = yb.interest / 12;
      const monthlyPrincipal = yb.principal / 12;
      txs.push({ propertyId: l.propertyId, date: d, amount: -Math.round(monthlyInterest), category: "LOAN_INTEREST", taxTreatment: "EXPENSE_DEDUCTIBLE", description: `Úroky ${l.lender}`, isRecurring: true });
      txs.push({ propertyId: l.propertyId, date: d, amount: -Math.round(monthlyPrincipal), category: "LOAN_PRINCIPAL", taxTreatment: "LOAN_PRINCIPAL", description: `Splátka jistiny ${l.lender}`, isRecurring: true });
    }
  }

  // Nekolik jednorazovych polozek
  txs.push(
    { propertyId: vinohrady.id, date: new Date(today.getFullYear(), 2, 8), amount: -18_400, category: "REPAIR", taxTreatment: "EXPENSE_DEDUCTIBLE", description: "Výměna baterie a oprava odpadu", documentRef: "FA-2026-0312" },
    { propertyId: brno.id, date: new Date(today.getFullYear(), 4, 22), amount: -42_000, category: "REPAIR", taxTreatment: "EXPENSE_DEDUCTIBLE", description: "Malování a výměna podlahy v ložnici" },
    { propertyId: ostrava.id, date: new Date(today.getFullYear(), 8, 3), amount: -9_800, category: "BROKERAGE", taxTreatment: "EXPENSE_DEDUCTIBLE", description: "Inzerce a prohlídky po odchodu nájemníka" },
    { propertyId: vinohrady.id, date: new Date(today.getFullYear(), 4, 30), amount: -1_240, category: "PROPERTY_TAX", taxTreatment: "EXPENSE_DEDUCTIBLE", description: "Daň z nemovitých věcí" },
    { propertyId: brno.id, date: new Date(today.getFullYear(), 4, 30), amount: -1_580, category: "PROPERTY_TAX", taxTreatment: "EXPENSE_DEDUCTIBLE", description: "Daň z nemovitých věcí" },
  );

  await prisma.transaction.createMany({ data: txs });

  // Aktualizace zustatku uveru
  const { balanceAt } = await import("../src/lib/finance");
  for (const l of loans) {
    await prisma.loan.update({
      where: { id: l.id },
      data: { currentBalance: Math.round(balanceAt({ ...l, startDate: new Date(l.startDate) }, today)), balanceAsOf: today },
    });
  }

  console.log(`Hotovo: 3 nemovitosti, ${loans.length} úvěry, ${txs.length} transakcí, 2 uživatelé.`);
  console.log("Přihlášení: majitel@example.com / heslo123  ·  partner@example.com / heslo123");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
