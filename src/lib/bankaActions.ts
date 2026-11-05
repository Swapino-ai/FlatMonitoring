"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getSession } from "./auth";
import { prisma } from "./db";
import { synchronizujFio } from "./fioSync";
import { cilZTextu, sparujKratkodoby, sparujSeSmlouvou, sparujVydaj } from "./parovani";
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

/** Ignorovanou platbu vrati mezi platby ke kontrole. */
export async function vratitKeKontrole(pohybId: string): Promise<{ error?: string }> {
  const chyba = await majitel();
  if (chyba) return { error: chyba };
  await prisma.bankovniPohyb.updateMany({ where: { id: pohybId, stav: "IGNOROVANO" }, data: { stav: "KE_KONTROLE" } });
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
  // Odchozi: zauctovany vydaj pryc, vratka preplatku zase nevyporadana
  const vydaj = (p.parovani as { vydaj?: string; transakce?: string } | null);
  const cil = vydaj?.vydaj ? cilZTextu(vydaj.vydaj) : null;
  await prisma.$transaction([
    ...(vydaj?.transakce ? [prisma.transaction.deleteMany({ where: { id: vydaj.transakce } })] : []),
    ...(cil?.typ === "vratka" ? [prisma.tenantStatement.update({ where: { id: cil.statementId }, data: { status: "ODESLANO", settledAt: null, settledNote: null } })] : []),
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

/** Odchozi platbu priradi k predpisu (sluzba, splatka, nedoplatek), k vratce preplatku nebo jako vydaj nemovitosti. */
export async function priraditVydaj(pohybId: string, cil: string): Promise<{ error?: string; success?: string }> {
  const chyba = await majitel();
  if (chyba) return { error: chyba };
  const c = cilZTextu(cil);
  if (!c) return { error: "Vyber, kam platba patří." };
  const r = await sparujVydaj(pohybId, c);
  const p = await prisma.bankovniPohyb.findUnique({ where: { id: pohybId }, select: { propertyId: true } });
  obnov(p?.propertyId);
  revalidatePath("/properties", "layout");
  return r.ok ? { success: r.zprava } : { error: r.zprava };
}

/** Vlastni poznamka k pohybu (prazdna = smazat). */
export async function ulozPoznamkuPohybu(pohybId: string, text: string): Promise<{ error?: string }> {
  const chyba = await majitel();
  if (chyba) return { error: chyba };
  await prisma.bankovniPohyb.update({ where: { id: pohybId }, data: { mojePoznamka: text.trim().slice(0, 500) || null } });
  // Poznamka je videt i u nemovitosti (stav uctu, pohyby, kratkodoby pronajem)
  revalidatePath("/banka");
  revalidatePath("/properties", "layout");
  return {};
}
