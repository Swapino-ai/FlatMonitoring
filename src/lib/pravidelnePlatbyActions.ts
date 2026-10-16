"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "./auth";
import { prisma } from "./db";
import { nactiNavrhPlatby } from "./pravidelnePlatbyData";

export interface PlatbyState {
  error?: string;
  success?: string;
}

/**
 * Zapise, co je zaplaceno: u kazde platby datum a skutecnou castku; bez data se zaznam zrusi
 * (platba je zase nezaplacena). Server navrh pocita znovu a prijme jen klice, ktere v nem jsou.
 * Nezaklada Pohyby — slouzi k prehledu dluhu. Smi kazdy prihlaseny uzivatel.
 */
export async function zapisZaplaceno(propertyId: string, _prev: PlatbyState, formData: FormData): Promise<PlatbyState> {
  const user = await getSession();
  if (!user) return { error: "Nejsi přihlášen." };

  let zmeny: { klic: string; datum: string | null; castka: number }[];
  try {
    const raw = JSON.parse(String(formData.get("platby") ?? "[]"));
    if (!Array.isArray(raw)) throw new Error();
    zmeny = raw.map((x) => ({ klic: String(x.klic), datum: x.datum ? String(x.datum) : null, castka: Number(x.castka) }));
  } catch {
    return { error: "Neplatná data." };
  }
  if (zmeny.length === 0) return { error: "Nic není ke zpracování." };
  if (zmeny.length > 2000) return { error: "Najednou jde uložit nejvýš 2000 plateb." };

  const dnes = new Date().toISOString().slice(0, 10);
  const navrh = new Map((await nactiNavrhPlatby(propertyId)).map((p) => [p.klic, p]));
  const ulozit: { klic: string; datum: string; castka: number }[] = [];
  const zrusit: string[] = [];
  for (const z of zmeny) {
    const p = navrh.get(z.klic);
    if (!p) return { error: "Některá platba už není v návrhu (změnila se smlouva nebo služba). Načti stránku znovu." };
    if (p.zaplaceno?.zdroj === "POHYB") continue; // starsi pohyb se tu nemeni
    if (!z.datum) { if (p.zaplaceno) zrusit.push(z.klic); continue; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(z.datum) || Number.isNaN(Date.parse(z.datum))) return { error: "Datum zaplacení zadej jako platné datum." };
    if (z.datum > dnes) return { error: "Datum zaplacení nemůže být v budoucnu." };
    if (!Number.isFinite(z.castka) || z.castka <= 0) return { error: "Zaplacená částka musí být větší než nula." };
    ulozit.push({ klic: z.klic, datum: z.datum, castka: Math.round(z.castka * 100) / 100 });
  }

  await prisma.$transaction([
    ...ulozit.map((u) => prisma.pravidelnaPlatba.upsert({
      where: { klic: u.klic },
      update: { paidAt: new Date(u.datum), amount: u.castka },
      create: { propertyId, klic: u.klic, paidAt: new Date(u.datum), amount: u.castka },
    })),
    prisma.pravidelnaPlatba.deleteMany({ where: { propertyId, klic: { in: zrusit } } }),
  ]);

  revalidatePath(`/properties/${propertyId}`);
  const casti = [ulozit.length ? `zapsáno ${ulozit.length} zaplacených` : null, zrusit.length ? `zrušeno ${zrusit.length}` : null].filter(Boolean);
  return { success: casti.length ? `Uloženo: ${casti.join(", ")}.` : "Beze změny." };
}

/**
 * Smaze zauctovane pravidelne platby (jen ty s klicem, rucni pohyby se tu nemazou). Smazana platba
 * se v navrhu objevi znovu. Maze jen majitel, stejne jako ostatni pohyby.
 */
export async function smazPlatby(propertyId: string, _prev: PlatbyState, formData: FormData): Promise<PlatbyState> {
  const user = await getSession();
  if (!user) return { error: "Nejsi přihlášen." };
  if (user.role !== "OWNER") return { error: "Zaúčtované platby může mazat jen majitel." };

  const ids = formData.getAll("id").map(String).filter(Boolean);
  if (ids.length === 0) return { error: "Nic není vybráno." };

  const vysledek = await prisma.transaction.deleteMany({ where: { id: { in: ids }, propertyId, sourceKey: { not: null } } });
  for (const cesta of [`/properties/${propertyId}`, "/properties", "/", "/cashflow"]) revalidatePath(cesta);
  return { success: `Smazáno ${vysledek.count} plateb. V návrhu se objeví znovu.` };
}
