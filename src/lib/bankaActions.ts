"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getSession } from "./auth";
import { prisma } from "./db";
import { synchronizujFio } from "./fioSync";
import { sparujSeSmlouvou } from "./parovani";

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
  await prisma.$transaction([
    prisma.pravidelnaPlatba.deleteMany({ where: { pohybId } }),
    ...(vyuct ? [prisma.tenantStatement.update({ where: { id: vyuct }, data: { status: "ODESLANO", settledAt: null, settledNote: null } })] : []),
    prisma.bankovniPohyb.update({ where: { id: pohybId }, data: { stav: "KE_KONTROLE", parovani: Prisma.DbNull, leaseId: null, poznamka: "Párování zrušeno." } }),
  ]);
  obnov(p.propertyId);
  revalidatePath("/properties", "layout");
  return {};
}
