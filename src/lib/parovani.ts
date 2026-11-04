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
import { CATEGORY_MAP } from "./categories";

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

/**
 * Prijem z kratkodobeho pronajmu (vyplata Airbnb, Booking...): zapise se jako prijem bytu
 * a ucet platce si byt zapamatuje — dalsi vyplaty z nej se sparuji samy.
 */
export async function sparujKratkodoby(pohybId: string, propertyId: string): Promise<{ ok: boolean; zprava: string }> {
  const pohyb = await prisma.bankovniPohyb.findUnique({ where: { id: pohybId } });
  const byt = await prisma.property.findUnique({ where: { id: propertyId }, select: { id: true, kratkodobeUcty: true } });
  if (!pohyb || !byt) return { ok: false, zprava: "Pohyb nebo nemovitost neexistuje." };
  if (pohyb.castka <= 0) return { ok: false, zprava: "Jako příjem jde přiřadit jen příchozí platba." };
  const ucet = normalizujUcet(pohyb.protiucet);
  await prisma.$transaction(async (tx) => {
    const t = await tx.transaction.upsert({
      where: { sourceKey: `banka:${pohyb.id}` },
      update: { propertyId, amount: pohyb.castka, date: pohyb.datum },
      create: {
        propertyId, date: pohyb.datum, amount: pohyb.castka, category: "KT_PRIJEM", taxTreatment: "INCOME_SHORT_TERM",
        description: [pohyb.nazevProtiuctu, pohyb.zprava].filter(Boolean).join(" · ") || "Výplata z banky", sourceKey: `banka:${pohyb.id}`,
      },
    });
    await tx.bankovniPohyb.update({
      where: { id: pohybId },
      data: { stav: "SPAROVANO", propertyId, leaseId: null, navrhLeaseId: null, poznamka: null, parovani: { kratkodoby: t.id } as Prisma.InputJsonValue },
    });
    if (ucet && !byt.kratkodobeUcty.includes(ucet)) await tx.property.update({ where: { id: propertyId }, data: { kratkodobeUcty: { push: ucet } } });
  });
  return { ok: true, zprava: "Zapsáno jako příjem z krátkodobého pronájmu." };
}

// --- Odchozi platby ---

/** Kam odchozi platba patri: predpis (sluzba, splatka, nedoplatek dodavateli), vratka preplatku najemci, jiny vydaj nemovitosti. */
export type CilVydaje =
  | { typ: "predpis"; klic: string; propertyId: string }
  | { typ: "vratka"; statementId: string }
  | { typ: "vydaj"; propertyId: string; kategorie: string }
  /** Vsechny sluzby jednoho dodavatele za mesic jednou platbou (napr. SVJ) */
  | { typ: "skupina"; propertyId: string; mesic: string; dodavatel: string };

export const cilZTextu = (t: string): CilVydaje | null => {
  const [typ, a, ...zbytek] = t.split(":");
  if (typ === "predpis" && a && zbytek.length) return { typ: "predpis", propertyId: a, klic: zbytek.join(":") };
  if (typ === "vratka" && a) return { typ: "vratka", statementId: a };
  if (typ === "vydaj" && a && zbytek[0]) return { typ: "vydaj", propertyId: a, kategorie: zbytek[0] };
  if (typ === "skupina" && a && /^\d{4}-\d{2}$/.test(zbytek[0] ?? "") && zbytek.length > 1) return { typ: "skupina", propertyId: a, mesic: zbytek[0], dodavatel: zbytek.slice(1).join(":") };
  return null;
};
export const cilNaText = (c: CilVydaje) => c.typ === "predpis" ? `predpis:${c.propertyId}:${c.klic}` : c.typ === "vratka" ? `vratka:${c.statementId}`
  : c.typ === "skupina" ? `skupina:${c.propertyId}:${c.mesic}:${c.dodavatel}` : `vydaj:${c.propertyId}:${c.kategorie}`;

export interface SkupinaSluzeb { dodavatel: string; mesic: string; castka: number; polozky: NavrzenaPlatba[] }

/**
 * Nezaplacene sluzby po dodavatelich a mesicich: vsechny sluzby jednoho dodavatele u bytu
 * se plati jednou castkou (napr. SVJ: sprava, fond oprav, voda, teplo). Co se plati zvlast,
 * ma u sluzby jineho dodavatele.
 */
export function skupinySluzeb(navrhy: NavrzenaPlatba[]): SkupinaSluzeb[] {
  const sluzby = navrhy.filter((p) => p.druh === "SLUZBA" && p.skupina.typ === "DODAVATEL" && p.skupina.nazev !== "Bez dodavatele");
  const g = new Map<string, SkupinaSluzeb>();
  for (const p of sluzby) {
    if (p.stav !== "nezaplaceno" || p.castka >= 0) continue;
    const k = `${p.skupina.nazev}|${p.mesic}`;
    const x = g.get(k) ?? { dodavatel: p.skupina.nazev, mesic: p.mesic, castka: 0, polozky: [] };
    x.polozky.push(p);
    x.castka = Math.round((x.castka - p.castka) * 100) / 100;
    g.set(k, x);
  }
  return [...g.values()].sort((a, b) => a.mesic.localeCompare(b.mesic) || a.dodavatel.localeCompare(b.dodavatel, "cs"));
}

const mesicCz = (m: string) => `${Number(m.slice(5))}/${m.slice(0, 4)}`;

/** Odchozi platbu zapise k cili: predpis se oznaci jako zaplaceny, vratka vyporada vyuctovani, vydaj se zauctuje. */
export async function sparujVydaj(pohybId: string, cil: CilVydaje): Promise<{ ok: boolean; zprava: string }> {
  const pohyb = await prisma.bankovniPohyb.findUnique({ where: { id: pohybId } });
  if (!pohyb) return { ok: false, zprava: "Pohyb neexistuje." };
  // Prichozi platba jde jen jako jiny prijem nemovitosti (kategorie prijmu)
  if (pohyb.castka >= 0 && cil.typ !== "vydaj") return { ok: false, zprava: "Tohle je příchozí platba." };
  const castka = Math.abs(pohyb.castka);
  const znamenko = pohyb.castka >= 0 ? 1 : -1;
  if (cil.typ === "predpis") {
    await prisma.$transaction([
      prisma.pravidelnaPlatba.upsert({
        where: { klic: cil.klic },
        update: { paidAt: pohyb.datum, amount: castka, pohybId },
        create: { propertyId: cil.propertyId, klic: cil.klic, paidAt: pohyb.datum, amount: castka, pohybId },
      }),
      prisma.bankovniPohyb.update({ where: { id: pohybId }, data: { stav: "SPAROVANO", propertyId: cil.propertyId, navrhCil: null, poznamka: null, parovani: { vydaj: cilNaText(cil) } } }),
    ]);
    return { ok: true, zprava: "Platba zapsána k předpisu." };
  }
  if (cil.typ === "skupina") {
    const sk = skupinySluzeb(await nactiNavrhPlatby(cil.propertyId)).find((x) => x.dodavatel === cil.dodavatel && x.mesic === cil.mesic);
    if (!sk) return { ok: false, zprava: `Služby ${cil.dodavatel} za ${mesicCz(cil.mesic)} už jsou zaplacené.` };
    const rozdil = Math.round((castka - sk.castka) * 100) / 100;
    await prisma.$transaction([
      ...sk.polozky.map((x) => prisma.pravidelnaPlatba.upsert({
        where: { klic: x.klic },
        update: { paidAt: pohyb.datum, amount: Math.abs(x.castka), pohybId },
        create: { propertyId: cil.propertyId, klic: x.klic, paidAt: pohyb.datum, amount: Math.abs(x.castka), pohybId },
      })),
      prisma.bankovniPohyb.update({
        where: { id: pohybId },
        data: {
          stav: "SPAROVANO", propertyId: cil.propertyId, navrhCil: null,
          poznamka: Math.abs(rozdil) >= TOLERANCE ? `Zaplaceno o ${Math.abs(rozdil).toLocaleString("cs-CZ")} Kč ${rozdil > 0 ? "víc" : "míň"}, než je součet předpisů (${sk.castka.toLocaleString("cs-CZ")} Kč) — dorovná vyúčtování od dodavatele.` : null,
          parovani: { vydaj: cilNaText(cil), klice: sk.polozky.map((x) => x.klic) },
        },
      }),
    ]);
    return { ok: true, zprava: `Zaplaceno ${sk.polozky.length} služeb ${cil.dodavatel} za ${mesicCz(cil.mesic)}.` };
  }
  if (cil.typ === "vratka") {
    const v = await prisma.tenantStatement.findUnique({ where: { id: cil.statementId } });
    if (!v) return { ok: false, zprava: "Vyúčtování neexistuje." };
    await prisma.$transaction([
      prisma.tenantStatement.update({ where: { id: v.id }, data: { status: "VYPORADANO", settledAt: pohyb.datum, settledNote: `Přeplatek vrácen ${iso(pohyb.datum)} (z banky)` } }),
      prisma.bankovniPohyb.update({ where: { id: pohybId }, data: { stav: "SPAROVANO", propertyId: v.propertyId, leaseId: v.leaseId, navrhCil: null, poznamka: null, parovani: { vydaj: cilNaText(cil), cislo: v.cislo } } }),
    ]);
    return { ok: true, zprava: `Vrácení přeplatku z vyúčtování ${v.cislo} zapsáno.` };
  }
  const kat = CATEGORY_MAP.get(cil.kategorie);
  if (!kat || kat.kind !== (znamenko > 0 ? "INCOME" : "EXPENSE")) return { ok: false, zprava: znamenko > 0 ? "Vyber kategorii příjmu." : "Vyber kategorii výdaje." };
  await prisma.$transaction(async (tx) => {
    const t = await tx.transaction.upsert({
      where: { sourceKey: `banka:${pohyb.id}` },
      update: { propertyId: cil.propertyId, amount: znamenko * castka, date: pohyb.datum, category: kat.key, taxTreatment: kat.defaultTaxTreatment },
      create: {
        propertyId: cil.propertyId, date: pohyb.datum, amount: znamenko * castka, category: kat.key, taxTreatment: kat.defaultTaxTreatment,
        description: [pohyb.nazevProtiuctu, pohyb.zprava].filter(Boolean).join(" · ") || "Platba z banky", sourceKey: `banka:${pohyb.id}`,
      },
    });
    await tx.bankovniPohyb.update({ where: { id: pohybId }, data: { stav: "SPAROVANO", propertyId: cil.propertyId, navrhCil: null, poznamka: null, parovani: { vydaj: cilNaText(cil), transakce: t.id } } });
  });
  return { ok: true, zprava: `Zapsáno jako ${znamenko > 0 ? "příjem" : "výdaj"}: ${kat.label}.` };
}

/** Nejstarsi nezaplaceny predpis sluzby / uveru (podle predpony klice), splatny nejpozdeji mesic po platbe. */
async function nezaplacenyPredpis(k: Kontext, propertyId: string, predpona: string, datumPlatby: string) {
  const limit = (() => { const d = new Date(`${datumPlatby}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1); return iso(d).slice(0, 7); })();
  return (await navrhNemovitosti(k, propertyId))
    .filter((p) => p.klic.startsWith(predpona) && p.castka < 0 && p.stav === "nezaplaceno" && p.mesic <= limit)
    .sort((a, b) => a.mesic.localeCompare(b.mesic))[0] ?? null;
}

/**
 * Odchozi platba: VS vyuctovani s preplatkem → vratka; ucet, kam se uz platilo → stejny cil
 * (dalsi nezaplaceny mesic tehoz predpisu, nebo stejny druh vydaje); jinak navrh podle castky.
 */
async function zpracujVydaj(p: { id: string; castka: number; datum: Date; vs: string | null; protiucet: string | null }, k: Kontext,
  vratky: { id: string; vs: string; result: number }[], historie: { protiucet: string | null; parovani: unknown; propertyId: string | null }[], nemovitosti: string[]): Promise<boolean> {
  const castka = Math.abs(p.castka);
  const v = p.vs ? vratky.find((x) => x.vs.replace(/^0+/, "") === p.vs && Math.abs(x.result - castka) < TOLERANCE) : null;
  if (v) { vratky.splice(vratky.indexOf(v), 1); return (await sparujVydaj(p.id, { typ: "vratka", statementId: v.id })).ok; }

  const ucet = normalizujUcet(p.protiucet);
  const drive = ucet ? historie.find((h) => normalizujUcet(h.protiucet) === ucet && (h.parovani as { vydaj?: string } | null)?.vydaj) : null;
  const driveCil = drive ? cilZTextu((drive.parovani as { vydaj: string }).vydaj) : null;
  if (driveCil?.typ === "predpis") {
    const predpona = driveCil.klic.split(":").slice(0, 2).join(":") + ":";
    const dalsi = await nezaplacenyPredpis(k, driveCil.propertyId, predpona, iso(p.datum));
    // Sluzba je dnes ve skupine dodavatele → plati se cela skupina
    const sk = dalsi ? skupinySluzeb(await navrhNemovitosti(k, driveCil.propertyId)).find((x) => x.polozky.some((y) => y.klic === dalsi.klic)) : null;
    if (sk) { k.navrhy.delete(driveCil.propertyId); return (await sparujVydaj(p.id, { typ: "skupina", propertyId: driveCil.propertyId, mesic: sk.mesic, dodavatel: sk.dodavatel })).ok; }
    if (dalsi) { k.navrhy.delete(driveCil.propertyId); return (await sparujVydaj(p.id, { typ: "predpis", propertyId: driveCil.propertyId, klic: dalsi.klic })).ok; }
  }
  if (driveCil?.typ === "skupina") {
    const limit = (() => { const d = new Date(p.datum); d.setUTCMonth(d.getUTCMonth() + 1); return iso(d).slice(0, 7); })();
    const dalsi = skupinySluzeb(await navrhNemovitosti(k, driveCil.propertyId)).find((x) => x.dodavatel === driveCil.dodavatel && x.mesic <= limit);
    if (dalsi) { k.navrhy.delete(driveCil.propertyId); return (await sparujVydaj(p.id, { ...driveCil, mesic: dalsi.mesic })).ok; }
  }
  if (driveCil?.typ === "vydaj") return (await sparujVydaj(p.id, driveCil)).ok;

  // Navrh podle castky: jediny nezaplaceny predpis se stejnou castkou
  const shodne: CilVydaje[] = [];
  for (const id of nemovitosti) {
    const navrhy = await navrhNemovitosti(k, id);
    // Sluzby jednoho dodavatele se plati jednou castkou: sedi-li soucet skupiny, je to ona
    const vSkupine = new Set<string>();
    for (const sk of skupinySluzeb(navrhy)) {
      sk.polozky.forEach((x) => vSkupine.add(x.klic));
      if (Math.abs(sk.castka - castka) < TOLERANCE) shodne.push({ typ: "skupina", propertyId: id, mesic: sk.mesic, dodavatel: sk.dodavatel });
    }
    for (const x of navrhy) {
      if (vSkupine.has(x.klic)) continue;
      if (x.castka < 0 && x.stav === "nezaplaceno" && Math.abs(Math.abs(x.castka) - castka) < TOLERANCE) shodne.push({ typ: "predpis", propertyId: id, klic: x.klic });
    }
  }
  const navrh = shodne.length === 1 ? shodne[0] : driveCil;
  await prisma.bankovniPohyb.update({
    where: { id: p.id },
    data: {
      stav: "KE_KONTROLE", navrhCil: navrh ? cilNaText(navrh) : null,
      poznamka: shodne.length === 1 ? "Částka odpovídá předpisu — potvrď." : shodne.length > 1 ? "Částka odpovídá více předpisům — vyber." : "Odchozí platba — přiřaď ji k předpisu nebo jako výdaj nemovitosti, nebo ignoruj.",
    },
  });
  return false;
}

/** Zpracuje nove pohyby: prichozi i odchozi platby se pokusi sparovat. */
export async function zpracujPohyby(): Promise<{ sparovano: number; keKontrole: number }> {
  const k: Kontext = { navrhy: new Map() };
  // Drive odlozene vydaje (pred parovanim odchozich plateb) projdou parovanim taky
  const nove = await prisma.bankovniPohyb.findMany({ where: { stav: { in: ["NOVY", "VYDAJ"] } }, orderBy: { datum: "asc" } });
  if (!nove.length) return { sparovano: 0, keKontrole: 0 };
  const [smlouvy, vyuctovani, kratkodobe] = await Promise.all([
    prisma.lease.findMany({ include: { tenant: { select: { account: true } } } }),
    prisma.tenantStatement.findMany({ where: { status: { in: ["VYDANO", "ODESLANO"] }, result: { lt: 0 } } }),
    prisma.property.findMany({ where: { kratkodobeUcty: { isEmpty: false } }, select: { id: true, kratkodobeUcty: true } }),
  ]);
  const odchozi = nove.some((p) => p.castka < 0);
  const [vratky, historie, nemovitosti] = odchozi ? await Promise.all([
    prisma.tenantStatement.findMany({ where: { status: { in: ["VYDANO", "ODESLANO"] }, result: { gt: 0 } }, select: { id: true, vs: true, result: true } }),
    prisma.bankovniPohyb.findMany({ where: { stav: "SPAROVANO", castka: { lt: 0 } }, orderBy: { datum: "desc" }, select: { protiucet: true, parovani: true, propertyId: true } }),
    prisma.property.findMany({ where: { status: { not: "SOLD" } }, select: { id: true } }).then((x) => x.map((y) => y.id)),
  ]) : [[], [], []];
  let sparovano = 0, keKontrole = 0;

  for (const p of nove) {
    if (p.castka < 0) {
      if (await zpracujVydaj(p, k, vratky, historie, nemovitosti)) sparovano++; else keKontrole++;
      continue;
    }
    if (p.castka === 0) { await prisma.bankovniPohyb.update({ where: { id: p.id }, data: { stav: "IGNOROVANO" } }); continue; }

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
    // 2b) Vyplata kratkodobeho pronajmu (ucet zname platformy u bytu)
    const kt = ucet ? kratkodobe.find((x) => x.kratkodobeUcty.includes(ucet)) : null;
    if (kt) {
      const r = await sparujKratkodoby(p.id, kt.id);
      if (r.ok) sparovano++; else keKontrole++;
      continue;
    }
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
