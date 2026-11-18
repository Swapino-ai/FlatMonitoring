"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { getSession } from "./auth";
import { prisma } from "./db";
import { bezpecneJmeno, cestaSlozek } from "./dokumenty";
import { ChybaDisku, doKose, nahrajPrimo, stahni, zajistiCestu } from "./googleDrive";
import { aiPojistkyNastaveno, porovnejPojistkyAi, rozeberPojistku, type PorovnaniPojistek, type RozborPojistky } from "./pojistkaAi";
import { castkaKDatu, DRUHY_POJISTKY, FREKVENCE } from "./pojistky";

async function majitel(): Promise<string | null> {
  const user = await getSession();
  if (!user) return "Nejsi přihlášen.";
  if (user.role !== "OWNER") return "Tuhle změnu může provést jen majitel.";
  return null;
}

const jeDatum = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const den = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const obnov = (propertyId: string) => {
  revalidatePath(`/properties/${propertyId}/pojisteni`);
  revalidatePath(`/properties/${propertyId}`);
  revalidatePath("/pojisteni");
  revalidatePath("/");
};

/** Aktualni vyse = ta platna dnes (zmena s datem v budoucnu dnesni vysi neprepise). */
async function srovnejCastku(pojistkaId: string) {
  const p = await prisma.pojistka.findUnique({ where: { id: pojistkaId }, include: { zmeny: true } });
  if (!p) return;
  const castka = castkaKDatu({ id: p.id, pojistovna: p.pojistovna, od: iso(p.od), do: p.do ? iso(p.do) : null, frekvence: p.frekvence, castka: p.castka, zmeny: p.zmeny.map((z) => ({ validFrom: iso(z.validFrom), castka: z.castka })) }, iso(new Date()));
  if (castka !== p.castka) await prisma.pojistka.update({ where: { id: p.id }, data: { castka } });
}

export interface PojistkaFormular {
  id?: string; pojistovna: string; cisloSmlouvy?: string | null; druh: string; od: string; do?: string | null;
  frekvence: string; castka: number; pojistnaCastka?: number | null; poznamka?: string | null;
  /** Datum splatnosti pojistneho (rrrr-mm-dd); null = k zacatku pojisteni */
  splatnost?: string | null;
  /** Pri zmene vyse pojistneho: od kdy nova vyse plati */
  castkaOd?: string | null;
  /** Nova pojistka ze smlouvy: uz nahrane soubory smlouvy a jeji rozbor AI */
  dokumenty?: string[];
  ai?: RozborPojistky | null;
}

export async function ulozPojistku(propertyId: string, v: PojistkaFormular): Promise<{ error?: string; id?: string }> {
  const chyba = await majitel();
  if (chyba) return { error: chyba };
  const pojistovna = v.pojistovna.trim().slice(0, 120);
  if (!pojistovna) return { error: "Vyplň pojišťovnu." };
  if (!jeDatum(v.od)) return { error: "Vyplň, od kdy pojištění platí." };
  if (v.do && (!jeDatum(v.do) || v.do < v.od)) return { error: "Konec pojištění nemůže být před začátkem." };
  if (!(v.frekvence in FREKVENCE)) return { error: "Vyber, jak často se platí." };
  if (!(v.druh in DRUHY_POJISTKY)) return { error: "Vyber druh pojištění." };
  if (!Number.isFinite(v.castka) || v.castka <= 0) return { error: "Vyplň výši pojistného." };
  if (v.splatnost && !jeDatum(v.splatnost)) return { error: "Datum splatnosti není platné." };
  const data = {
    pojistovna, cisloSmlouvy: v.cisloSmlouvy?.trim() || null, druh: v.druh, od: den(v.od), do: v.do ? den(v.do) : null,
    frekvence: v.frekvence, splatnost: v.splatnost ? den(v.splatnost) : null, pojistnaCastka: v.pojistnaCastka && v.pojistnaCastka > 0 ? v.pojistnaCastka : null, poznamka: v.poznamka?.trim() || null,
  };
  if (!v.id) {
    const p = await prisma.pojistka.create({ data: {
      propertyId, ...data, castka: v.castka, zmeny: { create: { validFrom: den(v.od), castka: v.castka } },
      ...(v.ai ? { ai: v.ai as unknown as Prisma.InputJsonValue, aiAt: new Date() } : {}),
    } });
    if (v.dokumenty?.length) await prisma.dokument.updateMany({ where: { id: { in: v.dokumenty }, propertyId, kategorie: "POJISTKA", pojistkaId: null }, data: { pojistkaId: p.id } });
    obnov(propertyId);
    return { id: p.id };
  }
  const stara = await prisma.pojistka.findFirst({ where: { id: v.id, propertyId }, include: { zmeny: true } });
  if (!stara) return { error: "Pojistka neexistuje." };
  await prisma.$transaction(async (tx) => {
    await tx.pojistka.update({ where: { id: stara.id }, data });
    if (Math.abs(stara.castka - v.castka) >= 0.01) {
      const odKdy = jeDatum(v.castkaOd) ? v.castkaOd : iso(new Date());
      if (!stara.zmeny.length) await tx.pojistkaZmena.create({ data: { pojistkaId: stara.id, validFrom: stara.od, castka: stara.castka } });
      await tx.pojistkaZmena.upsert({
        where: { pojistkaId_validFrom: { pojistkaId: stara.id, validFrom: den(odKdy) } },
        update: { castka: v.castka }, create: { pojistkaId: stara.id, validFrom: den(odKdy), castka: v.castka },
      });
    }
  });
  await srovnejCastku(stara.id);
  obnov(propertyId);
  return { id: stara.id };
}

/** Ukonceni pojistky k datu (vypoved, prodej...). */
export async function ukonciPojistku(propertyId: string, id: string, doDne: string): Promise<{ error?: string }> {
  const chyba = await majitel();
  if (chyba) return { error: chyba };
  if (!jeDatum(doDne)) return { error: "Vyplň datum ukončení." };
  const p = await prisma.pojistka.findFirst({ where: { id, propertyId } });
  if (!p) return { error: "Pojistka neexistuje." };
  if (doDne < iso(p.od)) return { error: "Ukončení nemůže být před začátkem pojištění." };
  await prisma.pojistka.update({ where: { id }, data: { do: den(doDne) } });
  obnov(propertyId);
  return {};
}

export async function smazZmenuPojistneho(propertyId: string, zmenaId: string): Promise<{ error?: string }> {
  const chyba = await majitel();
  if (chyba) return { error: chyba };
  const z = await prisma.pojistkaZmena.findFirst({ where: { id: zmenaId, pojistka: { propertyId } } });
  if (!z) return {};
  if ((await prisma.pojistkaZmena.count({ where: { pojistkaId: z.pojistkaId } })) <= 1) return { error: "Poslední výši pojistného smazat nejde — uprav ji." };
  await prisma.pojistkaZmena.delete({ where: { id: z.id } });
  await srovnejCastku(z.pojistkaId);
  obnov(propertyId);
  return {};
}

export async function smazPojistku(propertyId: string, id: string): Promise<{ error?: string }> {
  const chyba = await majitel();
  if (chyba) return { error: chyba };
  const p = await prisma.pojistka.findFirst({ where: { id, propertyId } });
  if (!p) return {};
  for (const d of await prisma.dokument.findMany({ where: { pojistkaId: id } })) {
    await doKose(d.driveId).catch(() => undefined);
    await prisma.dokument.delete({ where: { id: d.id } });
  }
  // Zaplacene predpisy pojistneho (klice pojistka:<id>:...) uz k nicemu nepatri
  await prisma.pravidelnaPlatba.deleteMany({ where: { propertyId, klic: { startsWith: `pojistka:${id}:` } } });
  await prisma.pojistka.delete({ where: { id } });
  obnov(propertyId);
  return {};
}

const POVOLENE = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
/** Limit tela server action je 4 MB (base64 je o tretinu vetsi) */
const MAX_SOUBOR = 2_900_000;

/** Nahraje smlouvu (PDF nebo fotku strany) na Google Disk do 11 Pojištění. */
export async function nahrajSmlouvu(propertyId: string, pojistkaId: string | null, f: { data: string; mime: string; nazev: string }): Promise<{ error?: string; dokument?: { id: string; nazev: string; mime: string } }> {
  const chyba = await majitel();
  if (chyba) return { error: chyba };
  if (!POVOLENE.includes(f.mime)) return { error: "Smlouvu nahraj jako PDF nebo fotky stran." };
  if (f.data.length * 0.75 > MAX_SOUBOR) return { error: "Soubor je moc velký (max. 2,8 MB). Velké PDF nahraj jako fotky jednotlivých stran." };
  // Bez pojistky = nova smlouva: nejdriv se nahraje, AI z ni vyplni pojistku a uzivatel ji potvrdi
  const nem = await prisma.property.findUnique({ where: { id: propertyId }, select: { name: true } });
  const p = pojistkaId ? await prisma.pojistka.findFirst({ where: { id: pojistkaId, propertyId } }) : null;
  if (!nem || (pojistkaId && !p)) return { error: "Pojistka neexistuje." };
  const poradi = pojistkaId ? await prisma.dokument.count({ where: { pojistkaId } }) : 0;
  try {
    const slozka = await zajistiCestu(cestaSlozek({ kategorie: "POJISTKA", propertyId, propertyNazev: nem.name }));
    const pripona = f.mime === "application/pdf" ? "pdf" : f.mime === "image/png" ? "png" : f.mime === "image/webp" ? "webp" : "jpg";
    const casti = p ? [`Pojistná smlouva ${p.pojistovna}`, p.cisloSmlouvy, nem.name, `od ${iso(p.od).split("-").reverse().map(Number).join(".")}`]
      : [`Pojistná smlouva`, nem.name, f.nazev.replace(/\.[^.]+$/, ""), iso(new Date())];
    const nazev = `${bezpecneJmeno(casti.filter(Boolean).join(" – ")).slice(0, 150)}${poradi ? ` (${poradi + 1})` : ""}.${pripona}`;
    const bajty = Buffer.from(f.data, "base64");
    const driveId = await nahrajPrimo({ rodicId: slozka, nazev, mime: f.mime, data: new Uint8Array(bajty) });
    const d = await prisma.dokument.create({ data: { driveId, name: nazev, mime: f.mime, size: bajty.length, kategorie: "POJISTKA", propertyId, pojistkaId } });
    if (pojistkaId) obnov(propertyId);
    return { dokument: { id: d.id, nazev, mime: f.mime } };
  } catch (e) {
    return { error: e instanceof ChybaDisku ? `Smlouva se neuložila: ${e.message}` : "Smlouva se neuložila (Google Disk)." };
  }
}

export async function smazSmlouvu(propertyId: string, dokumentId: string): Promise<{ error?: string }> {
  const chyba = await majitel();
  if (chyba) return { error: chyba };
  const d = await prisma.dokument.findFirst({ where: { id: dokumentId, propertyId, kategorie: "POJISTKA" } });
  if (!d) return {};
  await doKose(d.driveId).catch(() => undefined);
  await prisma.dokument.delete({ where: { id: d.id } });
  obnov(propertyId);
  return {};
}

/** Kontext nemovitosti pro AI a stazeni souboru smlouvy z Disku. */
async function podkladyAi(propertyId: string, dokumentIds: string[], zadano: { pojistovna: string; castka: number; frekvence: string; pojistnaCastka: number | null } | null) {
  const n = await prisma.property.findUnique({
    where: { id: propertyId },
    include: { valuations: { orderBy: { date: "desc" }, take: 1 }, leases: { where: { isActive: true }, select: { id: true } }, kratkodobe: { select: { id: true } } },
  });
  if (!n) throw new Error("Nemovitost neexistuje.");
  const dokumenty = await prisma.dokument.findMany({ where: { id: { in: dokumentIds }, propertyId }, orderBy: { createdAt: "asc" } });
  const soubory = [];
  for (const d of dokumenty.slice(0, 20)) {
    const r = await stahni(d.driveId);
    if (!r.ok) throw new ChybaDisku(`Smlouvu ${d.name} se nepodařilo stáhnout z Disku.`, 502);
    soubory.push({ data: Buffer.from(await r.arrayBuffer()).toString("base64"), mime: d.mime });
  }
  return {
    soubory,
    kontext: {
      nazev: n.name, adresa: `${n.street}, ${n.zip} ${n.city}`, typ: n.type, plochaM2: n.areaM2,
      porizovaciCena: n.purchasePrice, aktualniHodnota: n.valuations[0]?.value ?? null,
      pronajimano: n.leases.length > 0 || n.kratkodobe.length > 0, kratkodobe: n.kratkodobe.length > 0, zadano,
    },
  };
}

/** Nova pojistka: AI precte nahranou smlouvu a vrati udaje k vyplneni (nic neuklada — uzivatel potvrdi). */
export async function prectiNovouSmlouvu(propertyId: string, dokumentIds: string[]): Promise<{ error?: string; rozbor?: RozborPojistky }> {
  const chyba = await majitel();
  if (chyba) return { error: chyba };
  if (!aiPojistkyNastaveno()) return { error: "Čtení smlouvy AI není zapnuté — chybí ANTHROPIC_API_KEY v nastavení Vercelu. Vyplň údaje ručně." };
  if (!dokumentIds.length) return { error: "Nahraj smlouvu." };
  try {
    const { soubory, kontext } = await podkladyAi(propertyId, dokumentIds, null);
    return { rozbor: await rozeberPojistku(soubory, kontext) };
  } catch (e) {
    console.error("Čtení smlouvy:", e);
    return { error: e instanceof ChybaDisku ? e.message : "Smlouvu se nepodařilo přečíst — zkus to znovu, nebo vyplň údaje ručně." };
  }
}

/** AI projde nahranou smlouvu: vytahne udaje, posoudi kryti a doplni chybejici udaje pojistky. */
export async function rozeberSmlouvu(propertyId: string, pojistkaId: string): Promise<{ error?: string; success?: string }> {
  const chyba = await majitel();
  if (chyba) return { error: chyba };
  if (!aiPojistkyNastaveno()) return { error: "Rozbor AI není zapnutý — chybí ANTHROPIC_API_KEY v nastavení Vercelu." };
  const p = await prisma.pojistka.findFirst({
    where: { id: pojistkaId, propertyId },
    include: { property: { include: { valuations: { orderBy: { date: "desc" }, take: 1 }, leases: { where: { isActive: true }, select: { id: true } }, kratkodobe: { select: { id: true } } } } },
  });
  if (!p) return { error: "Pojistka neexistuje." };
  const dokumenty = await prisma.dokument.findMany({ where: { pojistkaId }, orderBy: { createdAt: "asc" } });
  if (!dokumenty.length) return { error: "Nejdřív nahraj smlouvu (PDF nebo fotky stran)." };
  let rozbor: RozborPojistky;
  try {
    const soubory = [];
    for (const d of dokumenty.slice(0, 20)) {
      const r = await stahni(d.driveId);
      if (!r.ok) return { error: `Smlouvu ${d.name} se nepodařilo stáhnout z Disku.` };
      soubory.push({ data: Buffer.from(await r.arrayBuffer()).toString("base64"), mime: d.mime });
    }
    const n = p.property;
    rozbor = await rozeberPojistku(soubory, {
      nazev: n.name, adresa: `${n.street}, ${n.zip} ${n.city}`, typ: n.type, plochaM2: n.areaM2,
      porizovaciCena: n.purchasePrice, aktualniHodnota: n.valuations[0]?.value ?? null,
      pronajimano: n.leases.length > 0 || n.kratkodobe.length > 0, kratkodobe: n.kratkodobe.length > 0,
      zadano: { pojistovna: p.pojistovna, castka: p.castka, frekvence: FREKVENCE[p.frekvence as keyof typeof FREKVENCE]?.nazev ?? p.frekvence, pojistnaCastka: p.pojistnaCastka },
    });
  } catch (e) {
    console.error("Rozbor pojistky:", e);
    return { error: e instanceof ChybaDisku ? e.message : "Rozbor smlouvy se nepovedl — zkus to znovu." };
  }
  // Chybejici udaje doplni z AI (co zadal uzivatel, se neprepisuje)
  await prisma.pojistka.update({
    where: { id: p.id },
    data: {
      ai: rozbor as unknown as Prisma.InputJsonValue, aiAt: new Date(),
      ...(p.cisloSmlouvy ? {} : rozbor.cisloSmlouvy ? { cisloSmlouvy: rozbor.cisloSmlouvy } : {}),
      ...(p.pojistnaCastka ? {} : rozbor.pojistnaCastkaNemovitost ? { pojistnaCastka: rozbor.pojistnaCastkaNemovitost } : {}),
      ...(p.splatnost ? {} : rozbor.splatnost && jeDatum(rozbor.splatnost) ? { splatnost: den(rozbor.splatnost) } : {}),
    },
  });
  obnov(propertyId);
  return { success: rozbor.hodnoceni.stav === "OK" ? "Smlouva prošla — krytí vypadá v pořádku." : rozbor.hodnoceni.stav === "POZOR" ? "Hotovo — ve smlouvě je pár věcí k pozornosti." : "Hotovo — ve smlouvě jsou problémy, podívej se na hodnocení." };
}

/** Porovnani pojisteni vsech nemovitosti (AI z vytazenych udaju). */
export async function porovnejPojistky(): Promise<{ error?: string; vysledek?: PorovnaniPojistek }> {
  const chyba = await majitel();
  if (chyba) return { error: chyba };
  if (!aiPojistkyNastaveno()) return { error: "Porovnání AI není zapnuté — chybí ANTHROPIC_API_KEY." };
  const dnes = new Date();
  const byty = await prisma.property.findMany({
    where: { status: { not: "SOLD" } },
    include: { pojistky: true, valuations: { orderBy: { date: "desc" }, take: 1 }, leases: { where: { isActive: true }, select: { id: true } } },
  });
  try {
    const vysledek = await porovnejPojistkyAi(byty.map((b) => ({
      nemovitost: b.name, hodnota: b.valuations[0]?.value ?? b.purchasePrice, pronajimano: b.leases.length > 0,
      pojistky: b.pojistky.filter((p) => !p.do || p.do >= dnes).map((p) => ({
        pojistovna: p.pojistovna, druh: p.druh, rocniPojistne: p.castka * (FREKVENCE[p.frekvence as keyof typeof FREKVENCE]?.zaRok ?? 1),
        pojistnaCastka: p.pojistnaCastka, rozborAi: p.ai ?? "smlouva zatím nerozebrána",
      })),
    })));
    return { vysledek };
  } catch (e) {
    console.error("Porovnání pojistek:", e);
    return { error: "Porovnání se nepovedlo — zkus to znovu." };
  }
}
