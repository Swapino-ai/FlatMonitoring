/** Stazeni pohybu z Fio a jejich sparovani (tlacitko na strance Banka i nocni beh). */
import { prisma } from "./db";
import { stahniPohybyFio } from "./fio";
import { ulozPohyby, zpracujPohyby } from "./parovani";

const iso = (d: Date) => d.toISOString().slice(0, 10);

export async function synchronizujFio(): Promise<{ error?: string; novych?: number; sparovano?: number; keKontrole?: number }> {
  // Od posledniho stazeneho pohybu (s rezervou tyden), poprve 90 dni zpet
  const posledni = await prisma.bankovniPohyb.findFirst({ orderBy: { datum: "desc" }, select: { datum: true } });
  const od = new Date(posledni ? posledni.datum.getTime() - 7 * 86400000 : Date.now() - 90 * 86400000);
  const r = await stahniPohybyFio(iso(od), iso(new Date()));
  if (!r.ok) return { error: r.chyba };
  const novych = await ulozPohyby(r.pohyby);
  const z = await zpracujPohyby();
  return { novych, ...z };
}
