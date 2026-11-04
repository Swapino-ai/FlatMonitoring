"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "./auth";
import { prisma } from "./db";
import { bezpecneJmeno, cestaSlozek } from "./dokumenty";
import { ChybaDisku, doKose, nahrajPrimo, zajistiCestu } from "./googleDrive";

async function majitel(): Promise<string | null> {
  const user = await getSession();
  if (!user) return "Nejsi přihlášen.";
  if (user.role !== "OWNER") return "Tuhle změnu může provést jen majitel.";
  return null;
}

const obnov = (propertyId: string) => revalidatePath(`/properties/${propertyId}/vykaz`);
const jeDatum = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
/** Fotky se v telefonu pred odeslanim zmensi; jedna fotka = jeden pozadavek (limit tela na Vercelu) */
const MAX_FOTKA = 2_600_000;

/** Ulozi zaznam vykazu prace (novy nebo upraveny). Vraci id kvuli nahrani fotek. */
export async function ulozVykaz(propertyId: string, v: { id?: string; datum: string; kdo: string; minut: number; popis: string }): Promise<{ error?: string; id?: string }> {
  const chyba = await majitel();
  if (chyba) return { error: chyba };
  if (!jeDatum(v.datum)) return { error: "Vyplň datum." };
  const kdo = v.kdo.trim().slice(0, 100);
  if (!kdo) return { error: "Vyplň, kdo pracoval." };
  const minut = Math.round(v.minut);
  if (!Number.isFinite(minut) || minut <= 0 || minut > 24 * 60 * 31) return { error: "Vyplň, kolik času práce zabrala." };
  const popis = v.popis.trim().slice(0, 4000);
  if (!popis) return { error: "Napiš, co se udělalo." };
  const data = { datum: new Date(`${v.datum}T00:00:00Z`), kdo, minut, popis };
  if (v.id) {
    const r = await prisma.vykazPrace.updateMany({ where: { id: v.id, propertyId }, data });
    if (!r.count) return { error: "Záznam neexistuje." };
    obnov(propertyId);
    return { id: v.id };
  }
  const z = await prisma.vykazPrace.create({ data: { propertyId, ...data } });
  obnov(propertyId);
  return { id: z.id };
}

/** Nahraje jednu fotku k zaznamu na Google Disk (Nemovitosti/<byt>/09 Výkaz práce/<rok>/). */
export async function nahrajFotkuVykazu(propertyId: string, vykazId: string, f: { data: string; mime: string }, poradi: number): Promise<{ error?: string }> {
  const chyba = await majitel();
  if (chyba) return { error: chyba };
  if (!["image/jpeg", "image/png", "image/webp"].includes(f.mime) || f.data.length * 0.75 > MAX_FOTKA) return { error: "Fotka je moc velká nebo to není obrázek." };
  const z = await prisma.vykazPrace.findFirst({ where: { id: vykazId, propertyId }, include: { property: { select: { name: true } } } });
  if (!z) return { error: "Záznam neexistuje." };
  try {
    const rok = z.datum.getUTCFullYear();
    const slozka = await zajistiCestu(cestaSlozek({ kategorie: "VYKAZ", propertyId, propertyNazev: z.property.name, rok }));
    const den = `${z.datum.getUTCDate()}.${z.datum.getUTCMonth() + 1}.${rok}`;
    const pripona = f.mime === "image/png" ? "png" : f.mime === "image/webp" ? "webp" : "jpg";
    const nazev = `${bezpecneJmeno(`Výkaz práce – ${z.property.name} – ${den} – ${z.kdo} – ${poradi}`).slice(0, 150)}.${pripona}`;
    const bajty = Buffer.from(f.data, "base64");
    const driveId = await nahrajPrimo({ rodicId: slozka, nazev, mime: f.mime, data: new Uint8Array(bajty) });
    await prisma.dokument.create({ data: { driveId, name: nazev, mime: f.mime, size: bajty.length, kategorie: "VYKAZ", propertyId, rok, vykazId } });
  } catch (e) {
    return { error: e instanceof ChybaDisku ? `Fotka se neuložila: ${e.message}` : "Fotka se neuložila (Google Disk)." };
  }
  obnov(propertyId);
  return {};
}

export async function smazFotkuVykazu(propertyId: string, dokumentId: string): Promise<{ error?: string }> {
  const chyba = await majitel();
  if (chyba) return { error: chyba };
  const d = await prisma.dokument.findFirst({ where: { id: dokumentId, propertyId, vykazId: { not: null } } });
  if (!d) return {};
  await doKose(d.driveId).catch(() => undefined);
  await prisma.dokument.delete({ where: { id: d.id } });
  obnov(propertyId);
  return {};
}

/** Smaze zaznam i s fotkami (na Disku jdou do kose). */
export async function smazVykaz(propertyId: string, id: string): Promise<{ error?: string }> {
  const chyba = await majitel();
  if (chyba) return { error: chyba };
  const z = await prisma.vykazPrace.findFirst({ where: { id, propertyId } });
  if (!z) return {};
  for (const d of await prisma.dokument.findMany({ where: { vykazId: id } })) {
    await doKose(d.driveId).catch(() => undefined);
    await prisma.dokument.delete({ where: { id: d.id } });
  }
  await prisma.vykazPrace.delete({ where: { id } });
  obnov(propertyId);
  return {};
}
