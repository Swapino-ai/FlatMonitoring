"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "./auth";
import { prisma } from "./db";
import { CATEGORY_MAP } from "./categories";
import { nactiNavrhPlatby } from "./pravidelnePlatbyData";

export interface PlatbyState {
  error?: string;
  success?: string;
}

/**
 * Zauctuje vybrane navrzene platby. Server navrh pocita znovu a bere jen klice, ktere v nem jsou,
 * takze klient nemuze zalozit nic jineho; upravit lze jen castku. Smi kazdy prihlaseny uzivatel.
 */
export async function zauctujPlatby(propertyId: string, _prev: PlatbyState, formData: FormData): Promise<PlatbyState> {
  const user = await getSession();
  if (!user) return { error: "Nejsi přihlášen." };

  let vybrane: { klic: string; castka: number }[];
  try {
    const raw = JSON.parse(String(formData.get("platby") ?? "[]"));
    if (!Array.isArray(raw)) throw new Error();
    vybrane = raw.map((x) => ({ klic: String(x.klic), castka: Number(x.castka) }));
  } catch {
    return { error: "Neplatný výběr plateb." };
  }
  if (vybrane.length === 0) return { error: "Nic není vybráno." };
  if (vybrane.length > 1000) return { error: "Najednou jde zaúčtovat nejvýš 1000 plateb." };
  if (vybrane.some((v) => !Number.isFinite(v.castka) || v.castka === 0)) return { error: "U každé platby musí být částka různá od nuly." };

  const navrh = new Map((await nactiNavrhPlatby(propertyId)).map((p) => [p.klic, p]));
  const data = [];
  for (const v of vybrane) {
    const p = navrh.get(v.klic);
    if (!p) return { error: "Některá platba už není v návrhu (změnila se smlouva nebo služba). Načti stránku znovu." };
    if (p.stav === "zauctovano") continue;
    const kat = CATEGORY_MAP.get(p.kategorie);
    if (!kat) return { error: "Neznámá kategorie." };
    // Znamenko urcuje druh platby (prijem/vydaj), uzivatel meni jen velikost
    const castka = kat.kind === "EXPENSE" ? -Math.abs(v.castka) : Math.abs(v.castka);
    data.push({
      propertyId, date: new Date(p.datum), amount: Math.round(castka * 100) / 100, category: p.kategorie,
      taxTreatment: kat.defaultTaxTreatment, description: p.popis, isRecurring: true, sourceKey: p.klic,
    });
  }
  if (data.length === 0) return { success: "Vše vybrané už bylo zaúčtované." };

  // Unikatni klic brani zdvojeni i pri dvou soucasnych kliknutich
  const vysledek = await prisma.transaction.createMany({ data, skipDuplicates: true });

  for (const cesta of [`/properties/${propertyId}`, "/properties", "/", "/cashflow"]) revalidatePath(cesta);
  const preskoceno = data.length - vysledek.count;
  return { success: `Zaúčtováno ${vysledek.count} plateb.${preskoceno > 0 ? ` ${preskoceno} už bylo zaúčtováno.` : ""}` };
}
