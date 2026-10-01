"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "./db";
import { getSession } from "./auth";
import { nactiTypySluzeb } from "./typySluzeb";
import { navrhniIkonu } from "./categories";

export interface TypyFormState {
  error?: string;
  success?: string;
}

const IKONY = new Set([
  "blesk", "plamen", "kapka", "teplomer", "wifi", "stit", "budova", "kufr", "odpad", "tri",
  "kalendar", "penize", "dokument", "najemce", "uklid", "zelen", "vytah", "schody", "zarovka", "klic", "naradi",
  "televize", "kamera", "parkovani",
]);

async function majitel() {
  const user = await getSession();
  if (!user) return { error: "Nejsi přihlášen." };
  if (user.role !== "OWNER") return { error: "Tuhle změnu může provést jen majitel." };
  return { ok: true as const };
}

function obnov() {
  revalidatePath("/sprava");
  revalidatePath("/properties");
  revalidatePath("/savings");
}

/** Zalozi (bez klice) nebo upravi druh sluzby. */
export async function saveServiceType(_prev: TypyFormState, formData: FormData): Promise<TypyFormState> {
  const auth = await majitel();
  if ("error" in auth) return auth;

  const puvodni = String(formData.get("key") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const icon = String(formData.get("icon") ?? "tri");
  const chargedByDefault = formData.get("chargedByDefault") === "on";
  if (!name) return { error: "Zadej název druhu služby." };
  if (!IKONY.has(icon)) return { error: "Neznámá ikona." };

  // Zajisti vychozi druhy, at se nove neplete s prazdnou tabulkou
  const typy = await nactiTypySluzeb();
  if (Object.entries(typy).some(([k, t]) => k !== puvodni && t.name.toLowerCase() === name.toLowerCase())) {
    return { error: `Druh „${name}“ už existuje.` };
  }

  if (puvodni) {
    await prisma.serviceType.upsert({
      where: { key: puvodni },
      update: { name, icon, chargedByDefault },
      create: { key: puvodni, name, icon, chargedByDefault, sort: 999 },
    });
  } else {
    const max = await prisma.serviceType.aggregate({ _max: { sort: true } });
    await prisma.serviceType.create({
      data: { key: `X_${Date.now().toString(36).toUpperCase()}`, name, icon, chargedByDefault, sort: (max._max.sort ?? 0) + 1 },
    });
  }
  obnov();
  return { success: puvodni ? "Druh služby uložen." : "Druh služby přidán." };
}

/** Smazat jde jen druh, ktery zadna sluzba nepouziva. */
export async function deleteServiceType(_prev: TypyFormState, formData: FormData): Promise<TypyFormState> {
  const auth = await majitel();
  if ("error" in auth) return auth;

  const key = String(formData.get("id") ?? "");
  const pouzito = await prisma.service.count({ where: { type: key } });
  if (pouzito > 0) return { error: `Druh používá ${pouzito} služeb, nejdřív je přesuň jinam nebo smaž.` };
  await prisma.serviceType.deleteMany({ where: { key } });
  obnov();
  return { success: "Druh služby smazán." };
}

/** Prida ikonu podle nazvu u druhu, jehoz ikona nesedi (uklid, zelen, oprava…). Zname druhy bez shody nechava. */
export async function priradIkony(): Promise<TypyFormState> {
  const auth = await majitel();
  if ("error" in auth) return auth;

  const typy = await nactiTypySluzeb();
  const zmeny: string[] = [];
  for (const [key, t] of Object.entries(typy)) {
    const navrh = navrhniIkonu(t.name);
    if (!navrh || navrh === t.icon || !IKONY.has(navrh)) continue;
    await prisma.serviceType.upsert({
      where: { key }, update: { icon: navrh }, create: { key, name: t.name, icon: navrh, chargedByDefault: t.chargedByDefault, sort: 999 },
    });
    zmeny.push(t.name);
  }
  obnov();
  return zmeny.length
    ? { success: `Ikony změněny u ${zmeny.length}: ${zmeny.join(", ")}.` }
    : { success: "Všechny ikony už odpovídají názvům." };
}
