/**
 * Parovani bankovnich pohybu na predpisy: najem a zalohy (pravidelne platby) a nedoplatky
 * z vyuctovani pro najemce. Bezi na serveru po stazeni pohybu z banky.
 *
 * Postup u prichozi platby:
 * 1. VS odpovida vydanemu vyuctovani s nedoplatkem → vyuctovani se oznaci jako vyporadane.
 * 2. Ucet platce patri smlouve (najemce z nej uz platil, nebo je to jeho ucet v evidenci)
 *    → platba uhradi nejstarsi nezaplacene mesice teto smlouvy (najem i zalohy).
 * 3. Jinak navrh podle castky (jedina smlouva, ktere mesicni predpis sedi) — ke kontrole.
 * Co si aplikace neni jista, necha ke kontrole; nic nehada potichu.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { normalizujUcet } from "./fio";
import { nactiNavrhPlatby } from "./pravidelnePlatbyData";
import type { NavrzenaPlatba } from "./pravidelnePlatby";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const TOLERANCE = 1; // Kc

/**
 * Rozdeli castku na nezaplacene mesice smlouvy od nejstarsiho: mesic (najem + zalohy)
 * se uhradi cely, kdyz na nej castka staci. Vraci uhrazene polozky a zbytek.
 */
export function rozdelPlatbu(castka: number, nezaplacene: { klic: string; mesic: string; castka: number }[]): { uhrazeno: { klic: string; castka: number }[]; zbytek: number } {
  const mesice = [...new Set(nezaplacene.map((p) => p.mesic))].sort();
  const uhrazeno: { klic: string; castka: number }[] = [];
  let zbyva = castka;
  for (const m of mesice) {
    const polozky = nezaplacene.filter((p) => p.mesic === m);
    const celkem = polozky.reduce((a, p) => a + p.castka, 0);
    if (zbyva + TOLERANCE < celkem) break;
    for (const p of polozky) uhrazeno.push({ klic: p.klic, castka: p.castka });
    zbyva -= celkem;
  }
  return { uhrazeno, zbytek: Math.round(zbyva * 100) / 100 };
}

interface Kontext {
  navrhy: Map<string, NavrzenaPlatba[]>;
}

async function navrhNemovitosti(k: Kontext, propertyId: string) {
  if (!k.navrhy.has(propertyId)) k.navrhy.set(propertyId, await nactiNavrhPlatby(propertyId));
  return k.navrhy.get(propertyId)!;
}

/** Nezaplacene predpisy najmu a zaloh smlouvy, ktere uz byly splatne (nebo jsou v mesici platby ci dalsim). */
async function nezaplaceneSmlouvy(k: Kontext, propertyId: string, leaseId: string, datumPlatby: string) {
  const limit = (() => { const d = new Date(`${datumPlatby}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1); return iso(d).slice(0, 7); })();
  return (await navrhNemovitosti(k, propertyId))
    .filter((p) => (p.klic.startsWith(`najem:${leaseId}:`) || p.klic.startsWith(`zaloha:${leaseId}:`)) && p.stav === "nezaplaceno" && p.mesic <= limit)
    .map((p) => ({ klic: p.klic, mesic: p.mesic, castka: Math.abs(p.castka) }));
}

/** Uhradi pohybem predpisy smlouvy. Vraci, jestli se neco sparovalo. */
export async function sparujSeSmlouvou(pohybId: string, leaseId: string, k: Kontext = { navrhy: new Map() }): Promise<{ ok: boolean; zprava: string }> {
  const pohyb = await prisma.bankovniPohyb.findUnique({ where: { id: pohybId } });
  const smlouva = await prisma.lease.findUnique({ where: { id: leaseId } });
  if (!pohyb || !smlouva) return { ok: false, zprava: "Pohyb nebo smlouva neexistuje." };
  const datum = iso(pohyb.datum);
  const nezaplacene = await nezaplaceneSmlouvy(k, smlouva.propertyId, leaseId, datum);
  const { uhrazeno, zbytek } = rozdelPlatbu(pohyb.castka, nezaplacene);
  if (uhrazeno.length === 0) {
    await prisma.bankovniPohyb.update({ where: { id: pohybId }, data: { stav: "KE_KONTROLE", navrhLeaseId: leaseId, poznamka: nezaplacene.length ? "Částka nestačí na celý nezaplacený měsíc." : "Smlouva nemá nezaplacený předpis." } });
    return { ok: false, zprava: "Platbu nešlo rozdělit na předpisy smlouvy." };
  }
  const ucet = normalizujUcet(pohyb.protiucet);
  await prisma.$transaction([
    ...uhrazeno.map((u) => prisma.pravidelnaPlatba.upsert({
      where: { klic: u.klic },
      update: { paidAt: pohyb.datum, amount: u.castka, pohybId },
      create: { propertyId: smlouva.propertyId, klic: u.klic, paidAt: pohyb.datum, amount: u.castka, pohybId },
    })),
    prisma.bankovniPohyb.update({
      where: { id: pohybId },
      data: {
        stav: "SPAROVANO", propertyId: smlouva.propertyId, leaseId, navrhLeaseId: null,
        parovani: uhrazeno as unknown as Prisma.InputJsonValue,
        poznamka: Math.abs(zbytek) >= TOLERANCE ? `Zbývá ${zbytek.toLocaleString("cs-CZ")} Kč nepřiřazeno (přeplatek nebo část dalšího měsíce).` : null,
      },
    }),
    // Ucet platce si smlouva zapamatuje pro priste
    ...(ucet && !smlouva.uctyPlatce.includes(ucet) ? [prisma.lease.update({ where: { id: leaseId }, data: { uctyPlatce: { push: ucet } } })] : []),
  ]);
  // Navrh nemovitosti se zmenil
  k.navrhy.delete(smlouva.propertyId);
  return { ok: true, zprava: `Uhrazeno ${uhrazeno.length} předpisů.` };
}

/** Zpracuje nove pohyby: vydaje odlozi, prichozi platby se pokusi sparovat. */
export async function zpracujPohyby(): Promise<{ sparovano: number; keKontrole: number }> {
  const k: Kontext = { navrhy: new Map() };
  const nove = await prisma.bankovniPohyb.findMany({ where: { stav: "NOVY" }, orderBy: { datum: "asc" } });
  if (!nove.length) return { sparovano: 0, keKontrole: 0 };
  const [smlouvy, vyuctovani] = await Promise.all([
    prisma.lease.findMany({ include: { tenant: { select: { account: true } } } }),
    prisma.tenantStatement.findMany({ where: { status: { in: ["VYDANO", "ODESLANO"] }, result: { lt: 0 } } }),
  ]);
  let sparovano = 0, keKontrole = 0;

  for (const p of nove) {
    if (p.castka <= 0) { await prisma.bankovniPohyb.update({ where: { id: p.id }, data: { stav: "VYDAJ" } }); continue; }

    // 1) Nedoplatek z vyuctovani podle variabilniho symbolu
    const v = p.vs ? vyuctovani.find((x) => x.vs.replace(/^0+/, "") === p.vs && Math.abs(Math.abs(x.result) - p.castka) < TOLERANCE) : null;
    if (v) {
      await prisma.$transaction([
        prisma.tenantStatement.update({ where: { id: v.id }, data: { status: "VYPORADANO", settledAt: p.datum, settledNote: `Uhrazeno na účet ${iso(p.datum)} (automaticky spárováno)` } }),
        prisma.bankovniPohyb.update({ where: { id: p.id }, data: { stav: "SPAROVANO", propertyId: v.propertyId, leaseId: v.leaseId, parovani: { vyuctovani: v.id, cislo: v.cislo } } }),
      ]);
      vyuctovani.splice(vyuctovani.indexOf(v), 1);
      sparovano++;
      continue;
    }

    // 2) Ucet platce patri smlouve
    const ucet = normalizujUcet(p.protiucet);
    const podleUctu = ucet ? smlouvy.filter((s) => s.uctyPlatce.includes(ucet) || normalizujUcet(s.tenant?.account ?? s.tenantAccount) === ucet) : [];
    // Vic smluv tehoz najemce: prednost ma platna
    const smlouva = podleUctu.find((s) => s.isActive) ?? podleUctu[0];
    if (smlouva) {
      const r = await sparujSeSmlouvou(p.id, smlouva.id, k);
      if (r.ok) sparovano++; else keKontrole++;
      continue;
    }

    // 3) Navrh podle castky: jedina smlouva, jejiz nejstarsi nezaplaceny mesic castce odpovida
    const kandidati: string[] = [];
    for (const s of smlouvy.filter((x) => x.isActive)) {
      const nez = await nezaplaceneSmlouvy(k, s.propertyId, s.id, iso(p.datum));
      const r = rozdelPlatbu(p.castka, nez);
      if (r.uhrazeno.length && Math.abs(r.zbytek) < TOLERANCE) kandidati.push(s.id);
    }
    await prisma.bankovniPohyb.update({
      where: { id: p.id },
      data: {
        stav: "KE_KONTROLE", navrhLeaseId: kandidati.length === 1 ? kandidati[0] : null,
        poznamka: kandidati.length === 1 ? "Částka odpovídá předpisu — potvrď, že platí tento nájemce." : kandidati.length > 1 ? "Částka odpovídá více smlouvám — vyber nájemce." : "Neznámý plátce — přiřaď nájemce, nebo ignoruj.",
      },
    });
    keKontrole++;
  }
  return { sparovano, keKontrole };
}

/** Ulozi stazene pohyby (kazdy jen jednou). Vraci pocet novych. */
export async function ulozPohyby(pohyby: import("./fio").PohybBanky[]): Promise<number> {
  if (!pohyby.length) return 0;
  const r = await prisma.bankovniPohyb.createMany({
    data: pohyby.map((p) => ({ ...p, datum: new Date(`${p.datum}T00:00:00Z`) })),
    skipDuplicates: true,
  });
  return r.count;
}
