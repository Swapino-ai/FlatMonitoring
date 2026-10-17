"use server";

import type { Prisma } from "@prisma/client";

import { revalidatePath } from "next/cache";
import { prisma } from "./db";
import { getSession } from "./auth";
import { aktualizujSkupinu, clenoveOceneni, korenOceneni, navrhniProNemovitost } from "./market/inzeraty";

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
  // Propojene oceneni: rozhoduje se u nemovitosti, ze ktere se odhad bere
  const koren = await korenOceneni(propertyId);
  const zaznamy = await prisma.zarazeniInzeratu.findMany({ where: { propertyId: koren, id: { in: ids } } });
  await prisma.zarazeniInzeratu.updateMany({
    where: { propertyId: koren, id: { in: zaznamy.map((z) => z.id) } },
    data: { stav, rozhodnutoAt: stav === "NAVRH" ? null : new Date() },
  });
  await aktualizujSkupinu(koren);
  for (const id of await clenoveOceneni(koren)) obnov(id);
  const slovo = stav === "ZARAZENO" ? "Zařazeno" : stav === "VYRAZENO" ? "Vyřazeno" : "Vráceno do návrhů";
  return { success: `${slovo}: ${zaznamy.length}.` };
}

/** Vyloucit / vratit obec (klikaci filtr). Vyloucena obec se uz nenavrhuje a jeji navrhy zmizi. */
export async function prepniVyloucenouObec(propertyId: string, obec: string): Promise<TrhState> {
  const auth = await majitel();
  if ("error" in auth) return auth;
  const koren = await korenOceneni(propertyId);
  const p = await prisma.property.findUnique({ where: { id: koren }, select: { excludedCities: true } });
  const seznam = (p?.excludedCities ?? "").split(",").map((m) => m.trim()).filter(Boolean);
  const je = seznam.some((m) => m.toLowerCase() === obec.toLowerCase());
  const novy = je ? seznam.filter((m) => m.toLowerCase() !== obec.toLowerCase()) : [...seznam, obec];
  await prisma.property.update({ where: { id: koren }, data: { excludedCities: novy.join(", ") || null } });
  await navrhniProNemovitost(koren);
  for (const id of await clenoveOceneni(koren)) obnov(id);
  return { success: je ? `${obec} se zase započítává.` : `${obec} vyloučena, její návrhy zmizely.` };
}

/** Vlastnosti bytu pro vahy srovnani (typ domu, stav). */
/** Do JSON vlastnosti zapise (nebo smaze) jednu hodnotu. */
function sVlastnosti(puvodni: unknown, klic: string, hodnota: string | null): Prisma.InputJsonValue {
  const v = { ...((puvodni && typeof puvodni === "object" ? puvodni : {}) as Record<string, string>) };
  if (hodnota) v[klic] = hodnota; else delete v[klic];
  return v;
}

/** Vlastnost nemovitosti podle profilu typu (u bytu i starsi sloupce typDomu / stavBytu). */
export async function nastavVlastnostBytu(propertyId: string, klic: string, hodnota: string | null): Promise<TrhState> {
  const auth = await majitel();
  if ("error" in auth) return auth;
  const p = await prisma.property.findUnique({ where: { id: propertyId }, select: { vlastnosti: true } });
  if (!p) return { error: "Nemovitost nenalezena." };
  await prisma.property.update({
    where: { id: propertyId },
    data: { vlastnosti: sVlastnosti(p.vlastnosti, klic, hodnota), ...(klic === "typDomu" || klic === "stavBytu" ? { [klic]: hodnota } : {}) },
  });
  await aktualizujSkupinu(propertyId);
  obnov(propertyId);
  return {};
}

/** Vlastnost a rucni vaha zarazene nabidky. */
export async function nastavVlastnostNabidky(propertyId: string, zarazeniId: string, data: { vlastnost?: { klic: string; hodnota: string | null }; vahaRucne?: number | null }): Promise<TrhState> {
  const auth = await majitel();
  if ("error" in auth) return auth;
  const koren = await korenOceneni(propertyId);
  const z = await prisma.zarazeniInzeratu.findFirst({ where: { id: zarazeniId, propertyId: koren }, select: { vlastnosti: true } });
  if (!z) return { error: "Nabídka nenalezena." };
  const { klic, hodnota } = data.vlastnost ?? {};
  await prisma.zarazeniInzeratu.update({
    where: { id: zarazeniId },
    data: {
      ...(data.vahaRucne !== undefined ? { vahaRucne: data.vahaRucne } : {}),
      ...(klic ? { vlastnosti: sVlastnosti(z.vlastnosti, klic, hodnota ?? null), ...(klic === "typDomu" || klic === "stavBytu" ? { [klic]: hodnota ?? null } : {}) } : {}),
    },
  });
  await aktualizujSkupinu(koren);
  for (const id of await clenoveOceneni(koren)) obnov(id);
  return {};
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

/**
 * Propoji oceneni: nemovitost bude pouzivat zarazene nabidky jine (odhad = jeji median za m2 x vlastni plocha).
 * Obe zustavaji samostatne nemovitosti; jen odhad maji spolecny. cilId = null propojeni zrusi.
 */
export async function nastavOceneniPodle(propertyId: string, cilId: string | null): Promise<TrhState> {
  const auth = await majitel();
  if ("error" in auth) return auth;
  if (cilId) {
    const koren = await korenOceneni(cilId);
    if (koren === propertyId) return { error: "Nemovitost nemůže oceňovat sama podle sebe." };
    const zavisle = await prisma.property.count({ where: { oceneniPodle: propertyId } });
    if (zavisle > 0) return { error: "Podle této nemovitosti se už oceňují jiné. Propoj je raději opačně." };
    await prisma.property.update({ where: { id: propertyId }, data: { oceneniPodle: koren } });
    // Vlastni navrhy uz nikdo neuvidi (rozhoduje se u korene) — pryc s nimi
    await prisma.zarazeniInzeratu.deleteMany({ where: { propertyId, stav: "NAVRH" } });
  } else {
    await prisma.property.update({ where: { id: propertyId }, data: { oceneniPodle: null } });
  }
  await aktualizujSkupinu(propertyId);
  obnov(propertyId);
  return { success: cilId ? "Ocenění propojeno." : "Propojení zrušeno, nemovitost má zase vlastní nabídky." };
}
