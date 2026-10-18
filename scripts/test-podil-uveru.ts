/** Kontrola: dluh se v pohledu "muj podil" deli podle vlastniku uveru, ne podle podilu na nemovitosti. */
import { analyzeProperty, type PropertyWithRelations } from "../src/lib/portfolio";
import { podilNaUveru } from "../src/lib/ownership";

const uver = (vlastnici: string[]) => ({
  id: "u1", propertyId: "p", type: "HYPOTEKA_NA_BYDLENI", lender: "Banka", contractNo: null,
  principal: 2_000_000, interestRate: 5, startDate: new Date("2024-01-01"), termMonths: 360, fixationEnd: null,
  monthlyPayment: 10_737, currentBalance: 1_950_000, balanceAsOf: new Date(), isActive: true, notes: null,
  createdAt: new Date(), updatedAt: new Date(), vlastnici: vlastnici.map((userId) => ({ userId, user: { name: userId } })),
});
const byt = (vlastnici: string[]) => ({
  id: "p", purchasePrice: 4_000_000, acquisitionCosts: 0, renovationCosts: 0, purchaseDate: new Date("2024-01-01"),
  type: "BYT", depreciationGroup: 5, depreciationMethod: "STRAIGHT", depreciationStart: null,
  loans: [uver(vlastnici)], leases: [], services: [], transactions: [],
  valuations: [{ value: 5_000_000, source: "MANUAL" }],
  owners: [{ userId: "ja", share: 50 }, { userId: "ona", share: 50 }],
}) as unknown as PropertyWithRelations;

let chyby = 0;
const over = (popis: string, ok: boolean) => { console.log(`${ok ? "✓" : "✗"} ${popis}`); if (!ok) chyby++; };
const pro = (vlastnici: string[], userId: string) => {
  const p = byt(vlastnici);
  return analyzeProperty(p, new Date("2026-10-18"), 0.5, (l) => podilNaUveru("moje", l, p.owners, userId));
};
const cely = analyzeProperty(byt([]), new Date("2026-10-18"));
const muj = pro(["ja"], "ja");
const jeji = pro(["ja"], "ona");
const spolecny = pro(["ja", "ona"], "ja");
const bezVlastnika = pro([], "ja");
over(`muj uver: cely dluh u mne (${Math.round(muj.currentDebt)} = ${Math.round(cely.currentDebt)})`, Math.abs(muj.currentDebt - cely.currentDebt) < 1);
over(`muj uver: hodnota jen polovina (${muj.currentValue})`, muj.currentValue === 2_500_000);
over(`spoluvlastnice bez uveru: dluh 0 (${jeji.currentDebt})`, jeji.currentDebt === 0);
over("spolecny uver: polovina dluhu", Math.abs(spolecny.currentDebt - cely.currentDebt / 2) < 1);
over("uver bez vlastnika: podle podilu na nemovitosti", Math.abs(bezVlastnika.currentDebt - cely.currentDebt / 2) < 1);
over("soucet dluhu obou = celek", Math.abs(muj.currentDebt + jeji.currentDebt - cely.currentDebt) < 1);
over("soucet vlastniho kapitalu obou = celek", Math.abs(muj.metrics.equity + jeji.metrics.equity - cely.metrics.equity) < 1);
over("soucet cash flow obou = celek", Math.abs(muj.metrics.cashFlowAnnual + jeji.metrics.cashFlowAnnual - cely.metrics.cashFlowAnnual) < 1);
over("splatky: muj podil 1, jeji 0", muj.podilSplatek === 1 && jeji.podilSplatek === 0);
console.log(chyby ? `${chyby} chyb` : "vše v pořádku");
process.exit(chyby ? 1 : 0);
