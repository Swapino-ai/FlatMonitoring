"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "./auth";
import { prisma } from "./db";
import { zkontrolujUcet } from "./ucet";

export interface ProvozovateleState {
  error?: string;
  success?: string;
}

const text = (v: FormDataEntryValue | null) => String(v ?? "").trim() || null;

async function majitel() {
  const user = await getSession();
  if (!user) return { error: "Nejsi přihlášen." } as const;
  if (user.role !== "OWNER") return { error: "Tuhle změnu může provést jen majitel." } as const;
  return { ok: true } as const;
}

function obnov() {
  revalidatePath("/sprava");
  revalidatePath("/properties");
}

/** Zalozi (bez id) nebo upravi provozovatele. */
export async function saveOperator(_prev: ProvozovateleState, formData: FormData): Promise<ProvozovateleState> {
  const auth = await majitel();
  if ("error" in auth) return auth;

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Zadej jméno nebo název provozovatele." };

  const ucet = zkontrolujUcet(String(formData.get("account") ?? ""));
  if (!ucet.ok) return { error: `Číslo účtu: ${ucet.chyba}` };

  const ico = text(formData.get("ico"))?.replace(/\s/g, "") ?? null;
  if (ico && !/^\d{8}$/.test(ico)) return { error: "IČO má 8 číslic." };

  const data = {
    name, ico, dic: text(formData.get("dic")), street: text(formData.get("street")),
    city: text(formData.get("city")), zip: text(formData.get("zip")), email: text(formData.get("email")),
    phone: text(formData.get("phone")), account: ucet.hodnota, notes: text(formData.get("notes")),
  };

  if (id) {
    if (!(await prisma.operator.findUnique({ where: { id } }))) return { error: "Provozovatel neexistuje." };
    await prisma.operator.update({ where: { id }, data });
  } else {
    await prisma.operator.create({ data });
  }
  obnov();
  return { success: id ? "Provozovatel uložen. Změna se projeví na nových dokladech." : "Provozovatel přidán." };
}

/** Smazat jde jen provozovatel, ktery neni u zadne nemovitosti. */
export async function deleteOperator(_prev: ProvozovateleState, formData: FormData): Promise<ProvozovateleState> {
  const auth = await majitel();
  if ("error" in auth) return auth;
  const id = String(formData.get("id") ?? "");
  const pouzito = await prisma.property.count({ where: { operatorId: id } });
  if (pouzito > 0) return { error: `Provozovatel je u ${pouzito} nemovitostí, nejdřív ho u nich změň.` };
  await prisma.operator.deleteMany({ where: { id } });
  obnov();
  return { success: "Provozovatel smazán." };
}
