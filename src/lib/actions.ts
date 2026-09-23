"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "./db";
import { getSession } from "./auth";

const numberish = (fallback = 0) =>
  z.preprocess((v) => {
    if (v === "" || v == null) return fallback;
    const n = Number(String(v).replace(/[\s ]/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : fallback;
  }, z.number());

const optionalNumber = z.preprocess((v) => {
  if (v === "" || v == null) return null;
  const n = Number(String(v).replace(/[\s ]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}, z.number().nullable());

const optionalString = z.preprocess((v) => (v === "" || v == null ? null : String(v)), z.string().nullable());

const propertySchema = z.object({
  type: z.string().min(1),
  name: z.string().min(1, "Zadej název"),
  street: z.string().min(1, "Zadej ulici"),
  city: z.string().min(1, "Zadej město"),
  zip: z.string().min(1, "Zadej PSČ"),
  district: optionalString,
  // Souradnice plni naseptavac adres; rucne vyplnena adresa je nema
  latitude: optionalNumber,
  longitude: optionalNumber,
  disposition: optionalString,
  areaM2: numberish().refine((v) => v > 0, "Plocha musí být větší než nula"),
  floor: optionalNumber,
  buildYear: optionalNumber,
  cadastralNo: optionalString,
  hasBalcony: z.coerce.boolean(),
  hasCellar: z.coerce.boolean(),
  hasParking: z.coerce.boolean(),
  purchaseDate: z.string().min(1, "Zadej datum pořízení"),
  purchasePrice: numberish().refine((v) => v > 0, "Kupní cena musí být větší než nula"),
  acquisitionCosts: numberish(),
  renovationCosts: numberish(),
  landShareValue: numberish(),
  depreciationGroup: numberish(5),
  depreciationMethod: z.enum(["STRAIGHT", "ACCELERATED"]),
  status: z.enum(["RENTED", "VACANT", "RENOVATION", "FOR_SALE", "SOLD"]),
  notes: optionalString,
  // Jen pri zakladani — u uprav se vlastnici resi vlastni sekci
  ownerId: optionalString,
  ownerShare: numberish(100),
});

export interface FormState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

function parse(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  return propertySchema.safeParse({
    ...raw,
    hasBalcony: raw.hasBalcony === "on",
    hasCellar: raw.hasCellar === "on",
    hasParking: raw.hasParking === "on",
  });
}

function toFieldErrors(issues: z.ZodIssue[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) out[String(i.path[0])] = i.message;
  return out;
}

export async function saveProperty(id: string | null, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getSession();
  if (!user) return { error: "Nejsi přihlášen." };
  if (user.role !== "OWNER") return { error: "Jen majitel může upravovat nemovitosti." };

  const parsed = parse(formData);
  if (!parsed.success) {
    return { error: "Zkontroluj vyplněná pole.", fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const d = parsed.data;
  const data = {
    type: d.type,
    name: d.name, street: d.street, city: d.city, zip: d.zip, district: d.district,
    latitude: d.latitude, longitude: d.longitude,
    disposition: d.disposition, areaM2: d.areaM2, floor: d.floor, buildYear: d.buildYear,
    cadastralNo: d.cadastralNo, hasBalcony: d.hasBalcony, hasCellar: d.hasCellar, hasParking: d.hasParking,
    purchaseDate: new Date(d.purchaseDate),
    purchasePrice: d.purchasePrice, acquisitionCosts: d.acquisitionCosts,
    renovationCosts: d.renovationCosts, landShareValue: d.landShareValue,
    depreciationGroup: d.depreciationGroup, depreciationMethod: d.depreciationMethod,
    depreciationStart: new Date(d.purchaseDate).getFullYear(),
    status: d.status, notes: d.notes,
  };

  let saved;
  if (id) {
    saved = await prisma.property.update({ where: { id }, data });
  } else {
    saved = await prisma.property.create({ data });

    // Pri zakladani se vlastnik vybira — nemusi jim byt ten, kdo zaznam vytvoril
    if (d.ownerId) {
      const podil = Math.max(0, Math.min(100, d.ownerShare || 100));
      await prisma.propertyOwner.create({
        data: { propertyId: saved.id, userId: d.ownerId, share: podil },
      });
    }
  }

  revalidatePath("/");
  revalidatePath("/properties");
  redirect(`/properties/${saved.id}`);
}

export async function deleteProperty(id: string): Promise<void> {
  const user = await getSession();
  if (!user || user.role !== "OWNER") throw new Error("Nedostatečné oprávnění");

  await prisma.property.delete({ where: { id } });
  revalidatePath("/");
  revalidatePath("/properties");
  redirect("/properties");
}
