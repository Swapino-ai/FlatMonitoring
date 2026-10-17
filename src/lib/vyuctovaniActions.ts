"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "./db";
import { getSession } from "./auth";
import { prunik, dnuVObdobi, rozdelPodleVah } from "./vyuctovani";
import { mesicniNaklad, sluzbaKDatu } from "./zalohy";
import { nactiNavrhPlatby } from "./pravidelnePlatbyData";

export interface VyuctovaniFormState {
  error?: string;
  success?: string;
  warning?: string;
}

const cislo = (v: FormDataEntryValue | null): number | null => {
  const s = String(v ?? "").replace(/[\s ]/g, "").replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const text = (v: FormDataEntryValue | null) => String(v ?? "").trim() || null;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

async function majitel() {
  const user = await getSession();
  if (!user) return { error: "Nejsi přihlášen." };
  if (user.role !== "OWNER") return { error: "Tuhle změnu může provést jen majitel." };
  return { ok: true as const };
}

function obnov(propertyId: string) {
  revalidatePath(`/properties/${propertyId}`);
}

/** Vyuctovani sluzby od dodavatele (id = uprava, null = nove) vcetne odectu najemcu. */
export async function saveSettlement(
  id: string | null, _prev: VyuctovaniFormState, formData: FormData,
): Promise<VyuctovaniFormState> {
  const auth = await majitel();
  if ("error" in auth) return auth;

  const serviceId = String(formData.get("serviceId") ?? "");
  const od = String(formData.get("periodFrom") ?? "");
  const doDne = String(formData.get("periodTo") ?? "");
  const naklad = cislo(formData.get("totalCost"));
  const zalohy = cislo(formData.get("supplierAdvances")) ?? 0;
  const rezim = formData.get("splitMode") === "READINGS" ? "READINGS" : "DAYS";

  if (!serviceId) return { error: "Vyber službu." };
  if (!ISO.test(od) || !ISO.test(doDne)) return { error: "Zadej období od–do." };
  if (od > doDne) return { error: "Konec období je před začátkem." };
  if (naklad == null || naklad < 0) return { error: "Zadej skutečný náklad za období." };

  const sluzba = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!sluzba) return { error: "Služba neexistuje." };

  // Dve vyuctovani jedne sluzby se nesmi prekryvat: den by se zapocital dvakrat
  const stavajici = await prisma.serviceSettlement.findMany({
    where: { serviceId, ...(id ? { id: { not: id } } : {}) },
  });
  for (const s of stavajici) {
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    if (prunik(od, doDne, iso(s.periodFrom), iso(s.periodTo))) {
      return { error: `Období se překrývá s jiným vyúčtováním této služby (${iso(s.periodFrom)} – ${iso(s.periodTo)}).` };
    }
  }

  const odecty: { leaseId: string; consumption: number }[] = [];
  let spotrebaVlastnik: number | null = null;
  if (rezim === "READINGS") {
    for (const [klic, hodnota] of formData.entries()) {
      if (!klic.startsWith("odecet:")) continue;
      const n = cislo(hodnota);
      if (n != null && n >= 0) odecty.push({ leaseId: klic.slice(7), consumption: n });
    }
    spotrebaVlastnik = cislo(formData.get("ownerConsumption"));
    if (odecty.length === 0 && !spotrebaVlastnik) return { error: "Zadej spotřebu podle odečtů." };
  }

  const data = {
    serviceId,
    periodFrom: new Date(od), periodTo: new Date(doDne),
    totalCost: naklad, supplierAdvances: zalohy,
    splitMode: rezim,
    readingUnit: rezim === "READINGS" ? text(formData.get("readingUnit")) : null,
    ownerConsumption: rezim === "READINGS" ? spotrebaVlastnik : null,
    invoiceNo: text(formData.get("invoiceNo")),
    notes: text(formData.get("notes")),
  };

  await prisma.$transaction(async (tx) => {
    const zaznam = id
      ? await tx.serviceSettlement.update({ where: { id }, data })
      : await tx.serviceSettlement.create({ data });
    await tx.settlementReading.deleteMany({ where: { settlementId: zaznam.id } });
    if (odecty.length) {
      await tx.settlementReading.createMany({
        data: odecty.map((o) => ({ settlementId: zaznam.id, leaseId: o.leaseId, consumption: o.consumption })),
      });
    }
  });

  obnov(sluzba.propertyId);
  const dnu = dnuVObdobi(od, doDne);
  return { success: id ? "Vyúčtování upraveno." : `Vyúčtování uloženo (${dnu} dní).` };
}

export async function deleteSettlement(_prev: VyuctovaniFormState, formData: FormData): Promise<VyuctovaniFormState> {
  const auth = await majitel();
  if ("error" in auth) return auth;

  const zaznam = await prisma.serviceSettlement.findUnique({
    where: { id: String(formData.get("id")) },
    include: { service: { select: { propertyId: true } } },
  });
  if (!zaznam) return { error: "Vyúčtování neexistuje." };

  // Spolecne vyuctovani vice sluzeb se maze cele: jednotlive casti samy o sobe nedavaji smysl
  if (zaznam.batchId) {
    const smazano = await prisma.serviceSettlement.deleteMany({ where: { batchId: zaznam.batchId } });
    obnov(zaznam.service.propertyId);
    return { success: `Společné vyúčtování smazáno (${smazano.count} služeb).` };
  }
  await prisma.serviceSettlement.delete({ where: { id: zaznam.id } });
  obnov(zaznam.service.propertyId);
  return { success: "Vyúčtování smazáno." };
}

/**
 * Spolecne vyuctovani vice sluzeb jednim dokladem (typicky skupina sluzeb stejneho dodavatele).
 * Doklad se rozdeli do vyuctovani jednotlivych sluzeb podle jejich mesicnich nakladu a zaznamy
 * se spoji spolecnym batchId, aby se daly smazat spolu.
 */
export async function saveSettlementSkupina(
  _prev: VyuctovaniFormState, formData: FormData,
): Promise<VyuctovaniFormState> {
  const auth = await majitel();
  if ("error" in auth) return auth;

  const serviceIds = [...new Set(formData.getAll("serviceId").map(String).filter(Boolean))];
  const od = String(formData.get("periodFrom") ?? "");
  const doDne = String(formData.get("periodTo") ?? "");
  const naklad = cislo(formData.get("totalCost"));
  const zalohy = cislo(formData.get("supplierAdvances")) ?? 0;

  if (serviceIds.length < 2) return { error: "Vyber aspoň dvě služby, které se vyúčtují společně." };
  if (!ISO.test(od) || !ISO.test(doDne)) return { error: "Zadej období od–do." };
  if (od > doDne) return { error: "Konec období je před začátkem." };
  if (naklad == null || naklad < 0) return { error: "Zadej skutečný náklad za období." };

  const sluzby = await prisma.service.findMany({
    where: { id: { in: serviceIds } }, include: { costChanges: { orderBy: { validFrom: "asc" } } },
  });
  if (sluzby.length !== serviceIds.length) return { error: "Některá ze služeb neexistuje." };
  if (new Set(sluzby.map((s) => s.propertyId)).size !== 1) return { error: "Služby musí patřit k jedné nemovitosti." };

  const iso = (d: Date) => d.toISOString().slice(0, 10);
  for (const s of sluzby) {
    const stavajici = await prisma.serviceSettlement.findMany({ where: { serviceId: s.id } });
    for (const z of stavajici) {
      if (prunik(od, doDne, iso(z.periodFrom), iso(z.periodTo))) {
        return { error: `Období se překrývá s jiným vyúčtováním služby ${s.provider} (${iso(z.periodFrom)} – ${iso(z.periodTo)}).` };
      }
    }
  }

  // Vahy: mesicni naklad sluzby k poslednimu dni obdobi
  const konec = new Date(`${doDne}T12:00:00Z`);
  const vahy = sluzby.map((s) => {
    const k = sluzbaKDatu({
      type: s.type, provider: s.provider, monthlyCost: s.monthlyCost, annualCost: s.annualCost,
      chargedToTenant: s.chargedToTenant, contractStart: s.contractStart, activeTo: null,
      historie: s.costChanges.map((c) => ({ validFrom: c.validFrom, monthlyCost: c.monthlyCost, annualCost: c.annualCost })),
    }, konec);
    return mesicniNaklad(k) || mesicniNaklad(s);
  });
  // Skutecny naklad po sluzbach z pruvodce; jinak se celkovy naklad rozdeli podle vah
  let naklady = rozdelPodleVah(naklad, vahy);
  try {
    const poSluzbach = JSON.parse(String(formData.get("nakladyPoSluzbach") ?? "null")) as Record<string, number> | null;
    if (poSluzbach && sluzby.every((sl) => Number.isFinite(Number(poSluzbach[sl.id])))) {
      naklady = sluzby.map((sl) => Math.round(Number(poSluzbach[sl.id]) * 100) / 100);
    }
  } catch { /* neplatny JSON: zustane rozdeleni podle vah */ }
  // Zalohy po sluzbach z pruvodce (kolik se kazde sluzbe skutecne zaplatilo); jinak rozdeleni podle vah
  let zalohyCasti = rozdelPodleVah(zalohy, vahy);
  try {
    const poSluzbach = JSON.parse(String(formData.get("zalohyPoSluzbach") ?? "null")) as Record<string, number> | null;
    if (poSluzbach && sluzby.every((sl) => Number.isFinite(Number(poSluzbach[sl.id])))) {
      zalohyCasti = sluzby.map((sl) => Math.round(Number(poSluzbach[sl.id]) * 100) / 100);
    }
  } catch { /* neplatny JSON: zustane rozdeleni podle vah */ }
  const batchId = crypto.randomUUID();
  const faktura = text(formData.get("invoiceNo"));
  const poznamka = text(formData.get("notes"));

  await prisma.$transaction(sluzby.map((s, i) => prisma.serviceSettlement.create({
    data: {
      serviceId: s.id, periodFrom: new Date(od), periodTo: new Date(doDne),
      totalCost: naklady[i], supplierAdvances: zalohyCasti[i], splitMode: "DAYS",
      invoiceNo: faktura, notes: poznamka, batchId,
    },
  })));

  obnov(sluzby[0].propertyId);
  return { success: `Společné vyúčtování uloženo u ${sluzby.length} služeb (${dnuVObdobi(od, doDne)} dní).` };
}

export interface ZaplacenoSluzbe {
  id: string;
  /** Kolik se za obdobi podle evidence skutecne zaplatilo (u nezaplacenych mesicu predpis) */
  zaplaceno: number;
  /** Podle predpisu (mesicni platby sluzby) */
  predpis: number;
  /** Kolik mesicu z obdobi je opravdu oznacenych jako zaplacene */
  zaplacenychMesicu: number;
  mesicu: number;
}

/**
 * Kolik se dodavateli za obdobi zaplatilo na zalohach u vybranych sluzeb.
 * Bere mesicni platby sluzeb z Pravidelnych plateb: zaplacene skutecnou castkou, ostatni predpisem.
 * Krajni mesice se kraceji podle dnu, ktere do obdobi spadaji.
 */
export async function zaplacenoDodavateli(serviceIds: string[], od: string, doDne: string): Promise<{ error?: string; sluzby?: ZaplacenoSluzbe[] }> {
  const user = await getSession();
  if (!user) return { error: "Nejsi přihlášen." };
  if (!ISO.test(od) || !ISO.test(doDne) || od > doDne) return { error: "Zadej platné období." };
  const sluzby = await prisma.service.findMany({ where: { id: { in: serviceIds } }, select: { id: true, propertyId: true } });
  if (sluzby.length === 0) return { sluzby: [] };
  const navrh = await nactiNavrhPlatby(sluzby[0].propertyId);

  const dnuMesice = (mesic: string) => new Date(Date.UTC(Number(mesic.slice(0, 4)), Number(mesic.slice(5, 7)), 0)).getUTCDate();
  const podilMesice = (mesic: string) => {
    const prvni = `${mesic}-01`;
    const posledni = `${mesic}-${String(dnuMesice(mesic)).padStart(2, "0")}`;
    const p = prunik(od, doDne, prvni, posledni);
    return p ? dnuVObdobi(p[0], p[1]) / dnuMesice(mesic) : 0;
  };

  return {
    sluzby: sluzby.map((sl) => {
      const polozky = navrh.filter((x) => x.klic.startsWith(`sluzba:${sl.id}:`) && podilMesice(x.mesic) > 0);
      let zaplaceno = 0;
      let predpis = 0;
      let zaplacenychMesicu = 0;
      for (const x of polozky) {
        const podil = podilMesice(x.mesic);
        predpis += Math.abs(x.castka) * podil;
        if (x.zaplaceno) { zaplaceno += x.zaplaceno.castka * podil; zaplacenychMesicu++; }
        else zaplaceno += Math.abs(x.castka) * podil;
      }
      const r = (n: number) => Math.round(n * 100) / 100;
      return { id: sl.id, zaplaceno: r(zaplaceno), predpis: r(predpis), zaplacenychMesicu, mesicu: polozky.length };
    }),
  };
}
