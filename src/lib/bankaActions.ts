"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getSession } from "./auth";
import { prisma } from "./db";
import { synchronizujFio } from "./fioSync";
import { sparujKratkodoby, sparujSeSmlouvou } from "./parovani";
import { normalizujUcet } from "./fio";

async function majitel(): Promise<string | null> {
  const user = await getSession();
  if (!user) return "Nejsi přihlášen.";
  if (user.role !== "OWNER") return "Tuhle změnu může provést jen majitel.";
  return null;
}

const obnov = (propertyId?: string | null) => {
  revalidatePath("/banka");
  if (propertyId) revalidatePath(`/properties/${propertyId}`);
};

export async function stahnoutZBanky(): Promise<{ error?: string; success?: string }> {
  const chyba = await majitel();
  if (chyba) return { error: chyba };
  const r = await synchronizujFio();
  revalidatePath("/banka");
  revalidatePath("/properties", "layout");
  if (r.error) return { error: r.error };
  return { success: `Staženo ${r.novych} nových pohybů, spárováno ${r.sparovano}, ke kontrole ${r.keKontrole}.` };
}

/** Potvrzeni parovani: platbu uhradi predpisy zvolene smlouvy a ucet si smlouva zapamatuje. */
export async function priraditPohyb(pohybId: string, leaseId: string): Promise<{ error?: string; success?: string }> {
  const chyba = await majitel();
  if (chyba) return { error: chyba };
  const r = await sparujSeSmlouvou(pohybId, leaseId);
  const p = await prisma.bankovniPohyb.findUnique({ where: { id: pohybId }, select: { propertyId: true } });
  obnov(p?.propertyId);
  revalidatePath("/properties", "layout");
  return r.ok ? { success: r.zprava } : { error: r.zprava };
}

/** Platba je prijem z kratkodobeho pronajmu daneho bytu (ucet si byt zapamatuje). */
export async function priraditKratkodoby(pohybId: string, propertyId: string): Promise<{ error?: string; success?: string }> {
  const chyba = await majitel();
  if (chyba) return { error: chyba };
  const r = await sparujKratkodoby(pohybId, propertyId);
  obnov(propertyId);
  revalidatePath(`/properties/${propertyId}/kratkodoby`);
  return r.ok ? { success: r.zprava } : { error: r.zprava };
}

export async function ignorovatPohyb(pohybId: string): Promise<{ error?: string }> {
  const chyba = await majitel();
  if (chyba) return { error: chyba };
  await prisma.bankovniPohyb.update({ where: { id: pohybId }, data: { stav: "IGNOROVANO" } });
  obnov();
  return {};
}

/** Zrusi parovani: uhrazene predpisy jsou zase nezaplacene, pohyb jde ke kontrole. */
export async function zrusitParovani(pohybId: string): Promise<{ error?: string }> {
  const chyba = await majitel();
  if (chyba) return { error: chyba };
  const p = await prisma.bankovniPohyb.findUnique({ where: { id: pohybId } });
  if (!p) return {};
  const vyuct = (p.parovani as { vyuctovani?: string } | null)?.vyuctovani;
  const kratkodoby = (p.parovani as { kratkodoby?: string } | null)?.kratkodoby;
  await prisma.$transaction([
    prisma.pravidelnaPlatba.deleteMany({ where: { pohybId } }),
    ...(vyuct ? [prisma.tenantStatement.update({ where: { id: vyuct }, data: { status: "ODESLANO", settledAt: null, settledNote: null } })] : []),
    ...(kratkodoby ? [prisma.transaction.deleteMany({ where: { id: kratkodoby } })] : []),
    prisma.bankovniPohyb.update({ where: { id: pohybId }, data: { stav: "KE_KONTROLE", parovani: Prisma.DbNull, leaseId: null, poznamka: "Párování zrušeno." } }),
  ]);
  // Omylem prirazena vyplata: ucet uz se k bytu priste sam neparuje
  if (kratkodoby && p.propertyId && p.protiucet) {
    const byt = await prisma.property.findUnique({ where: { id: p.propertyId }, select: { kratkodobeUcty: true } });
    const ucet = normalizujUcet(p.protiucet);
    if (byt && ucet) await prisma.property.update({ where: { id: p.propertyId }, data: { kratkodobeUcty: byt.kratkodobeUcty.filter((u) => u !== ucet) } });
  }
  obnov(p.propertyId);
  revalidatePath("/properties", "layout");
  return {};
}
