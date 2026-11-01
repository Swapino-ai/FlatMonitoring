"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "./auth";
import { prisma } from "./db";
import { CATEGORY_MAP } from "./categories";
import { bezpecneJmeno, cestaSlozek } from "./dokumenty";
import { ChybaDisku, doKose, nahrajPrimo, zajistiCestu } from "./googleDrive";
import { aiNastaveno, prectiUctenkuAi, type UctenkaAi } from "./uctenkaAi";

async function majitel(): Promise<string | null> {
  const user = await getSession();
  if (!user) return "Nejsi přihlášen.";
  if (user.role !== "OWNER") return "Tuhle změnu může provést jen majitel.";
  return null;
}

const obnov = (propertyId: string) => {
  revalidatePath(`/properties/${propertyId}/kratkodoby`);
  revalidatePath(`/properties/${propertyId}`);
};
const datum = (iso: string) => new Date(`${iso}T00:00:00Z`);
const jeDatum = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
/** Fotky se pred odeslanim zmensuji; PDF a vetsi soubory az do limitu tela pozadavku na Vercelu */
const MAX_SOUBOR = 2_600_000;
const POVOLENE = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

/** Ulozi obdobi kratkodobeho pronajmu (nove nebo upravene). */
export async function ulozObdobi(propertyId: string, v: { id?: string; od: string; do: string | null; poznamka?: string | null }): Promise<{ error?: string }> {
  const chyba = await majitel();
  if (chyba) return { error: chyba };
  if (!jeDatum(v.od)) return { error: "Vyplň, od kdy se byt pronajímá krátkodobě." };
  if (v.do && (!jeDatum(v.do) || v.do < v.od)) return { error: "Konec období nemůže být před začátkem." };
  const data = { od: datum(v.od), do: v.do ? datum(v.do) : null, poznamka: v.poznamka?.trim() || null };
  if (v.id) await prisma.kratkodobeObdobi.update({ where: { id: v.id }, data });
  else await prisma.kratkodobeObdobi.create({ data: { propertyId, ...data } });
  obnov(propertyId);
  return {};
}

export async function smazObdobi(propertyId: string, id: string): Promise<{ error?: string }> {
  const chyba = await majitel();
  if (chyba) return { error: chyba };
  await prisma.kratkodobeObdobi.deleteMany({ where: { id, propertyId } });
  obnov(propertyId);
  return {};
}

/** Precte uctenku AI (nic neuklada) — vysledek je navrh do formulare. */
export async function prectiUctenku(v: { data: string; mime: string }): Promise<{ error?: string; uctenka?: UctenkaAi }> {
  const chyba = await majitel();
  if (chyba) return { error: chyba };
  if (!aiNastaveno()) return { error: "Čtení účtenek není zapnuté — chybí ANTHROPIC_API_KEY v nastavení Vercelu. Vyplň údaje ručně." };
  if (!POVOLENE.includes(v.mime)) return { error: "Účtenku nahraj jako fotku (JPEG, PNG) nebo PDF." };
  if (v.data.length * 0.75 > MAX_SOUBOR) return { error: "Soubor je moc velký (max. 2,5 MB)." };
  try {
    return { uctenka: await prectiUctenkuAi(v.data, v.mime) };
  } catch (e) {
    console.error("Čtení účtenky:", e);
    return { error: "Účtenku se nepodařilo přečíst — vyplň údaje ručně." };
  }
}

/**
 * Zapise prijem nebo naklad krátkodobého pronájmu, volitelne s uctenkou (ulozi se na Google
 * Disk do 08 Krátkodobý pronájem/<rok>/ a pripoji k pohybu).
 */
export async function ulozPolozku(propertyId: string, v: {
  datum: string; castka: number; kategorie: string; popis?: string | null;
  soubor?: { data: string; mime: string; nazev: string } | null;
}): Promise<{ error?: string; success?: string }> {
  const chyba = await majitel();
  if (chyba) return { error: chyba };
  const kat = CATEGORY_MAP.get(v.kategorie);
  if (!kat?.kratkodoby) return { error: "Vyber kategorii." };
  if (!jeDatum(v.datum)) return { error: "Vyplň datum." };
  if (!Number.isFinite(v.castka) || v.castka <= 0) return { error: "Vyplň částku." };
  if (v.soubor && (!POVOLENE.includes(v.soubor.mime) || v.soubor.data.length * 0.75 > MAX_SOUBOR)) return { error: "Účtenku nahraj jako fotku nebo PDF do 2,5 MB." };
  const nemovitost = await prisma.property.findUnique({ where: { id: propertyId }, select: { name: true } });
  if (!nemovitost) return { error: "Nemovitost neexistuje." };

  const popis = v.popis?.trim() || null;
  const t = await prisma.transaction.create({
    data: {
      propertyId, date: datum(v.datum), amount: kat.kind === "INCOME" ? v.castka : -v.castka, category: kat.key,
      description: popis, taxTreatment: kat.defaultTaxTreatment,
    },
  });

  // Uctenka na Disk (kdyz je pripojeny); bez Disku se pohyb ulozi i tak
  let poznamka = "";
  if (v.soubor) {
    try {
      const rok = Number(v.datum.slice(0, 4));
      const cesta = cestaSlozek({ kategorie: "UCTENKA", propertyId, propertyNazev: nemovitost.name, rok });
      const slozka = await zajistiCestu(cesta);
      const pripona = v.soubor.mime === "application/pdf" ? "pdf" : v.soubor.mime === "image/png" ? "png" : v.soubor.mime === "image/webp" ? "webp" : "jpg";
      const [r, m, d] = v.datum.split("-");
      const nazev = `${bezpecneJmeno(`Účtenka ${kat.label}${popis ? ` – ${popis}` : ""} – ${nemovitost.name} – ${Number(d)}.${Number(m)}.${r}`).slice(0, 150)}.${pripona}`;
      const bajty = Buffer.from(v.soubor.data, "base64");
      const driveId = await nahrajPrimo({ rodicId: slozka, nazev, mime: v.soubor.mime, data: new Uint8Array(bajty) });
      await prisma.dokument.create({
        data: { driveId, name: nazev, mime: v.soubor.mime, size: bajty.length, kategorie: "UCTENKA", propertyId, rok, transactionId: t.id },
      });
    } catch (e) {
      poznamka = e instanceof ChybaDisku ? ` Účtenka se neuložila: ${e.message}` : " Účtenka se neuložila (Google Disk).";
    }
  }
  obnov(propertyId);
  return poznamka ? { error: `Zapsáno, ale${poznamka.charAt(1).toLowerCase()}${poznamka.slice(2)}` } : { success: kat.kind === "INCOME" ? "Příjem zapsán." : "Náklad zapsán." };
}

/** Smaze polozku i s uctenkou (ta jde na Disku do kose). */
export async function smazPolozku(propertyId: string, transactionId: string): Promise<{ error?: string }> {
  const chyba = await majitel();
  if (chyba) return { error: chyba };
  const t = await prisma.transaction.findFirst({ where: { id: transactionId, propertyId } });
  if (!t || !CATEGORY_MAP.get(t.category)?.kratkodoby) return { error: "Položka neexistuje." };
  for (const d of await prisma.dokument.findMany({ where: { transactionId } })) {
    await doKose(d.driveId).catch(() => undefined);
    await prisma.dokument.delete({ where: { id: d.id } });
  }
  await prisma.transaction.delete({ where: { id: t.id } });
  obnov(propertyId);
  return {};
}
