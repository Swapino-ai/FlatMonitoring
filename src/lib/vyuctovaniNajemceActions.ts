"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "./auth";
import { prisma } from "./db";
import { doKose } from "./googleDrive";
import { vyuctovaniNajemce } from "./vyuctovani";
import { nactiVstupyVyuctovani } from "./vyuctovaniData";
import {
  dalsiCislo, kolize, nepokrytoZRadku, sestavSnapshot, variabilniSymbol, vychoziSplatnost,
} from "./vyuctovaniVydane";

export interface VydaniState {
  error?: string;
  success?: string;
  warning?: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const dnesISO = () => new Date().toISOString().slice(0, 10);

async function majitel() {
  const user = await getSession();
  if (!user) return { error: "Nejsi přihlášen." } as const;
  if (user.role !== "OWNER") return { error: "Tuhle změnu může provést jen majitel." } as const;
  return { user } as const;
}

const obnov = (propertyId: string) => revalidatePath(`/properties/${propertyId}`);

/**
 * Vyda vyuctovani najemci za obdobi: server cisla spocita znovu z databaze, zmrazi je
 * a prideli cislo a variabilni symbol. Neuplne vyuctovani vyda jen po vyslovnem potvrzeni.
 */
export async function vydejVyuctovani(_prev: VydaniState, formData: FormData): Promise<VydaniState> {
  const auth = await majitel();
  if ("error" in auth) return auth;

  const leaseId = String(formData.get("leaseId") ?? "");
  const od = String(formData.get("od") ?? "");
  const doDne = String(formData.get("do") ?? "");
  const dueDate = String(formData.get("dueDate") ?? "");
  if (!ISO.test(od) || !ISO.test(doDne) || od > doDne) return { error: "Zadej období od–do." };
  if (dueDate && !ISO.test(dueDate)) return { error: "Splatnost zadej jako datum." };

  const lease = await prisma.lease.findUnique({ where: { id: leaseId } });
  if (!lease) return { error: "Smlouva neexistuje." };
  const vstupy = await nactiVstupyVyuctovani(lease.propertyId);
  if (!vstupy) return { error: "Nemovitost neexistuje." };

  const najem = vstupy.najmy.find((n) => n.id === leaseId);
  if (!najem) return { error: "Smlouva neexistuje." };

  const v = vyuctovaniNajemce(najem, vstupy.najmy, vstupy.sluzby, od, doDne);
  if (v.chyba) return { error: v.chyba };
  if (v.radky.length === 0) return { error: "Žádná služba není přeúčtovaná nájemci, není co vyúčtovat." };

  const chybi = nepokrytoZRadku(v.radky);
  if (chybi.length > 0 && formData.get("potvrditNeuplne") !== "on") {
    return { error: `Vyúčtování je neúplné (${chybi.length} chybějících údajů). Doplň vyúčtování dodavatelů, nebo potvrď vydání i tak.` };
  }

  // Dve vyuctovani za stejne obdobi by najemci uctovala dvakrat
  const stavajici = await prisma.tenantStatement.findMany({ where: { leaseId }, select: { cislo: true, periodFrom: true, periodTo: true, status: true } });
  const k = kolize(
    stavajici.map((s) => ({ cislo: s.cislo, od: s.periodFrom.toISOString().slice(0, 10), do: s.periodTo.toISOString().slice(0, 10), status: s.status })),
    v.od, v.do,
  );
  if (k) return { error: `Období se překrývá s vydaným vyúčtováním ${k.cislo} (${k.od} – ${k.do}). Nejdřív ho stornuj.` };

  const info = vstupy.najemceInfo(vstupy.smlouvy.find((s) => s.id === leaseId)!);
  const snapshot = sestavSnapshot({
    nemovitost: vstupy.nemovitost, najemce: info, pronajimatel: vstupy.pronajimatelPro(lease.landlordRef), v, aktualniZaloha: najem.utilitiesMonthly,
    zamerne: vstupy.smlouvy.find((s) => s.id === leaseId)?.advanceIntentional,
  });

  const dnes = dnesISO();
  const splatnost = dueDate || (Math.abs(v.rozdil) >= 1 ? vychoziSplatnost(dnes) : "");
  const rok = new Date().getFullYear();

  // Poradove cislo se pocita z existujicich; kolize pri soubehu zachyti unikatni index, zkusime znovu
  for (let pokus = 0; pokus < 4; pokus++) {
    const cisla = (await prisma.tenantStatement.findMany({ where: { cislo: { startsWith: `VN-${rok}-` } }, select: { cislo: true } })).map((c) => c.cislo);
    const cislo = dalsiCislo(rok, cisla);
    try {
      const z = await prisma.tenantStatement.create({
        data: {
          cislo, vs: variabilniSymbol(cislo), leaseId, tenantId: lease.tenantId, propertyId: lease.propertyId,
          periodFrom: new Date(v.od), periodTo: new Date(v.do), result: v.rozdil,
          snapshot: JSON.parse(JSON.stringify(snapshot)), issuedById: auth.user.id,
          dueDate: splatnost ? new Date(splatnost) : null, note: String(formData.get("note") ?? "").trim() || null,
        },
      });
      obnov(lease.propertyId);
      return {
        success: `Vyúčtování ${z.cislo} vydáno.`,
        warning: chybi.length ? `Vydáno jako neúplné (${chybi.length} chybějících údajů).` : undefined,
      };
    } catch (e) {
      if (pokus === 3 || !(e instanceof Error) || !/Unique/i.test(e.message)) throw e;
    }
  }
  return { error: "Číslo dokladu se nepodařilo přidělit, zkus to znovu." };
}

async function nacti(id: string) {
  return prisma.tenantStatement.findUnique({ where: { id } });
}

export async function oznacOdeslano(_prev: VydaniState, formData: FormData): Promise<VydaniState> {
  const auth = await majitel();
  if ("error" in auth) return auth;
  const z = await nacti(String(formData.get("id") ?? ""));
  if (!z) return { error: "Vyúčtování neexistuje." };
  if (z.status === "STORNO") return { error: "Stornované vyúčtování se neodesílá." };

  const kdy = String(formData.get("sentAt") ?? "") || dnesISO();
  if (!ISO.test(kdy)) return { error: "Zadej datum odeslání." };
  const jak = ["EMAIL", "OSOBNE", "POSTA", "JINAK"].includes(String(formData.get("sentVia"))) ? String(formData.get("sentVia")) : "JINAK";
  await prisma.tenantStatement.update({
    where: { id: z.id },
    data: { sentAt: new Date(kdy), sentVia: jak, status: z.status === "VYPORADANO" ? "VYPORADANO" : "ODESLANO" },
  });
  obnov(z.propertyId);
  return { success: "Označeno jako odeslané nájemci." };
}

export async function oznacVyporadano(_prev: VydaniState, formData: FormData): Promise<VydaniState> {
  const auth = await majitel();
  if ("error" in auth) return auth;
  const z = await nacti(String(formData.get("id") ?? ""));
  if (!z) return { error: "Vyúčtování neexistuje." };
  if (z.status === "STORNO") return { error: "Stornované vyúčtování nejde vypořádat." };

  const kdy = String(formData.get("settledAt") ?? "") || dnesISO();
  if (!ISO.test(kdy)) return { error: "Zadej datum vypořádání." };
  await prisma.tenantStatement.update({
    where: { id: z.id },
    data: { status: "VYPORADANO", settledAt: new Date(kdy), settledNote: String(formData.get("settledNote") ?? "").trim() || null },
  });
  obnov(z.propertyId);
  return { success: z.result < 0 ? "Nedoplatek je uhrazen." : "Vypořádáno." };
}

/** Vrati vyuctovani zpet z "vyporadano" (omylem zaskrtnute). */
export async function zrusVyporadani(_prev: VydaniState, formData: FormData): Promise<VydaniState> {
  const auth = await majitel();
  if ("error" in auth) return auth;
  const z = await nacti(String(formData.get("id") ?? ""));
  if (!z || z.status !== "VYPORADANO") return { error: "Vyúčtování není vypořádané." };
  await prisma.tenantStatement.update({
    where: { id: z.id }, data: { status: z.sentAt ? "ODESLANO" : "VYDANO", settledAt: null, settledNote: null },
  });
  obnov(z.propertyId);
  return { success: "Vypořádání zrušeno." };
}

export async function nastavSplatnost(_prev: VydaniState, formData: FormData): Promise<VydaniState> {
  const auth = await majitel();
  if ("error" in auth) return auth;
  const z = await nacti(String(formData.get("id") ?? ""));
  if (!z) return { error: "Vyúčtování neexistuje." };
  const kdy = String(formData.get("dueDate") ?? "");
  if (!ISO.test(kdy)) return { error: "Zadej datum splatnosti." };
  await prisma.tenantStatement.update({ where: { id: z.id }, data: { dueDate: new Date(kdy) } });
  obnov(z.propertyId);
  return { success: "Splatnost změněna." };
}

/** Storno vydaneho vyuctovani: zustava v evidenci (je to doklad), ale nepocita se a jde vydat znovu. */
export async function stornoVyuctovani(_prev: VydaniState, formData: FormData): Promise<VydaniState> {
  const auth = await majitel();
  if ("error" in auth) return auth;
  const z = await nacti(String(formData.get("id") ?? ""));
  if (!z) return { error: "Vyúčtování neexistuje." };
  if (z.status === "STORNO") return { error: "Už je stornované." };
  const duvod = String(formData.get("reason") ?? "").trim();
  if (!duvod) return { error: "Napiš důvod storna." };
  await prisma.tenantStatement.update({
    where: { id: z.id }, data: { status: "STORNO", stornoAt: new Date(), stornoReason: duvod },
  });
  obnov(z.propertyId);
  return { success: `Vyúčtování ${z.cislo} stornováno. Období můžeš vyúčtovat znovu.` };
}

/**
 * Smaze vydane vyuctovani natrvalo, jako by nikdy nebylo: zaznam, jeho prilohy v evidenci
 * i soubory na Google Disku (ty jdou do kose na Disku, ne natvrdo). Cislo dokladu se uvolni.
 */
export async function smazVyuctovani(_prev: VydaniState, formData: FormData): Promise<VydaniState> {
  const auth = await majitel();
  if ("error" in auth) return auth;
  const z = await nacti(String(formData.get("id") ?? ""));
  if (!z) return { error: "Vyúčtování neexistuje." };

  const prilohy = await prisma.dokument.findMany({ where: { statementId: z.id } });
  let souboruNaDisku = 0;
  for (const d of prilohy) {
    try { await doKose(d.driveId); souboruNaDisku++; } catch { /* Disk nedostupny: evidenci smazeme, soubor zustane na Disku */ }
  }
  await prisma.$transaction([
    prisma.dokument.deleteMany({ where: { statementId: z.id } }),
    prisma.tenantStatement.delete({ where: { id: z.id } }),
  ]);
  obnov(z.propertyId);
  return {
    success: `Vyúčtování ${z.cislo} smazáno natrvalo.`,
    warning: prilohy.length > souboruNaDisku ? "Některé přiložené soubory se na Disku nepodařilo přesunout do koše, zůstaly tam." : undefined,
  };
}
