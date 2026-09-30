"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "./auth";
import { doplnPolohu } from "./geokodovani";

export interface PolohaStav {
  error?: string;
  success?: string;
}

/**
 * Dohleda souradnice a kraj k adrese, ktera je uz ulozena.
 *
 * Nemovitosti zalozene pred nasepavacem adres souradnice nemaji. Jinak by je
 * doplnil az nocni sken; tlacitko to udela hned, kdyz na to clovek koukne.
 */
export async function urciPolohu(propertyId: string): Promise<PolohaStav> {
  const user = await getSession();
  if (!user) return { error: "Nejsi přihlášen." };
  if (user.role !== "OWNER") return { error: "Polohu může určit jen majitel." };

  if (!process.env.MAPY_API_KEY) {
    return { error: "Chybí MAPY_API_KEY — bez klíče se adresa nedá převést na polohu. Zkontroluj Správu." };
  }

  const poloha = await doplnPolohu(propertyId);
  if (!poloha || poloha.latitude == null || poloha.longitude == null) {
    return {
      error: "Mapy.cz adresu nenašly. Otevři úpravy a vyber ji z našeptávače, nebo klepni do mapy.",
    };
  }

  revalidatePath(`/properties/${propertyId}`);
  return { success: "Poloha určena." };
}
