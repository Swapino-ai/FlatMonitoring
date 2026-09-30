"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "./db";
import { getSession, hashPassword } from "./auth";

export interface UserFormState {
  error?: string;
  success?: string;
}

const addSchema = z.object({
  email: z.string().email("Zadej platný e-mail."),
  name: z.string().min(1, "Zadej jméno."),
  role: z.enum(["OWNER", "PARTNER"]),
  password: z.string().min(8, "Heslo musí mít aspoň 8 znaků."),
});

async function requireOwnerOrFail(): Promise<{ id: string } | { error: string }> {
  const user = await getSession();
  if (!user) return { error: "Nejsi přihlášen." };
  if (user.role !== "OWNER") return { error: "Uživatele může spravovat jen majitel." };
  return { id: user.id };
}

export async function addUser(_prev: UserFormState, formData: FormData): Promise<UserFormState> {
  const auth = await requireOwnerOrFail();
  if ("error" in auth) return auth;

  const parsed = addSchema.safeParse({
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    name: String(formData.get("name") ?? "").trim(),
    role: String(formData.get("role") ?? "PARTNER"),
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const d = parsed.data;
  if (await prisma.user.findUnique({ where: { email: d.email } })) {
    return { error: `Uživatel ${d.email} už existuje.` };
  }

  await prisma.user.create({
    data: {
      email: d.email, name: d.name, role: d.role, passwordHash: await hashPassword(d.password),
      street: dobre(formData.get("street")), city: dobre(formData.get("city")),
      zip: dobre(formData.get("zip")), phone: dobre(formData.get("phone")),
    },
  });

  revalidatePath("/users");
  return { success: `Účet ${d.email} vytvořen.` };
}

export async function changePassword(_prev: UserFormState, formData: FormData): Promise<UserFormState> {
  const auth = await requireOwnerOrFail();
  if ("error" in auth) return auth;

  const id = String(formData.get("id") ?? "");
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return { error: "Heslo musí mít aspoň 8 znaků." };

  const user = await prisma.user.update({
    where: { id },
    data: { passwordHash: await hashPassword(password) },
  });

  revalidatePath("/users");
  return { success: `Heslo pro ${user.email} změněno.` };
}

export async function deleteUser(_prev: UserFormState, formData: FormData): Promise<UserFormState> {
  const auth = await requireOwnerOrFail();
  if ("error" in auth) return auth;

  const id = String(formData.get("id") ?? "");
  if (id === auth.id) return { error: "Vlastní účet smazat nelze." };

  // Aplikace bez majitele by se nedala spravovat
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return { error: "Uživatel neexistuje." };
  if (target.role === "OWNER" && (await prisma.user.count({ where: { role: "OWNER" } })) <= 1) {
    return { error: "Tohle je poslední majitel — smazat ho nelze." };
  }

  await prisma.user.delete({ where: { id } });
  revalidatePath("/users");
  return { success: `Účet ${target.email} smazán.` };
}

const dobre = (v: FormDataEntryValue | null) => String(v ?? "").trim() || null;

/** Jmeno a kontaktni udaje uctu. E-mail a heslo se meni zvlast. */
export async function updateUser(_prev: UserFormState, formData: FormData): Promise<UserFormState> {
  const auth = await requireOwnerOrFail();
  if ("error" in auth) return auth;

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Zadej jméno." };

  const user = await prisma.user.update({
    where: { id },
    data: {
      name,
      street: dobre(formData.get("street")), city: dobre(formData.get("city")),
      zip: dobre(formData.get("zip")), phone: dobre(formData.get("phone")),
    },
  });

  revalidatePath("/users");
  return { success: `Údaje pro ${user.email} uloženy.` };
}
