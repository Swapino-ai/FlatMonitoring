"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "./db";
import { getSession } from "./auth";
import { aktualizujOdhad, navrhniProNemovitost } from "./market/inzeraty";

export interface TrhState { error?: string; success?: string }

async function majitel() {
  const user = await getSession();
  if (!user) return { error: "Nejsi přihlášen." };
  if (user.role !== "OWNER") return { error: "Tuhle změnu může provést jen majitel." };
  return { ok: true as const };
}

function obnov(propertyId: string) {
  revalidatePath(`/properties/${propertyId}/trh`);
  revalidatePath(`/properties/${propertyId}`);
}

/** Zapne nebo vypne sledovani trhu. Po zapnuti se hned navrhne, co uz v databazi trhu je. */
export async function nastavSledovani(propertyId: string, zapnout: boolean): Promise<TrhState> {
  const auth = await majitel();
  if ("error" in auth) return auth;
  await prisma.property.update({ where: { id: propertyId }, data: { sledovatTrh: zapnout } });
  const navrhu = zapnout ? (await navrhniProNemovitost(propertyId)).novych : 0;
  obnov(propertyId);
  return { success: zapnout ? `Sledování zapnuto${navrhu ? `, ${navrhu} nabídek z databáze čeká na kontrolu` : ""}. Nové nabídky přinese noční sken nebo „Skenovat teď“.` : "Sledování vypnuto. Zařazené nabídky i ocenění zůstávají." };
}

/** Zaradi, vyradi nebo vrati do navrhu vybrane inzeraty a prepocita odhad. */
export async function rozhodniInzeraty(propertyId: string, ids: string[], stav: "ZARAZENO" | "VYRAZENO" | "NAVRH"): Promise<TrhState> {
  const auth = await majitel();
  if ("error" in auth) return auth;
  if (ids.length === 0) return { error: "Nic není vybrané." };
  const zaznamy = await prisma.zarazeniInzeratu.findMany({ where: { propertyId, id: { in: ids } }, include: { inzerat: { select: { dealType: true } } } });
  await prisma.zarazeniInzeratu.updateMany({
    where: { propertyId, id: { in: zaznamy.map((z) => z.id) } },
    data: { stav, rozhodnutoAt: stav === "NAVRH" ? null : new Date() },
  });
  for (const d of new Set(zaznamy.map((z) => z.inzerat.dealType))) {
    await aktualizujOdhad(propertyId, d === "RENT" ? "RENT" : "SALE");
  }
  obnov(propertyId);
  const slovo = stav === "ZARAZENO" ? "Zařazeno" : stav === "VYRAZENO" ? "Vyřazeno" : "Vráceno do návrhů";
  return { success: `${slovo}: ${zaznamy.length}.` };
}

/** Rucne urcena poloha inzeratu (sken ji pak neprepisuje). */
export async function nastavPolohuInzeratu(propertyId: string, inzeratId: string, lat: number, lon: number): Promise<TrhState> {
  const auth = await majitel();
  if ("error" in auth) return auth;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { error: "Neplatná poloha." };
  await prisma.inzerat.update({ where: { id: inzeratId }, data: { latitude: lat, longitude: lon, polohaRucne: true } });
  obnov(propertyId);
  return { success: "Poloha uložena." };
}

/** Projde databazi trhu znovu a doplni navrhy (bez skenu portalu). */
export async function obnovNavrhy(propertyId: string): Promise<TrhState> {
  const auth = await majitel();
  if ("error" in auth) return auth;
  const st = await navrhniProNemovitost(propertyId);
  obnov(propertyId);
  return { success: st.novych ? `Přibylo ${st.novych} návrhů ke kontrole.` : "Nic nového k navržení." };
}
