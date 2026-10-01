"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "./db";
import { getSession } from "./auth";
import { annuityPayment, balanceAt } from "./finance";
import { zkontrolujUcet } from "./ucet";
import { Prisma } from "@prisma/client";
import { synchronizujSmlouvy, urciNajemce } from "./najemci";
import { platnyKDatu, popisPorovnani, porovnejProNemovitost } from "./zalohy";

export interface EntityFormState {
  error?: string;
  success?: string;
  /** Ulozeno, ale neco nesedi. Nebrani ulozeni — jen se o tom ma vedet. */
  warning?: string;
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

/**
 * Po zmene smlouvy nebo sluzby zkontroluje, jestli zalohy najemce stale kryji
 * naklady na preuctovane sluzby. Vraci text varovani, nebo undefined kdyz sedi.
 *
 * Neblokuje ulozeni: nesoulad muze byt cilovy (zalohy se upravuji az
 * po vyuctovani) — jde o to, aby se o nem vedelo, ne aby se zakazal.
 */
async function varovaniZaloh(propertyId: string): Promise<string | undefined> {
  const [najmy, sluzby] = await Promise.all([
    prisma.lease.findMany({
      where: { propertyId },
      select: {
        tenantName: true, utilitiesMonthly: true, isActive: true, startDate: true, endDate: true,
        advanceIntentional: true, advanceNote: true,
        advanceChanges: { select: { validFrom: true, amount: true } },
      },
    }),
    prisma.service.findMany({
      where: { propertyId },
      select: {
        type: true, provider: true, monthlyCost: true, annualCost: true, chargedToTenant: true, contractStart: true,
        costChanges: { select: { validFrom: true, monthlyCost: true, annualCost: true } },
      },
    }),
  ]);
  const p = porovnejProNemovitost(
    najmy.map(({ advanceChanges, ...n }) => ({ ...n, historie: advanceChanges })),
    sluzby.map(({ costChanges, ...s }) => ({ ...s, historie: costChanges })),
  );
  if (!p || p.stav === "sedi" || p.stav === "zamerne") return undefined;
  return popisPorovnani(p).text;
}

const DEN_MS = 24 * 3600 * 1000;
/** Dnesni datum jako RRRR-MM-DD, ke srovnani s hodnotou z pole typu date. */
const dnesISO = () => new Date().toISOString().slice(0, 10);

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Aktualni naklad sluzby je ten, ktery plati dnes; ne posledni zapsany (zpetna oprava nesmi prepsat dnesek). */
async function prepocitejAktualniNaklad(tx: Tx, serviceId: string) {
  const zaznamy = await tx.serviceCostChange.findMany({ where: { serviceId } });
  const dnes = platnyKDatu(zaznamy, new Date());
  if (dnes) {
    await tx.service.update({ where: { id: serviceId }, data: { monthlyCost: dnes.monthlyCost, annualCost: dnes.annualCost } });
  }
}

async function prepocitejAktualniZalohy(tx: Tx, leaseId: string) {
  const zaznamy = await tx.leaseAdvanceChange.findMany({ where: { leaseId } });
  const dnes = platnyKDatu(zaznamy, new Date());
  if (dnes) {
    await tx.lease.update({
      where: { id: leaseId },
      data: { utilitiesMonthly: dnes.amount, advanceItems: (dnes.items as Prisma.InputJsonValue | null) ?? Prisma.DbNull },
    });
  }
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
  tenantStreet: textNeboNic,
  tenantCity: textNeboNic,
  tenantZip: textNeboNic,
  tenantAccount: textNeboNic,
  tenantId: textNeboNic,
  advanceIntentional: z.preprocess((v) => v === "on" || v === true, z.boolean()),
  advanceNote: textNeboNic,
  /** Od kdy plati nova vyse zaloh; potreba jen pri zmene zaloh u existujici smlouvy. */
  advanceValidFrom: datumNeboNic,
  startDate: z.string().min(1, "Zadej začátek nájmu."),
  endDate: datumNeboNic,
  rentMonthly: cislo().refine((v) => v > 0, "Nájemné musí být větší než nula."),
  utilitiesMonthly: cislo(),
  deposit: cislo(),
  paymentDay: cislo(15).refine((v) => v >= 1 && v <= 28, "Den splatnosti zadej 1–28."),
  indexationClause: z.preprocess((v) => v === "on" || v === true, z.boolean()),
  isActive: z.preprocess((v) => v === "on" || v === true, z.boolean()),
  notes: textNeboNic,
  /** Nova smlouva navazuje na starou: ta konci k `predchoziKonec`. */
  predchoziId: textNeboNic,
  predchoziKonec: datumNeboNic,
});

export async function saveLease(id: string | null, _prev: EntityFormState, formData: FormData): Promise<EntityFormState> {
  const auth = await majitel();
  if ("error" in auth) return auth;

  const parsed = najemSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  // Cislo uctu je citlivy udaj a jde podle nej platit: kontrola tvaru i souctu, ulozi se ve sjednocenem zapisu
  const ucet = zkontrolujUcet(d.tenantAccount ?? "");
  if (!ucet.ok) return { error: `Číslo účtu: ${ucet.chyba}` };

  // Rozpis zaloh po sluzbach: kdyz je zapnuty, celkova zaloha je jeho soucet
  let polozky: { serviceId: string; amount: number }[] | null = null;
  if (formData.get("advanceBreakdown") === "on") {
    polozky = [];
    for (const [klic, hodnota] of formData.entries()) {
      if (!klic.startsWith("advanceItem:")) continue;
      const castka = Number(String(hodnota).replace(/[\s ]/g, "").replace(",", "."));
      if (!Number.isFinite(castka) || castka < 0) return { error: "Záloha na službu musí být číslo, nula nebo víc." };
      polozky.push({ serviceId: klic.slice("advanceItem:".length), amount: Math.round(castka * 100) / 100 });
    }
    const sluzbyNem = await prisma.service.findMany({ where: { propertyId: d.propertyId }, select: { id: true } });
    const ids = new Set(sluzbyNem.map((s) => s.id));
    if (polozky.some((p) => !ids.has(p.serviceId))) return { error: "Rozpis zaloh obsahuje službu z jiné nemovitosti." };
    if (polozky.length === 0) return { error: "Rozpis záloh je prázdný. Vypni rozpis, nebo označ služby k přeúčtování." };
    d.utilitiesMonthly = Math.round(polozky.reduce((a, p) => a + p.amount, 0) * 100) / 100;
  }
  const polozkyJson = polozky ? (polozky as unknown as Prisma.InputJsonValue) : Prisma.DbNull;

  // Najemce ma vlastni identitu (tabulka Tenant); smlouva na nej jen odkazuje
  const najemceId = await urciNajemce({
    name: d.tenantName, email: d.tenantEmail, phone: d.tenantPhone,
    street: d.tenantStreet, city: d.tenantCity, zip: d.tenantZip, account: ucet.hodnota,
  }, d.tenantId);

  const data = {
    tenantId: najemceId,
    tenantName: d.tenantName,
    tenantEmail: d.tenantEmail,
    tenantPhone: d.tenantPhone,
    tenantStreet: d.tenantStreet,
    tenantCity: d.tenantCity,
    tenantZip: d.tenantZip,
    tenantAccount: ucet.hodnota,
    startDate: new Date(d.startDate),
    endDate: d.endDate ? new Date(d.endDate) : null,
    rentMonthly: d.rentMonthly,
    utilitiesMonthly: d.utilitiesMonthly,
    advanceItems: polozkyJson,
    deposit: d.deposit,
    paymentDay: Math.round(d.paymentDay),
    indexationClause: d.indexationClause,
    advanceIntentional: d.advanceIntentional,
    advanceNote: d.advanceIntentional ? d.advanceNote : null,
    isActive: d.isActive,
    notes: d.notes,
  };

  // Vyhodnoceni vynosu pracuje s jednou platnou smlouvou — ostatni proto deaktivujeme
  if (d.isActive) {
    await prisma.lease.updateMany({
      where: { propertyId: d.propertyId, isActive: true, ...(id ? { id: { not: id } } : {}) },
      data: { isActive: false },
    });
  }

  if (id) {
    const stara = await prisma.lease.findUnique({ where: { id }, include: { advanceChanges: true } });
    if (!stara) return { error: "Smlouva neexistuje." };

    // Zmena zaloh se zapisuje s datem, od ktereho plati; jinak by se prepsala
    // minulost a nedalo by se zjistit, co najemce platil drive.
    const ser = (p: unknown) => JSON.stringify(
      ((p as { serviceId: string; amount: number }[] | null) ?? []).map((x) => [x.serviceId, x.amount]).sort(),
    );
    const zmenaZaloh = stara.utilitiesMonthly !== d.utilitiesMonthly || ser(stara.advanceItems) !== ser(polozky);
    if (zmenaZaloh) {
      if (!d.advanceValidFrom) return { error: "Zadej, od kdy nové zálohy platí." };
    }

    const { utilitiesMonthly: _z, advanceItems: _i, ...bezZaloh } = data;
    await prisma.$transaction(async (tx) => {
      await tx.lease.update({ where: { id }, data: bezZaloh });
      if (!zmenaZaloh) return;

      const platiOd = new Date(d.advanceValidFrom!);
      // Puvodni hodnota je pocatecni zaznam: plati od zacatku smlouvy, nebo o den
      // pred zmenou, kdyz by zmena pripadla pred zacatek smlouvy
      if (stara.advanceChanges.length === 0) {
        const predZmenou = new Date(platiOd.getTime() - DEN_MS);
        await tx.leaseAdvanceChange.create({
          data: {
            leaseId: id, amount: stara.utilitiesMonthly,
            items: (stara.advanceItems as Prisma.InputJsonValue | null) ?? Prisma.DbNull,
            validFrom: stara.startDate < predZmenou ? stara.startDate : predZmenou,
          },
        });
      }
      await tx.leaseAdvanceChange.upsert({
        where: { leaseId_validFrom: { leaseId: id, validFrom: platiOd } },
        update: { amount: d.utilitiesMonthly, items: polozkyJson },
        create: { leaseId: id, validFrom: platiOd, amount: d.utilitiesMonthly, items: polozkyJson },
      });
      await prepocitejAktualniZalohy(tx, id);
    });
  } else if (d.predchoziId) {
    // Navazujici smlouva: stara se ukonci a nova zalozi spolu, aby po pade v pulce
    // nezustalo neukoncene nebo zdvojene obdobi
    if (!d.predchoziKonec) return { error: "Zadej, k jakému dni stará smlouva končí." };
    const predchozi = await prisma.lease.findUnique({ where: { id: d.predchoziId } });
    if (!predchozi) return { error: "Původní smlouva neexistuje." };
    const konec = new Date(d.predchoziKonec);
    if (konec < predchozi.startDate) return { error: "Stará smlouva nemůže skončit dřív, než začala." };
    if (data.startDate <= konec) return { error: "Nová smlouva musí začít až po konci staré." };
    await prisma.$transaction([
      prisma.lease.update({ where: { id: predchozi.id }, data: { endDate: konec, isActive: false } }),
      prisma.lease.create({ data: { ...data, propertyId: d.propertyId } }),
    ]);
  } else {
    await prisma.lease.create({ data: { ...data, propertyId: d.propertyId } });
  }

  // Ostatni smlouvy stejneho najemce dostanou stejne kontaktni udaje
  await synchronizujSmlouvy(najemceId);

  obnov(d.propertyId);
  return {
    success: id ? "Smlouva upravena." : d.predchoziId ? "Stará smlouva ukončena, nová uložena." : "Smlouva uložena.",
    warning: await varovaniZaloh(d.propertyId),
  };
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
  /** Od kdy sluzba plati — povinne. */
  contractStart: z.string().min(1, "Zadej, od kdy služba platí."),
  noticePeriodMonths: cislo(),
  isBundleable: z.preprocess((v) => v === "on" || v === true, z.boolean()),
  chargedToTenant: z.preprocess((v) => v === "on" || v === true, z.boolean()),
  /** Od kdy plati novy naklad; potreba jen pri zmene nakladu u existujici sluzby. */
  costValidFrom: datumNeboNic,
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
  if (d.contractEnd && d.contractEnd < d.contractStart) {
    return { error: "Služba nemůže být vázaná do data před tím, než začala platit." };
  }

  const data = {
    type: d.type,
    provider: d.provider,
    contractNo: d.contractNo,
    monthlyCost: d.monthlyCost,
    annualCost: d.annualCost,
    contractStart: new Date(d.contractStart),
    contractEnd: d.contractEnd ? new Date(d.contractEnd) : null,
    noticePeriodMonths: Math.round(d.noticePeriodMonths),
    isBundleable: d.isBundleable,
    chargedToTenant: d.chargedToTenant,
    notes: d.notes,
  };

  if (id) {
    const stara = await prisma.service.findUnique({ where: { id }, include: { costChanges: true } });
    if (!stara) return { error: "Služba neexistuje." };

    const zmenaNakladu = stara.monthlyCost !== d.monthlyCost || (stara.annualCost ?? null) !== (d.annualCost ?? null);
    if (zmenaNakladu) {
      if (!d.costValidFrom) return { error: "Zadej, od kdy nový náklad platí." };
      if (d.costValidFrom < d.contractStart) return { error: "Nový náklad nemůže platit před začátkem služby." };
    }

    // Naklad se meni jen pres historii; primo se neprepisuje, aby zpetna oprava
    // (zmena s datem v minulosti) neprebila to, co plati dnes.
    const { monthlyCost: _m, annualCost: _a, ...bezNakladu } = data;
    await prisma.$transaction(async (tx) => {
      await tx.service.update({ where: { id }, data: bezNakladu });
      if (!zmenaNakladu) return;

      const platiOd = new Date(d.costValidFrom!);
      if (stara.costChanges.length === 0) {
        const predZmenou = new Date(platiOd.getTime() - DEN_MS);
        const zacatek = new Date(d.contractStart);
        await tx.serviceCostChange.create({
          data: {
            serviceId: id, monthlyCost: stara.monthlyCost, annualCost: stara.annualCost,
            validFrom: zacatek < predZmenou ? zacatek : predZmenou,
          },
        });
      }
      await tx.serviceCostChange.upsert({
        where: { serviceId_validFrom: { serviceId: id, validFrom: platiOd } },
        update: { monthlyCost: d.monthlyCost, annualCost: d.annualCost },
        create: { serviceId: id, validFrom: platiOd, monthlyCost: d.monthlyCost, annualCost: d.annualCost },
      });
      await prepocitejAktualniNaklad(tx, id);
    });
  } else {
    await prisma.service.create({ data: { ...data, propertyId: d.propertyId } });
  }

  obnov(d.propertyId);
  return {
    success: id ? "Služba upravena." : "Služba uložena.",
    warning: await varovaniZaloh(d.propertyId),
  };
}

/**
 * Novy poplatek sluzby od data: pridava zaznam do historie, dosavadni vyse
 * zustava a plati do dne pred zmenou. Stejny den jako existujici zaznam ho opravi.
 */
export async function novyPoplatek(_prev: EntityFormState, formData: FormData): Promise<EntityFormState> {
  const auth = await majitel();
  if ("error" in auth) return auth;

  const id = String(formData.get("id") ?? "");
  const mesicne = Number(String(formData.get("monthlyCost") ?? "0").replace(/\s/g, "").replace(",", ".")) || 0;
  const rocneText = String(formData.get("annualCost") ?? "").trim();
  const rocne = rocneText === "" ? null : Number(rocneText.replace(/\s/g, "").replace(",", "."));
  const platiOdText = String(formData.get("costValidFrom") ?? "");

  if (mesicne <= 0 && !rocne) return { error: "Vyplň měsíční nebo roční náklad." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(platiOdText)) return { error: "Zadej, od kdy nový poplatek platí." };

  const stara = await prisma.service.findUnique({ where: { id }, include: { costChanges: true } });
  if (!stara) return { error: "Služba neexistuje." };
  if (stara.contractStart && platiOdText < stara.contractStart.toISOString().slice(0, 10)) {
    return { error: "Nový poplatek nemůže platit před začátkem služby." };
  }
  if (stara.monthlyCost === mesicne && (stara.annualCost ?? null) === (rocne ?? null)
      && !stara.costChanges.some((z) => z.validFrom.toISOString().slice(0, 10) === platiOdText)) {
    return { error: "Zadaná výše je stejná jako dnešní, není co zaznamenat." };
  }

  const platiOd = new Date(platiOdText);
  await prisma.$transaction(async (tx) => {
    if (stara.costChanges.length === 0) {
      const predZmenou = new Date(platiOd.getTime() - DEN_MS);
      const zacatek = stara.contractStart ?? stara.createdAt;
      await tx.serviceCostChange.create({
        data: {
          serviceId: id, monthlyCost: stara.monthlyCost, annualCost: stara.annualCost,
          validFrom: zacatek < predZmenou ? zacatek : predZmenou,
        },
      });
    }
    await tx.serviceCostChange.upsert({
      where: { serviceId_validFrom: { serviceId: id, validFrom: platiOd } },
      update: { monthlyCost: mesicne, annualCost: rocne },
      create: { serviceId: id, validFrom: platiOd, monthlyCost: mesicne, annualCost: rocne },
    });
    await prepocitejAktualniNaklad(tx, id);
  });

  obnov(stara.propertyId);
  return { success: "Nový poplatek zaznamenán.", warning: await varovaniZaloh(stara.propertyId) };
}

export async function deleteService(_prev: EntityFormState, formData: FormData): Promise<EntityFormState> {
  const auth = await majitel();
  if ("error" in auth) return auth;

  const service = await prisma.service.findUnique({ where: { id: String(formData.get("id")) } });
  if (!service) return { error: "Služba neexistuje." };

  await prisma.service.delete({ where: { id: service.id } });
  obnov(service.propertyId);
  return { success: "Služba smazána.", warning: await varovaniZaloh(service.propertyId) };
}

/** Smaze jeden radek historie nakladu, napr. preklep v datu. Aktualni naklad se dopocita znovu. */
export async function smazZmenuNakladu(_prev: EntityFormState, formData: FormData): Promise<EntityFormState> {
  const auth = await majitel();
  if ("error" in auth) return auth;

  const zmena = await prisma.serviceCostChange.findUnique({
    where: { id: String(formData.get("id")) },
    include: { service: { select: { propertyId: true } } },
  });
  if (!zmena) return { error: "Záznam neexistuje." };

  await prisma.$transaction(async (tx) => {
    await tx.serviceCostChange.delete({ where: { id: zmena.id } });
    await prepocitejAktualniNaklad(tx, zmena.serviceId);
  });
  obnov(zmena.service.propertyId);
  return { success: "Změna nákladu smazána.", warning: await varovaniZaloh(zmena.service.propertyId) };
}

/** Totez pro zalohy ve smlouve. */
export async function smazZmenuZaloh(_prev: EntityFormState, formData: FormData): Promise<EntityFormState> {
  const auth = await majitel();
  if ("error" in auth) return auth;

  const zmena = await prisma.leaseAdvanceChange.findUnique({
    where: { id: String(formData.get("id")) },
    include: { lease: { select: { propertyId: true } } },
  });
  if (!zmena) return { error: "Záznam neexistuje." };

  await prisma.$transaction(async (tx) => {
    await tx.leaseAdvanceChange.delete({ where: { id: zmena.id } });
    await prepocitejAktualniZalohy(tx, zmena.leaseId);
  });
  obnov(zmena.lease.propertyId);
  return { success: "Změna záloh smazána.", warning: await varovaniZaloh(zmena.lease.propertyId) };
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

export async function saveTransaction(id: string | null, _prev: EntityFormState, formData: FormData): Promise<EntityFormState> {
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

  const data = {
    propertyId: d.propertyId,
    date: new Date(d.date),
    amount: castka,
    category: d.category,
    taxTreatment: kategorie.defaultTaxTreatment,
    description: d.description,
    documentRef: d.documentRef,
  };

  // Stejny formular slouzi k zalozeni i k uprave — id rozhoduje
  if (id) await prisma.transaction.update({ where: { id }, data });
  else await prisma.transaction.create({ data });

  obnov(d.propertyId);
  return { success: id ? "Pohyb upraven." : "Pohyb zaúčtován." };
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
