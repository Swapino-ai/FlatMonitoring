"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "./auth";
import { prisma } from "./db";
import { ChybaDisku, doKose, odvolej, otestuj, prejmenuj } from "./googleDrive";
import { bezKolize, jeKategorie, navrhNazvu } from "./dokumenty";
import { podkladNazvu } from "./soubory";

export interface DokumentyFormState {
  error?: string;
  success?: string;
}

async function majitel() {
  const user = await getSession();
  if (!user) return { error: "Nejsi přihlášen." };
  if (user.role !== "OWNER") return { error: "Tuhle změnu může provést jen majitel." };
  return { ok: true as const };
}

/** Smaze dokument z evidence a presune soubor na Disku do kose (jde vratit primo na Disku). */
export async function smazDokument(_prev: DokumentyFormState, formData: FormData): Promise<DokumentyFormState> {
  const auth = await majitel();
  if ("error" in auth) return auth;

  const dok = await prisma.dokument.findUnique({ where: { id: String(formData.get("id") ?? "") } });
  if (!dok) return { error: "Dokument neexistuje." };
  try {
    await doKose(dok.driveId);
  } catch (e) {
    return { error: e instanceof ChybaDisku ? e.message : "Soubor se nepodařilo smazat na Disku." };
  }
  await prisma.dokument.delete({ where: { id: dok.id } });
  if (dok.propertyId) revalidatePath(`/properties/${dok.propertyId}`);
  revalidatePath("/sprava");
  return { success: `Dokument „${dok.name}“ smazán (na Disku je v koši).` };
}

/** Poznamka k dokumentu — jedno misto, kam napsat, co v souboru je. */
export async function poznamkaDokumentu(_prev: DokumentyFormState, formData: FormData): Promise<DokumentyFormState> {
  const auth = await majitel();
  if ("error" in auth) return auth;
  const id = String(formData.get("id") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;
  const dok = await prisma.dokument.update({ where: { id }, data: { note } }).catch(() => null);
  if (!dok) return { error: "Dokument neexistuje." };
  if (dok.propertyId) revalidatePath(`/properties/${dok.propertyId}`);
  return { success: "Poznámka uložena." };
}

export async function otestujDisk(): Promise<DokumentyFormState> {
  const auth = await majitel();
  if ("error" in auth) return auth;
  try {
    const v = await otestuj();
    return { success: `Disk funguje${v.email ? ` (účet ${v.email})` : ""}: zkušební soubor se nahrál a smazal.` };
  } catch (e) {
    return { error: e instanceof ChybaDisku ? e.message : "Zkouška se nezdařila." };
  }
}

/** Odpojeni: odvola pristup u Googlu a zapomene slozky. Soubory na Disku zustavaji. */
export async function odpojDisk(): Promise<DokumentyFormState> {
  const auth = await majitel();
  if ("error" in auth) return auth;
  const s = await prisma.googleConnection.findUnique({ where: { id: "main" } });
  if (!s) return { error: "Disk není připojený." };
  await odvolej(s.refreshToken);
  await prisma.$transaction([
    prisma.googleConnection.delete({ where: { id: "main" } }),
    prisma.driveFolder.deleteMany(),
  ]);
  revalidatePath("/sprava");
  return { success: "Disk odpojen. Nahrané soubory na něm zůstaly, evidence v aplikaci také." };
}

/**
 * Prejmenuje vsechny nahrane soubory na citelne nazvy podle toho, k cemu patri
 * ("Vyúčtování Elektřina (ČEZ prodej) – Nový Bor – 2025.pdf"). Puvodni nazev se zapise
 * do poznamky, kdyz je prazdna. Fotky a Ostatni zustanou, jak jsou.
 */
export async function prejmenujDokumenty(): Promise<DokumentyFormState> {
  const auth = await majitel();
  if ("error" in auth) return auth;
  const vse = await prisma.dokument.findMany({ orderBy: { createdAt: "asc" } });
  // Nejdriv nazvy pro vsechny, aby se stejne pojmenovane ocislovaly v poradi nahrani
  const cil = new Map<string, string>();
  const obsazene = new Set<string>();
  for (const d of vse) {
    if (!jeKategorie(d.kategorie)) { obsazene.add(d.name); continue; }
    const navrh = navrhNazvu(await podkladNazvu(d.kategorie, {
      propertyId: d.propertyId, tenantId: d.tenantId, leaseId: d.leaseId, serviceId: d.serviceId,
      settlementId: d.settlementId, statementId: d.statementId, rok: d.rok,
    }), d.name);
    const nazev = bezKolize(navrh, obsazene);
    obsazene.add(nazev);
    cil.set(d.id, nazev);
  }
  let hotovo = 0, chyb = 0;
  const zmeny = vse.filter((d) => cil.get(d.id) && cil.get(d.id) !== d.name);
  for (let i = 0; i < zmeny.length; i += 5) {
    await Promise.all(zmeny.slice(i, i + 5).map(async (d) => {
      const nazev = cil.get(d.id)!;
      try {
        await prejmenuj(d.driveId, nazev);
        await prisma.dokument.update({ where: { id: d.id }, data: { name: nazev, ...(d.note ? {} : { note: `Původně: ${d.name}` }) } });
        hotovo++;
      } catch {
        chyb++;
      }
    }));
  }
  revalidatePath("/properties", "layout");
  revalidatePath("/sprava");
  if (!zmeny.length) return { success: "Všechny soubory už mají správné názvy." };
  return chyb
    ? { error: `Přejmenováno ${hotovo} souborů, ${chyb} se nepodařilo (smazané na Disku nebo bez přístupu).` }
    : { success: `Přejmenováno ${hotovo} souborů. Původní název je v poznámce u souboru.` };
}
