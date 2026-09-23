/** Prace se souradnicemi — vzdalenost a hledani v okruhu. */

export interface Bod { latitude: number; longitude: number }

const ZEMSKY_POLOMER_KM = 6371;

/**
 * Vzdusna vzdalenost dvou bodu v kilometrech (haversine).
 *
 * Pro nas ucel — okruh par kilometru nad Ceskem — je presnost naprosto
 * dostatecna; zanedbani zploisteni Zeme dela chybu v radu promile.
 */
export function vzdalenostKm(a: Bod, b: Bod): number {
  const doRad = (x: number) => (x * Math.PI) / 180;
  const dLat = doRad(b.latitude - a.latitude);
  const dLon = doRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(doRad(a.latitude)) * Math.cos(doRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * ZEMSKY_POLOMER_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Obdelnik, ktery okruh bezpecne obepina. Slouzi k predvyberu v databazi —
 * porovnani dvou cisel je levnejsi nez pocitat vzdalenost u kazdeho radku.
 * Presny kruh se dofiltruje az potom.
 */
export function obalkaOkruhu(stred: Bod, polomerKm: number) {
  const stupenSirky = polomerKm / 111.32;
  // Polednik se smerem k polum zuzuje, takze rozsah delky zavisi na sirce
  const kosinus = Math.max(0.01, Math.cos((stred.latitude * Math.PI) / 180));
  const stupenDelky = polomerKm / (111.32 * kosinus);
  return {
    latMin: stred.latitude - stupenSirky,
    latMax: stred.latitude + stupenSirky,
    lonMin: stred.longitude - stupenDelky,
    lonMax: stred.longitude + stupenDelky,
  };
}

/**
 * Výchozí okruh podle typu nemovitosti. Ve městě je trh hustý a dva kilometry
 * dají dost vzorků; garáž nebo dům v menší obci potřebuje větší záběr.
 */
export const VYCHOZI_OKRUH_KM: Record<string, number> = {
  BYT: 3,
  DRUZSTEVNI_BYT: 3,
  GARAZ: 5,
  PARKOVACI_STANI: 5,
  RODINNY_DUM: 8,
  BYTOVY_DUM: 15,
  NEBYTOVY_PROSTOR: 5,
  OBCHOD: 5,
  SKLAD: 15,
  POZEMEK: 10,
};

export const okruhProTyp = (typ: string) => VYCHOZI_OKRUH_KM[typ] ?? 5;
