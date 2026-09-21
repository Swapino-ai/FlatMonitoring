"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "./db";
import { getSession } from "./auth";

export interface ValuationFormState {
  error?: string;
  success?: string;
}

const schema = z.object({
  propertyId: z.string().min(1),
  value: z.preprocess(
    (v) => Number(String(v ?? "").replace(/[\s ]/g, "").replace(",", ".")),
    z.number().positive("Hodnota musí být větší než nula."),
  ),
  date: z.string().min(1, "Zadej datum ocenění."),
  source: z.enum(["MANUAL", "EXPERT"]),
  notes: z.preprocess((v) => (v === "" || v == null ? null : String(v)), z.string().nullable()),
});

/** Rucni zadani trzni hodnoty — nezavisle na skenu trhu. */
export async function addValuation(_prev: ValuationFormState, formData: FormData): Promise<ValuationFormState> {
  const user = await getSession();
  if (!user) return { error: "Nejsi přihlášen." };
  if (user.role !== "OWNER") return { error: "Ocenění může zadat jen majitel." };

  const parsed = schema.safeParse({
    propertyId: formData.get("propertyId"),
    value: formData.get("value"),
    date: formData.get("date"),
    source: formData.get("source") ?? "MANUAL",
    notes: formData.get("notes"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const d = parsed.data;
  const property = await prisma.property.findUnique({ where: { id: d.propertyId } });
  if (!property) return { error: "Nemovitost neexistuje." };

  await prisma.valuation.create({
    data: {
      propertyId: d.propertyId,
      value: d.value,
      pricePerM2: property.areaM2 ? d.value / property.areaM2 : null,
      date: new Date(d.date),
      source: d.source,
      confidence: d.source === "EXPERT" ? "HIGH" : "MEDIUM",
      notes: d.notes,
    },
  });

  revalidatePath(`/properties/${d.propertyId}`);
  revalidatePath("/properties");
  revalidatePath("/market");
  revalidatePath("/");
  return { success: "Ocenění uloženo." };
}

export async function deleteValuation(_prev: ValuationFormState, formData: FormData): Promise<ValuationFormState> {
  const user = await getSession();
  if (!user || user.role !== "OWNER") return { error: "Nedostatečné oprávnění." };

  const id = String(formData.get("id") ?? "");
  const valuation = await prisma.valuation.findUnique({ where: { id } });
  if (!valuation) return { error: "Ocenění neexistuje." };

  await prisma.valuation.delete({ where: { id } });
  revalidatePath(`/properties/${valuation.propertyId}`);
  revalidatePath("/");
  return { success: "Ocenění smazáno." };
}
