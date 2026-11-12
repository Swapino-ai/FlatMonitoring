"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "./auth";
import { prisma } from "./db";
import { categoryLabel } from "./categories";
import { bezpecneJmeno, cestaSlozek } from "./dokumenty";
import { ChybaDisku, doKose, nahrajPrimo, zajistiCestu } from "./googleDrive";

/**
 * Doklady (uctenky, faktury) k pohybum nemovitosti — jen pro vlastni evidenci. Ukladaji se
 * na Google Disk do Nemovitosti/<byt>/10 Doklady k pohybům/<rok>/ a pripojí se k pohybu.
 */
async function majitel(): Promise<string | null> {
  const user = await getSession();
  if (!user) return "Nejsi přihlášen.";
  if (user.role !== "OWNER") return "Tuhle změnu může provést jen majitel.";
  return null;
}

const POVOLENE = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
/** Fotky se pred odeslanim zmensi; PDF az do limitu tela pozadavku */
const MAX_SOUBOR = 2_600_000;

export async function nahrajDokladPohybu(transactionId: string, f: { data: string; mime: string }): Promise<{ error?: string }> {
  const chyba = await majitel();
  if (chyba) return { error: chyba };
  if (!POVOLENE.includes(f.mime)) return { error: "Doklad nahraj jako fotku (JPEG, PNG) nebo PDF." };
  if (f.data.length * 0.75 > MAX_SOUBOR) return { error: "Soubor je moc velký (max. 2,5 MB)." };
  const t = await prisma.transaction.findUnique({ where: { id: transactionId }, include: { property: { select: { id: true, name: true } } } });
  if (!t) return { error: "Pohyb neexistuje." };
  const poradi = await prisma.dokument.count({ where: { transactionId } });
  try {
    const rok = t.date.getUTCFullYear();
    const slozka = await zajistiCestu(cestaSlozek({ kategorie: "DOKLAD", propertyId: t.propertyId, propertyNazev: t.property.name, rok }));
    const den = `${t.date.getUTCDate()}.${t.date.getUTCMonth() + 1}.${rok}`;
    const pripona = f.mime === "application/pdf" ? "pdf" : f.mime === "image/png" ? "png" : f.mime === "image/webp" ? "webp" : "jpg";
    const castka = `${Math.round(Math.abs(t.amount)).toLocaleString("cs-CZ")} Kč`;
    const nazev = `${bezpecneJmeno([`Doklad ${categoryLabel(t.category)}`, t.description?.slice(0, 50), t.property.name, den, castka].filter(Boolean).join(" – ")).slice(0, 150)}${poradi ? ` (${poradi + 1})` : ""}.${pripona}`;
    const bajty = Buffer.from(f.data, "base64");
    const driveId = await nahrajPrimo({ rodicId: slozka, nazev, mime: f.mime, data: new Uint8Array(bajty) });
    await prisma.dokument.create({ data: { driveId, name: nazev, mime: f.mime, size: bajty.length, kategorie: "DOKLAD", propertyId: t.propertyId, rok, transactionId } });
  } catch (e) {
    return { error: e instanceof ChybaDisku ? `Doklad se neuložil: ${e.message}` : "Doklad se neuložil (Google Disk)." };
  }
  revalidatePath(`/properties/${t.propertyId}`);
  return {};
}

export async function smazDokladPohybu(dokumentId: string): Promise<{ error?: string }> {
  const chyba = await majitel();
  if (chyba) return { error: chyba };
  const d = await prisma.dokument.findUnique({ where: { id: dokumentId } });
  if (!d?.transactionId) return {};
  await doKose(d.driveId).catch(() => undefined);
  await prisma.dokument.delete({ where: { id: d.id } });
  if (d.propertyId) revalidatePath(`/properties/${d.propertyId}`);
  return {};
}
