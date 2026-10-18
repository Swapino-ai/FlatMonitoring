"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "./db";
import { getSession } from "./auth";
import { DRUH_MERAKU_MAP } from "./meraky";

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
  const posledni = await prisma.merak.findFirst({ where: { propertyId }, orderBy: { poradi: "desc" }, select: { poradi: true } });
  const m = await prisma.merak.create({
    data: { propertyId, druh, nazev: stejne > 0 ? String(stejne + 1) : null, poradi: (posledni?.poradi ?? 0) + 1 },
  });
  obnov(propertyId);
  return { id: m.id };
}

export async function upravMerak(id: string, data: { nazev?: string | null; cislo?: string | null; aktivni?: boolean; dvoutarif?: boolean }): Promise<{ error?: string }> {
  const chyba = await smiMenit();
  if (chyba) return { error: chyba };
  const cist = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim() || null);
  const m = await prisma.merak.update({ where: { id }, data: { nazev: cist(data.nazev), cislo: cist(data.cislo), aktivni: data.aktivni, dvoutarif: data.dvoutarif } });
  obnov(m.propertyId);
  return {};
}

/** Smaze merak i se stavy; kdyz uz ma zapsane stavy, jen ho vyradi (historie zustane). */
export async function smazMerak(id: string): Promise<{ error?: string }> {
  const chyba = await smiMenit();
  if (chyba) return { error: chyba };
  const m = await prisma.merak.findUnique({ where: { id }, include: { _count: { select: { stavy: true } } } });
  if (!m) return {};
  if (m._count.stavy > 0) await prisma.merak.update({ where: { id }, data: { aktivni: false } });
  else await prisma.merak.delete({ where: { id } });
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
  merakId: string; leaseId: string | null; udalost: "ZACATEK" | "KONEC" | "ODECET";
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
        // Jiny odecet: radek je dany dnem
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
  if (v.udalost !== "ODECET") {
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
