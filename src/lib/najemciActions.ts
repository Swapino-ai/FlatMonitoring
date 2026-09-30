"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "./db";
import { getSession } from "./auth";
import { synchronizujSmlouvy } from "./najemci";
import { zkontrolujUcet } from "./ucet";

export interface NajemciFormState {
  error?: string;
  success?: string;
}

async function majitel() {
  const user = await getSession();
  if (!user) return { error: "Nejsi přihlášen." };
  if (user.role !== "OWNER") return { error: "Tuhle změnu může provést jen majitel." };
  return { ok: true as const };
}

const text = (v: FormDataEntryValue | null) => String(v ?? "").trim() || null;

/** Uprava kontaktu najemce; zmeni se ve vsech jeho smlouvach. */
export async function saveTenant(_prev: NajemciFormState, formData: FormData): Promise<NajemciFormState> {
  const auth = await majitel();
  if ("error" in auth) return auth;

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Zadej jméno nájemce." };

  const ucet = zkontrolujUcet(String(formData.get("account") ?? ""));
  if (!ucet.ok) return { error: `Číslo účtu: ${ucet.chyba}` };

  const email = text(formData.get("email"));
  if (email) {
    const duplicita = await prisma.tenant.findFirst({
      where: { email: { equals: email, mode: "insensitive" }, id: { not: id } },
    });
    if (duplicita) return { error: `E-mail už patří jinému nájemci (${duplicita.name}). Jeden člověk má být jeden záznam.` };
  }

  if (!(await prisma.tenant.findUnique({ where: { id } }))) return { error: "Nájemce neexistuje." };
  await prisma.tenant.update({
    where: { id },
    data: {
      name, email, phone: text(formData.get("phone")), street: text(formData.get("street")),
      city: text(formData.get("city")), zip: text(formData.get("zip")), account: ucet.hodnota,
      notes: text(formData.get("notes")),
    },
  });
  await synchronizujSmlouvy(id);

  revalidatePath("/najemnici");
  revalidatePath("/properties");
  return { success: "Nájemce uložen, změna platí ve všech jeho smlouvách." };
}

/** Smazat jde jen nájemce bez smlouvy — jinak by smlouvy osiřely. */
export async function deleteTenant(_prev: NajemciFormState, formData: FormData): Promise<NajemciFormState> {
  const auth = await majitel();
  if ("error" in auth) return auth;

  const t = await prisma.tenant.findUnique({
    where: { id: String(formData.get("id") ?? "") }, include: { _count: { select: { leases: true } } },
  });
  if (!t) return { error: "Nájemce neexistuje." };
  if (t._count.leases > 0) return { error: `${t.name} má ${t._count.leases} smluv, nejdřív je smaž.` };

  await prisma.tenant.delete({ where: { id: t.id } });
  revalidatePath("/najemnici");
  return { success: "Nájemce smazán." };
}
