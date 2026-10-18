/**
 * Spoluvlastnictvi a pohled na portfolio.
 *
 * Byt bez zadanych vlastniku se povazuje za cely tvuj — diky tomu nic nerozbije
 * zavedeni podilu do uz vedene evidence a podily se daji doplnit postupne.
 *
 * Soubor pouzivaji i klientske komponenty, takze tu nesmi byt nic serveroveho.
 * Cteni zvoleneho pohledu z cookie je proto v ownership.server.ts.
 */

export const POHLED_COOKIE = "fm_pohled";
export type Pohled = "moje" | "vse";

export interface PodilVlastnika {
  userId: string;
  share: number;
}

/**
 * Jakou cast bytu vlastni dany uzivatel. Vraci 0-1.
 * Bez zadanych vlastniku vraci 1 — evidence zatim podily neresi.
 */
export function podilUzivatele(owners: PodilVlastnika[], userId: string): number {
  if (owners.length === 0) return 1;
  const muj = owners.find((o) => o.userId === userId);
  return muj ? Math.max(0, Math.min(100, muj.share)) / 100 : 0;
}

/** Soucet zadanych podilu v procentech. */
export function soucetPodilu(owners: PodilVlastnika[]): number {
  return owners.reduce((a, o) => a + o.share, 0);
}

/** Kolik zbyva do 100 % — kladne cislo znaci nezadanou cast. */
export function neprirazenyPodil(owners: PodilVlastnika[]): number {
  if (owners.length === 0) return 0;
  return Math.round((100 - soucetPodilu(owners)) * 100) / 100;
}

/**
 * Nasobitel pro dany byt podle zvoleneho pohledu.
 * Pri pohledu na cele portfolio se nic nekrati.
 */
export function nasobitel(pohled: Pohled, owners: PodilVlastnika[], userId: string): number {
  return pohled === "moje" ? podilUzivatele(owners, userId) : 1;
}

/**
 * Jakou cast uveru nese dany pohled (0-1). Uver s prirazenymi vlastniky patri jen jim
 * (rovnym dilem) — nezavisle na podilu na nemovitosti. Uver bez vlastniku se deli
 * jako nemovitost.
 */
export function podilNaUveru(
  pohled: Pohled,
  uver: { vlastnici?: { userId: string }[] },
  owners: PodilVlastnika[],
  userId: string,
): number {
  if (pohled !== "moje") return 1;
  const vlastnici = uver.vlastnici ?? [];
  if (vlastnici.length === 0) return podilUzivatele(owners, userId);
  return vlastnici.some((v) => v.userId === userId) ? 1 / vlastnici.length : 0;
}
