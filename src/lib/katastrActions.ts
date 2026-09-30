"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "./db";
import { getSession } from "./auth";
import {
  KatastrChyba, najdiStavbu, popisJednotky, popisParcely, stavUctu,
  type JednotkaVDome,
} from "./katastr";

export interface KatastrStav {
  error?: string;
  success?: string;
}

async function majitel() {
  const user = await getSession();
  if (!user) return { error: "Nejsi přihlášen." };
  if (user.role !== "OWNER") return { error: "Údaje z katastru může načíst jen majitel." };
  return { ok: true as const };
}

/**
 * Dohleda nemovitost v katastru a vysledek ulozi.
 *
 * Jedno dohledani stoji dve volani na ciselniky plus jedno za kazdou
 * prohledanou cast obce. Proto se spousti jen na tlacitko, ne samo.
 */
export async function dohledejKatastr(propertyId: string): Promise<KatastrStav> {
  const auth = await majitel();
  if ("error" in auth) return auth;

  const p = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { id: true, street: true, city: true },
  });
  if (!p) return { error: "Nemovitost neexistuje." };

  try {
    const nalez = await najdiStavbu(p);
    if (!nalez) {
      return { error: `V katastru se pro adresu ${p.street}, ${p.city} nic nenašlo. Zkontroluj číslo popisné.` };
    }

    const s = nalez.stavba;
    const data = {
      obecKod: s.obec?.kod ?? null,
      obecNazev: s.obec?.nazev ?? null,
      castObceNazev: s.castObce?.nazev ?? nalez.castObce,
      katastralniUzemiKod: s.lv?.katastralniUzemi?.kod ?? s.parcely[0]?.katastralniUzemi?.kod ?? null,
      katastralniUzemiNazev: s.lv?.katastralniUzemi?.nazev ?? s.parcely[0]?.katastralniUzemi?.nazev ?? null,
      lvCislo: s.lv?.cislo ?? null,
      stavbaId: s.id,
      typStavby: s.typStavby?.nazev ?? null,
      cisloDomovni: s.cislaDomovni?.[0] ?? null,
      zpusobVyuziti: s.zpusobVyuziti?.nazev ?? null,
      zpusobyOchrany: s.zpusobyOchrany?.length ? s.zpusobyOchrany.map((o) => o.nazev).join(", ") : null,
      parcely: s.parcely?.length ? s.parcely.map(popisParcely).join(", ") : null,
      // Nahlizeni umi odkaz na parcelu a na jednotku, na stavbu ne — proto id parcely
      parcelaId: s.parcely?.[0]?.id ?? null,
      jednotky: (s.jednotky ?? []).map((j: JednotkaVDome) => ({
        id: j.id,
        cislo: j.cisloJednotky,
        popis: popisJednotky(j.cisloJednotky),
      })),
      nactenoKdy: new Date(),
    };

    await prisma.cadastreRecord.upsert({
      where: { propertyId },
      // Vybranou jednotku necháváme — uzivatel ji urcil rucne a novy nacet ji nema prepsat
      update: data,
      create: { propertyId, ...data },
    });

    revalidatePath(`/properties/${propertyId}`);
    return {
      success: s.lv
        ? `Načteno z katastru — LV ${s.lv.cislo}, k. ú. ${s.lv.katastralniUzemi.nazev}.`
        : "Načteno z katastru.",
    };
  } catch (e) {
    if (e instanceof KatastrChyba) return { error: e.message };
    return { error: "Dohledání v katastru se nepodařilo." };
  }
}

/** Ktera z jednotek v dome je ta nase — vybira uzivatel, katastr to nevi. */
export async function vyberJednotku(propertyId: string, cisloJednotky: string): Promise<KatastrStav> {
  const auth = await majitel();
  if ("error" in auth) return auth;

  await prisma.cadastreRecord.update({
    where: { propertyId },
    data: { cisloJednotky: cisloJednotky || null },
  });

  revalidatePath(`/properties/${propertyId}`);
  return { success: cisloJednotky ? `Jednotka ${cisloJednotky} uložena.` : "Výběr jednotky zrušen." };
}

/**
 * Rucne vlozeny odkaz do Nahlizeni.
 *
 * U stavby Nahlizeni pouziva sifrovany token misto identifikatoru, takze odkaz
 * nejde slozit. Vlozit ho jednou rucne je rychlejsi nez ho pokazde hledat.
 */
export async function ulozOdkazNahlizeni(propertyId: string, odkaz: string): Promise<KatastrStav> {
  const auth = await majitel();
  if ("error" in auth) return auth;

  const cisty = odkaz.trim();
  if (cisty && !cisty.startsWith("https://nahlizenidokn.cuzk.gov.cz/")) {
    return { error: "Odkaz musí vést do Nahlížení do KN (nahlizenidokn.cuzk.gov.cz)." };
  }

  await prisma.cadastreRecord.upsert({
    where: { propertyId },
    update: { nahlizeniOdkaz: cisty || null },
    create: { propertyId, nahlizeniOdkaz: cisty || null },
  });

  revalidatePath(`/properties/${propertyId}`);
  return { success: cisty ? "Odkaz uložen." : "Odkaz smazán." };
}

/** Kolik volani z kvoty uz padlo — aby se uzivatel nedivil, az prestane fungovat. */
export async function zjistiKvotu(): Promise<{ text: string; varovat: boolean } | null> {
  const auth = await majitel();
  if ("error" in auth) return null;

  try {
    const s = await stavUctu();
    const zbyva = s.limitVolani - s.provedenoVolani;
    const expirace = new Date(s.expiraceApiKey);
    const dnuDoExpirace = Math.round((expirace.getTime() - Date.now()) / 86400000);
    return {
      text: `Zbývá ${zbyva} z ${s.limitVolani} dotazů na katastr · klíč platí do ${expirace.toLocaleDateString("cs-CZ")}`,
      varovat: zbyva < 50 || dnuDoExpirace < 30,
    };
  } catch {
    return null;
  }
}
