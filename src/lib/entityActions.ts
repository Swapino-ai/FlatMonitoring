"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "./db";
import { getSession } from "./auth";
import { annuityPayment, balanceAt } from "./finance";

export interface EntityFormState {
  error?: string;
  success?: string;
}

/** Cislo z formulare: zvlada mezery v tisicich i desetinnou carku. */
const cislo = (vychozi = 0) =>
  z.preprocess((v) => {
    const s = String(v ?? "").replace(/[\s ]/g, "").replace(",", ".");
    if (s === "") return vychozi;
    const n = Number(s);
    return Number.isFinite(n) ? n : vychozi;
  }, z.number());

const cisloNeboNic = z.preprocess((v) => {
  const s = String(v ?? "").replace(/[\s ]/g, "").replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}, z.number().nullable());

const textNeboNic = z.preprocess((v) => (v === "" || v == null ? null : String(v).trim()), z.string().nullable());
const datumNeboNic = z.preprocess((v) => (v === "" || v == null ? null : String(v)), z.string().nullable());

async function majitel(): Promise<{ ok: true } | { error: string }> {
  const user = await getSession();
  if (!user) return { error: "Nejsi přihlášen." };
  if (user.role !== "OWNER") return { error: "Tuhle změnu může provést jen majitel." };
  return { ok: true };
}

function obnov(propertyId: string) {
  revalidatePath(`/properties/${propertyId}`);
  revalidatePath("/properties");
  revalidatePath("/");
  revalidatePath("/cashflow");
  revalidatePath("/savings");
}

// --- Úvěry ---

const uverSchema = z.object({
  propertyId: z.string().min(1),
  type: z.string().min(1),
  lender: z.string().min(1, "Zadej banku nebo věřitele."),
  contractNo: textNeboNic,
  principal: cislo().refine((v) => v > 0, "Půjčená jistina musí být větší než nula."),
  interestRate: cislo().refine((v) => v >= 0 && v < 100, "Úroková sazba musí být mezi 0 a 100 %."),
  startDate: z.string().min(1, "Zadej datum čerpání."),
  termMonths: cislo().refine((v) => v > 0 && v <= 600, "Splatnost zadej v měsících (1–600)."),
  fixationEnd: datumNeboNic,
  monthlyPayment: cisloNeboNic,
  notes: textNeboNic,
});

export async function saveLoan(id: string | null, _prev: EntityFormState, formData: FormData): Promise<EntityFormState> {
  const auth = await majitel();
  if ("error" in auth) return auth;

  const parsed = uverSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  // Splatku necháme dopocitat, kdyz ji uzivatel nevyplni — anuita ze zadanych parametru
  const splatka = d.monthlyPayment && d.monthlyPayment > 0
    ? d.monthlyPayment
    : Math.round(annuityPayment(d.principal, d.interestRate, d.termMonths));

  const zaklad = {
    type: d.type,
    lender: d.lender,
    contractNo: d.contractNo,
    principal: d.principal,
    interestRate: d.interestRate,
    startDate: new Date(d.startDate),
    termMonths: Math.round(d.termMonths),
    fixationEnd: d.fixationEnd ? new Date(d.fixationEnd) : null,
    monthlyPayment: splatka,
    notes: d.notes,
  };

  const zustatek = Math.round(
    balanceAt({ ...zaklad, startDate: zaklad.startDate, monthlyPayment: splatka }, new Date()),
  );

  if (id) {
    await prisma.loan.update({ where: { id }, data: { ...zaklad, currentBalance: zustatek, balanceAsOf: new Date() } });
  } else {
    await prisma.loan.create({
      data: { ...zaklad, propertyId: d.propertyId, currentBalance: zustatek, balanceAsOf: new Date(), isActive: true },
    });
  }

  obnov(d.propertyId);
  return { success: id ? "Úvěr upraven." : `Úvěr uložen, měsíční splátka ${splatka.toLocaleString("cs-CZ")} Kč.` };
}

export async function deleteLoan(_prev: EntityFormState, formData: FormData): Promise<EntityFormState> {
  const auth = await majitel();
  if ("error" in auth) return auth;

  const loan = await prisma.loan.findUnique({ where: { id: String(formData.get("id")) } });
  if (!loan) return { error: "Úvěr neexistuje." };

  await prisma.loan.delete({ where: { id: loan.id } });
  obnov(loan.propertyId);
  return { success: "Úvěr smazán." };
}

// --- Nájemní smlouvy ---

const najemSchema = z.object({
  propertyId: z.string().min(1),
  tenantName: z.string().min(1, "Zadej jméno nájemce."),
  tenantEmail: textNeboNic,
  tenantPhone: textNeboNic,
  startDate: z.string().min(1, "Zadej začátek nájmu."),
  endDate: datumNeboNic,
  rentMonthly: cislo().refine((v) => v > 0, "Nájemné musí být větší než nula."),
  utilitiesMonthly: cislo(),
  deposit: cislo(),
  paymentDay: cislo(15).refine((v) => v >= 1 && v <= 28, "Den splatnosti zadej 1–28."),
  indexationClause: z.preprocess((v) => v === "on" || v === true, z.boolean()),
  isActive: z.preprocess((v) => v === "on" || v === true, z.boolean()),
  notes: textNeboNic,
});

export async function saveLease(id: string | null, _prev: EntityFormState, formData: FormData): Promise<EntityFormState> {
  const auth = await majitel();
  if ("error" in auth) return auth;

  const parsed = najemSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  const data = {
    tenantName: d.tenantName,
    tenantEmail: d.tenantEmail,
    tenantPhone: d.tenantPhone,
    startDate: new Date(d.startDate),
    endDate: d.endDate ? new Date(d.endDate) : null,
    rentMonthly: d.rentMonthly,
    utilitiesMonthly: d.utilitiesMonthly,
    deposit: d.deposit,
    paymentDay: Math.round(d.paymentDay),
    indexationClause: d.indexationClause,
    isActive: d.isActive,
    notes: d.notes,
  };

  if (id) {
    await prisma.lease.update({ where: { id }, data });
  } else {
    // Vyhodnoceni vynosu pracuje s jednou platnou smlouvou — starou proto deaktivujeme
    if (d.isActive) {
      await prisma.lease.updateMany({ where: { propertyId: d.propertyId, isActive: true }, data: { isActive: false } });
    }
    await prisma.lease.create({ data: { ...data, propertyId: d.propertyId } });
  }

  obnov(d.propertyId);
  return { success: id ? "Smlouva upravena." : "Smlouva uložena." };
}

export async function deleteLease(_prev: EntityFormState, formData: FormData): Promise<EntityFormState> {
  const auth = await majitel();
  if ("error" in auth) return auth;

  const lease = await prisma.lease.findUnique({ where: { id: String(formData.get("id")) } });
  if (!lease) return { error: "Smlouva neexistuje." };

  await prisma.lease.delete({ where: { id: lease.id } });
  obnov(lease.propertyId);
  return { success: "Smlouva smazána." };
}

// --- Služby a dodavatelé ---

const sluzbaSchema = z.object({
  propertyId: z.string().min(1),
  type: z.string().min(1),
  provider: z.string().min(1, "Zadej dodavatele."),
  contractNo: textNeboNic,
  monthlyCost: cislo(),
  annualCost: cisloNeboNic,
  contractEnd: datumNeboNic,
  noticePeriodMonths: cislo(),
  isBundleable: z.preprocess((v) => v === "on" || v === true, z.boolean()),
  notes: textNeboNic,
});

export async function saveService(id: string | null, _prev: EntityFormState, formData: FormData): Promise<EntityFormState> {
  const auth = await majitel();
  if ("error" in auth) return auth;

  const parsed = sluzbaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  if (d.monthlyCost <= 0 && !d.annualCost) {
    return { error: "Vyplň měsíční nebo roční náklad." };
  }

  const data = {
    type: d.type,
    provider: d.provider,
    contractNo: d.contractNo,
    monthlyCost: d.monthlyCost,
    annualCost: d.annualCost,
    contractEnd: d.contractEnd ? new Date(d.contractEnd) : null,
    noticePeriodMonths: Math.round(d.noticePeriodMonths),
    isBundleable: d.isBundleable,
    notes: d.notes,
  };

  if (id) {
    await prisma.service.update({ where: { id }, data });
  } else {
    await prisma.service.create({ data: { ...data, propertyId: d.propertyId } });
  }

  obnov(d.propertyId);
  return { success: id ? "Služba upravena." : "Služba uložena." };
}

export async function deleteService(_prev: EntityFormState, formData: FormData): Promise<EntityFormState> {
  const auth = await majitel();
  if ("error" in auth) return auth;

  const service = await prisma.service.findUnique({ where: { id: String(formData.get("id")) } });
  if (!service) return { error: "Služba neexistuje." };

  await prisma.service.delete({ where: { id: service.id } });
  obnov(service.propertyId);
  return { success: "Služba smazána." };
}

// --- Pohyby ---

const pohybSchema = z.object({
  propertyId: z.string().min(1),
  date: z.string().min(1, "Zadej datum."),
  category: z.string().min(1),
  amount: cislo().refine((v) => v !== 0, "Částka nesmí být nula."),
  description: textNeboNic,
  documentRef: textNeboNic,
});

export async function saveTransaction(_prev: EntityFormState, formData: FormData): Promise<EntityFormState> {
  const auth = await majitel();
  if ("error" in auth) return auth;

  const parsed = pohybSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  const { CATEGORY_MAP } = await import("./categories");
  const kategorie = CATEGORY_MAP.get(d.category);
  if (!kategorie) return { error: "Neznámá kategorie." };

  // Znamenko urcuje kategorie, ne uzivatel — vydaje se ukladaji zaporne
  const castka = kategorie.kind === "EXPENSE" ? -Math.abs(d.amount) : Math.abs(d.amount);

  await prisma.transaction.create({
    data: {
      propertyId: d.propertyId,
      date: new Date(d.date),
      amount: castka,
      category: d.category,
      taxTreatment: kategorie.defaultTaxTreatment,
      description: d.description,
      documentRef: d.documentRef,
    },
  });

  obnov(d.propertyId);
  return { success: "Pohyb zaúčtován." };
}

export async function deleteTransaction(_prev: EntityFormState, formData: FormData): Promise<EntityFormState> {
  const auth = await majitel();
  if ("error" in auth) return auth;

  const tx = await prisma.transaction.findUnique({ where: { id: String(formData.get("id")) } });
  if (!tx) return { error: "Pohyb neexistuje." };

  await prisma.transaction.delete({ where: { id: tx.id } });
  obnov(tx.propertyId);
  return { success: "Pohyb smazán." };
}


// --- Spoluvlastníci ---

const vlastnikSchema = z.object({
  propertyId: z.string().min(1),
  userId: z.string().min(1, "Vyber uživatele."),
  share: cislo().refine((v) => v > 0 && v <= 100, "Podíl musí být mezi 0 a 100 %."),
  note: textNeboNic,
});

export async function saveOwner(_prev: EntityFormState, formData: FormData): Promise<EntityFormState> {
  const auth = await majitel();
  if ("error" in auth) return auth;

  const parsed = vlastnikSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  const stavajici = await prisma.propertyOwner.findMany({ where: { propertyId: d.propertyId } });
  const bezTohoto = stavajici.filter((o) => o.userId !== d.userId);
  const soucet = bezTohoto.reduce((a, o) => a + o.share, 0) + d.share;

  // Přes sto procent by portfolio nafouklo majetek, který neexistuje
  if (soucet > 100.01) {
    const zbyva = Math.round((100 - bezTohoto.reduce((a, o) => a + o.share, 0)) * 100) / 100;
    return { error: `Součet podílů by byl ${Math.round(soucet * 100) / 100} %. Zbývá nejvýš ${zbyva} %.` };
  }

  await prisma.propertyOwner.upsert({
    where: { propertyId_userId: { propertyId: d.propertyId, userId: d.userId } },
    create: { propertyId: d.propertyId, userId: d.userId, share: d.share, note: d.note },
    update: { share: d.share, note: d.note },
  });

  obnov(d.propertyId);
  return { success: `Podíl uložen. Celkem přiřazeno ${Math.round(soucet * 100) / 100} % bytu.` };
}

export async function deleteOwner(_prev: EntityFormState, formData: FormData): Promise<EntityFormState> {
  const auth = await majitel();
  if ("error" in auth) return auth;

  const o = await prisma.propertyOwner.findUnique({ where: { id: String(formData.get("id")) } });
  if (!o) return { error: "Podíl neexistuje." };

  await prisma.propertyOwner.delete({ where: { id: o.id } });
  obnov(o.propertyId);
  return { success: "Podíl odebrán." };
}
