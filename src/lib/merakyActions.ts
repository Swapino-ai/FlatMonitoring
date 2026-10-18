"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { getSession } from "./auth";
import { DRUH_MERAKU_MAP } from "./meraky";
import { svjNastaveno, synchronizujSvj } from "./svj";

async function smiMenit(): Promise<string | null> {
  const user = await getSession();
  if (!user) return "Nejsi přihlášen.";
  if (user.role !== "OWNER") return "Tuhle změnu může provést jen majitel.";
  return null;
}

const obnov = (propertyId: string) => revalidatePath(`/properties/${propertyId}/meraky`);

/** Prida merak daneho druhu (jedno kliknuti). Dalsi radiator dostane poradove cislo. */
export async function pridejMerak(propertyId: string, druh: string): Promise<{ error?: string; id?: string }> {
  const chyba = await smiMenit();
  if (chyba) return { error: chyba };
  if (!DRUH_MERAKU_MAP.has(druh)) return { error: "Neznámý druh měřáku." };
  const stejne = await prisma.merak.count({ where: { propertyId, druh, aktivni: true } });
  // Radiatory se nuluji vsechny stejne: novy prevezme den od ostatnich
  const vzor = druh === "RADIATOR" ? await prisma.merak.findFirst({ where: { propertyId, druh, nulovani: { not: null } }, select: { nulovani: true } }) : null;
  const posledni = await prisma.merak.findFirst({ where: { propertyId }, orderBy: { poradi: "desc" }, select: { poradi: true } });
  const m = await prisma.merak.create({
    data: { propertyId, druh, nazev: stejne > 0 ? String(stejne + 1) : null, poradi: (posledni?.poradi ?? 0) + 1, nulovani: vzor?.nulovani ?? null },
  });
  obnov(propertyId);
  return { id: m.id };
}

export async function upravMerak(id: string, data: { nazev?: string | null; cislo?: string | null; aktivni?: boolean; dvoutarif?: boolean; nulovani?: string | null }): Promise<{ error?: string }> {
  const chyba = await smiMenit();
  if (chyba) return { error: chyba };
  const cist = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim() || null);
  const m = await prisma.merak.update({ where: { id }, data: { nazev: cist(data.nazev), cislo: cist(data.cislo), aktivni: data.aktivni, dvoutarif: data.dvoutarif,
    ...(data.nulovani !== undefined ? { nulovani: data.nulovani && /^\d{2}-\d{2}$/.test(data.nulovani) ? data.nulovani : null } : {}) } });
  obnov(m.propertyId);
  return {};
}

/** Smaze merak i se vsemi stavy (archivuje se vymenou, ne mazanim). */
export async function smazMerak(id: string): Promise<{ error?: string }> {
  const chyba = await smiMenit();
  if (chyba) return { error: chyba };
  const m = await prisma.merak.findUnique({ where: { id } });
  if (!m) return {};
  await prisma.merak.delete({ where: { id } });
  obnov(m.propertyId);
  return {};
}

/**
 * Zapise stav meraku k udalosti najmu (predani / vraceni). U dvoutarifu se T1 a T2 pisou
 * zvlast (tarif 1 / 2). Kdyz zmizi obe hodnoty, stav se smaze.
 * Predani dalsimu najemci ve stejny den ma stejne stavy — kdyz tam jeste nic neni,
 * doplni se tam taky, at se nemusi psat dvakrat.
 */
export async function ulozStav(propertyId: string, v: {
  merakId: string; leaseId: string | null; udalost: "ZACATEK" | "KONEC" | "ODECET" | "VYMENA";
  datum: string; hodnota: number | null; stavId?: string; tarif?: 1 | 2;
}): Promise<{ error?: string; id?: string }> {
  const chyba = await smiMenit();
  if (chyba) return { error: chyba };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.datum)) return { error: "Vyplň datum odečtu." };
  const datum = new Date(`${v.datum}T00:00:00Z`);
  const merak = await prisma.merak.findFirst({ where: { id: v.merakId, propertyId } });
  if (!merak) return { error: "Měřák nepatří k této nemovitosti." };

  const existujici = v.stavId
    ? await prisma.stavMeraku.findUnique({ where: { id: v.stavId } })
    : await prisma.stavMeraku.findFirst({
      where: v.leaseId
        ? { merakId: v.merakId, leaseId: v.leaseId, udalost: v.udalost }
        // Prubezny odecet: radek je dany dnem
        : { merakId: v.merakId, leaseId: null, udalost: v.udalost, datum },
    });

  const pole = v.tarif === 2 ? "hodnota2" : "hodnota";
  const hodnota = v.hodnota != null && Number.isFinite(v.hodnota) ? v.hodnota : null;
  if (hodnota == null) {
    if (existujici) {
      const druhe = pole === "hodnota" ? existujici.hodnota2 : existujici.hodnota;
      if (druhe == null) await prisma.stavMeraku.delete({ where: { id: existujici.id } });
      else await prisma.stavMeraku.update({ where: { id: existujici.id }, data: { [pole]: null } });
    }
    obnov(propertyId);
    return {};
  }
  const ulozeny = existujici
    ? await prisma.stavMeraku.update({ where: { id: existujici.id }, data: { [pole]: hodnota, datum } })
    : await prisma.stavMeraku.create({ data: { merakId: v.merakId, leaseId: v.leaseId, udalost: v.udalost, datum, [pole]: hodnota } });

  // Vraceni a predani dalsimu najemci tyz den: stejny stav
  if (v.udalost === "ZACATEK" || v.udalost === "KONEC") {
    const druha = v.udalost === "KONEC" ? "ZACATEK" : "KONEC";
    const smlouvy = await prisma.lease.findMany({
      where: { propertyId, id: { not: v.leaseId ?? undefined }, ...(druha === "ZACATEK" ? { startDate: datum } : { endDate: datum }) },
      select: { id: true },
    });
    for (const s of smlouvy) {
      const ma = await prisma.stavMeraku.findFirst({ where: { merakId: v.merakId, leaseId: s.id, udalost: druha } });
      if (!ma) await prisma.stavMeraku.create({ data: { merakId: v.merakId, leaseId: s.id, udalost: druha, datum, [pole]: hodnota } });
      else if (ma[pole] == null) await prisma.stavMeraku.update({ where: { id: ma.id }, data: { [pole]: hodnota } });
    }
  }
  obnov(propertyId);
  return { id: ulozeny.id };
}

/** Zmeni datum u vsech stavu jedne udalosti (radku protokolu). */
export async function zmenDatumUdalosti(propertyId: string, v: { leaseId: string | null; udalost: string; puvodni: string; datum: string }): Promise<{ error?: string }> {
  const chyba = await smiMenit();
  if (chyba) return { error: chyba };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.datum)) return { error: "Neplatné datum." };
  await prisma.stavMeraku.updateMany({
    where: { merak: { propertyId }, leaseId: v.leaseId, udalost: v.udalost, ...(v.leaseId ? {} : { datum: new Date(`${v.puvodni}T00:00:00Z`) }) },
    data: { datum: new Date(`${v.datum}T00:00:00Z`) },
  });
  obnov(propertyId);
  return {};
}

/**
 * Vymena meraku: stary se archivuje (zustane se stavy v historii), novy ho nahradi.
 * K datu vymeny se zapise konecny stav stareho a pocatecni stav noveho — spotreba
 * se pak pocita pres oba (najem i vyuctovani).
 */
export async function vymenMerak(propertyId: string, v: {
  merakId: string; datum: string;
  konecny: number | null; konecny2?: number | null;
  pocatecni: number | null; pocatecni2?: number | null;
  cislo?: string | null;
}): Promise<{ error?: string }> {
  const chyba = await smiMenit();
  if (chyba) return { error: chyba };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.datum)) return { error: "Vyplň datum výměny." };
  const cisty = (n: number | null | undefined) => (n != null && Number.isFinite(n) ? n : null);
  v = { ...v, konecny: cisty(v.konecny), konecny2: cisty(v.konecny2), pocatecni: cisty(v.pocatecni), pocatecni2: cisty(v.pocatecni2) };
  const stary = await prisma.merak.findFirst({ where: { id: v.merakId, propertyId, aktivni: true } });
  if (!stary) return { error: "Měřák nenalezen." };
  if (v.konecny == null) return { error: "Vyplň konečný stav starého měřáku." };
  if (stary.dvoutarif && v.konecny2 == null) return { error: "Vyplň konečný stav T2 starého měřáku." };
  const datum = new Date(`${v.datum}T00:00:00Z`);
  await prisma.$transaction(async (tx) => {
    await tx.merak.update({ where: { id: stary.id }, data: { aktivni: false, vymenenAt: datum } });
    const novy = await tx.merak.create({
      data: {
        propertyId, druh: stary.druh, nazev: stary.nazev, dvoutarif: stary.dvoutarif, nulovani: stary.nulovani, poradi: stary.poradi,
        cislo: v.cislo?.trim() || null, nahrazujeId: stary.id,
      },
    });
    await tx.stavMeraku.create({ data: { merakId: stary.id, udalost: "VYMENA", datum, hodnota: v.konecny, hodnota2: stary.dvoutarif ? v.konecny2 ?? null : null } });
    await tx.stavMeraku.create({
      data: { merakId: novy.id, udalost: "VYMENA", datum, hodnota: v.pocatecni ?? 0, hodnota2: stary.dvoutarif ? v.pocatecni2 ?? 0 : null },
    });
  });
  obnov(propertyId);
  revalidatePath(`/properties/${propertyId}`);
  return {};
}

/** Cislo bytu nemovitosti v Evidenci SVJ — meraky se tam dohledaji podle svych vyrobnich cisel. */
export async function nastavSvjByt(propertyId: string, byt: string): Promise<{ error?: string }> {
  const chyba = await smiMenit();
  if (chyba) return { error: chyba };
  await prisma.property.update({ where: { id: propertyId }, data: { svjByt: byt.trim() || null, svjSyncAt: null, svjStav: Prisma.DbNull } });
  obnov(propertyId);
  return {};
}

/** Rucni synchronizace se SVJ (cerstva data, bez cache). */
export async function synchronizujSvjTed(propertyId: string): Promise<{ error?: string; prevzato?: number; chyb?: number }> {
  const chyba = await smiMenit();
  if (chyba) return { error: chyba };
  if (!svjNastaveno()) return { error: "Napojení na SVJ není nastavené (SVJ_API_URL, SVJ_API_KLIC na Vercelu)." };
  const v = await synchronizujSvj(propertyId, true);
  obnov(propertyId);
  revalidatePath(`/properties/${propertyId}`);
  const stavy = Object.values(v);
  return { prevzato: stavy.reduce((a, x) => a + x.prevzato, 0), chyb: stavy.filter((x) => x.chyba).length };
}

/** Den rocniho vynulovani pro vsechny radiatory nemovitosti ("MM-DD", null = nenuluji se). */
export async function nastavNulovaniRadiatoru(propertyId: string, nulovani: string | null): Promise<{ error?: string }> {
  const chyba = await smiMenit();
  if (chyba) return { error: chyba };
  if (nulovani && !/^\d{2}-\d{2}$/.test(nulovani)) return { error: "Neplatný den vynulování." };
  await prisma.merak.updateMany({ where: { propertyId, druh: "RADIATOR" }, data: { nulovani } });
  obnov(propertyId);
  return {};
}

/**
 * Smaze cely odecet (radek historie): vsechny stavy meraku nemovitosti k teto udalosti.
 * Predani a vraceni zustanou jako prazdny radek (vznikaji ze smluv). Smazane odecty
 * ze SVJ se zapamatuji, aby je dalsi synchronizace znovu neprevzala.
 */
export async function smazOdecet(propertyId: string, v: { leaseId: string | null; udalost: string; datum: string }): Promise<{ error?: string; smazano?: number }> {
  const chyba = await smiMenit();
  if (chyba) return { error: chyba };
  const where = {
    merak: { propertyId }, udalost: v.udalost,
    ...(v.leaseId ? { leaseId: v.leaseId } : { leaseId: null, datum: new Date(`${v.datum}T00:00:00Z`) }),
  };
  const stavy = await prisma.stavMeraku.findMany({ where, select: { id: true, merakId: true, datum: true, zdroj: true } });
  for (const s of stavy.filter((x) => x.zdroj === "SVJ")) {
    await prisma.merak.update({ where: { id: s.merakId }, data: { svjVynechane: { push: s.datum.toISOString().slice(0, 10) } } });
  }
  const r = await prisma.stavMeraku.deleteMany({ where: { id: { in: stavy.map((x) => x.id) } } });
  obnov(propertyId);
  revalidatePath(`/properties/${propertyId}`);
  return { smazano: r.count };
}
