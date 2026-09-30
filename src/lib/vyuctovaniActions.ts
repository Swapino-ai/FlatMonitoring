"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "./db";
import { getSession } from "./auth";
import { prunik, dnuVObdobi } from "./vyuctovani";

export interface VyuctovaniFormState {
  error?: string;
  success?: string;
  warning?: string;
}

const cislo = (v: FormDataEntryValue | null): number | null => {
  const s = String(v ?? "").replace(/[\s ]/g, "").replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const text = (v: FormDataEntryValue | null) => String(v ?? "").trim() || null;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

async function majitel() {
  const user = await getSession();
  if (!user) return { error: "Nejsi přihlášen." };
  if (user.role !== "OWNER") return { error: "Tuhle změnu může provést jen majitel." };
  return { ok: true as const };
}

function obnov(propertyId: string) {
  revalidatePath(`/properties/${propertyId}`);
}

/** Vyuctovani sluzby od dodavatele (id = uprava, null = nove) vcetne odectu najemcu. */
export async function saveSettlement(
  id: string | null, _prev: VyuctovaniFormState, formData: FormData,
): Promise<VyuctovaniFormState> {
  const auth = await majitel();
  if ("error" in auth) return auth;

  const serviceId = String(formData.get("serviceId") ?? "");
  const od = String(formData.get("periodFrom") ?? "");
  const doDne = String(formData.get("periodTo") ?? "");
  const naklad = cislo(formData.get("totalCost"));
  const zalohy = cislo(formData.get("supplierAdvances")) ?? 0;
  const rezim = formData.get("splitMode") === "READINGS" ? "READINGS" : "DAYS";

  if (!serviceId) return { error: "Vyber službu." };
  if (!ISO.test(od) || !ISO.test(doDne)) return { error: "Zadej období od–do." };
  if (od > doDne) return { error: "Konec období je před začátkem." };
  if (naklad == null || naklad < 0) return { error: "Zadej skutečný náklad za období." };

  const sluzba = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!sluzba) return { error: "Služba neexistuje." };

  // Dve vyuctovani jedne sluzby se nesmi prekryvat: den by se zapocital dvakrat
  const stavajici = await prisma.serviceSettlement.findMany({
    where: { serviceId, ...(id ? { id: { not: id } } : {}) },
  });
  for (const s of stavajici) {
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    if (prunik(od, doDne, iso(s.periodFrom), iso(s.periodTo))) {
      return { error: `Období se překrývá s jiným vyúčtováním této služby (${iso(s.periodFrom)} – ${iso(s.periodTo)}).` };
    }
  }

  const odecty: { leaseId: string; consumption: number }[] = [];
  let spotrebaVlastnik: number | null = null;
  if (rezim === "READINGS") {
    for (const [klic, hodnota] of formData.entries()) {
      if (!klic.startsWith("odecet:")) continue;
      const n = cislo(hodnota);
      if (n != null && n >= 0) odecty.push({ leaseId: klic.slice(7), consumption: n });
    }
    spotrebaVlastnik = cislo(formData.get("ownerConsumption"));
    if (odecty.length === 0 && !spotrebaVlastnik) return { error: "Zadej spotřebu podle odečtů." };
  }

  const data = {
    serviceId,
    periodFrom: new Date(od), periodTo: new Date(doDne),
    totalCost: naklad, supplierAdvances: zalohy,
    splitMode: rezim,
    readingUnit: rezim === "READINGS" ? text(formData.get("readingUnit")) : null,
    ownerConsumption: rezim === "READINGS" ? spotrebaVlastnik : null,
    invoiceNo: text(formData.get("invoiceNo")),
    notes: text(formData.get("notes")),
  };

  await prisma.$transaction(async (tx) => {
    const zaznam = id
      ? await tx.serviceSettlement.update({ where: { id }, data })
      : await tx.serviceSettlement.create({ data });
    await tx.settlementReading.deleteMany({ where: { settlementId: zaznam.id } });
    if (odecty.length) {
      await tx.settlementReading.createMany({
        data: odecty.map((o) => ({ settlementId: zaznam.id, leaseId: o.leaseId, consumption: o.consumption })),
      });
    }
  });

  obnov(sluzba.propertyId);
  const dnu = dnuVObdobi(od, doDne);
  return { success: id ? "Vyúčtování upraveno." : `Vyúčtování uloženo (${dnu} dní).` };
}

export async function deleteSettlement(_prev: VyuctovaniFormState, formData: FormData): Promise<VyuctovaniFormState> {
  const auth = await majitel();
  if ("error" in auth) return auth;

  const zaznam = await prisma.serviceSettlement.findUnique({
    where: { id: String(formData.get("id")) },
    include: { service: { select: { propertyId: true } } },
  });
  if (!zaznam) return { error: "Vyúčtování neexistuje." };

  await prisma.serviceSettlement.delete({ where: { id: zaznam.id } });
  obnov(zaznam.service.propertyId);
  return { success: "Vyúčtování smazáno." };
}
