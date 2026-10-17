/**
 * Stejny byt v jinem inzeratu: tentyz byt se casto inzeruje znovu (jina kancelar, novy
 * inzerat po stazeni, prodej po letech, nebo driv pronajem). Inzeraty maji jine cislo,
 * tak se poznaji podle dispozice, plochy, polohy a patra. Navrh vzdy schvaluje uzivatel.
 *
 * Ciste funkce bez databaze, at jde otestovat.
 */
import { vzdalenost, zakladObce } from "./zarazeni";

export interface InzeratProShodu {
  category: string;
  disposition: string | null;
  areaM2: number | null;
  city: string;
  district: string | null;
  latitude: number | null;
  longitude: number | null;
  /** Patro z AI parametru (PRIZEMI / PATRO / POSLEDNI), kdyz je znamo */
  patro?: string | null;
  /** Presne podlazi, kdyz ho AI uvedla v udajich (napr. "3. patro z 5") */
  podlazi?: number | null;
}

export interface Shoda {
  /** 0–100 */
  skore: number;
  duvod: string;
}

/** Navrhovat od tohoto skore */
export const PRAH_SHODY = 70;

/**
 * Jak pravdepodobne jde o stejny byt. null = urcite ne (jiny druh, dispozice, plocha
 * nebo poloha). Plocha se v inzeratech lisi jen zaokrouhlenim, poloha jen tim, jak
 * presne ji inzerent zadal.
 */
export function podobnostBytu(a: InzeratProShodu, b: InzeratProShodu): Shoda | null {
  if (a.category !== b.category) return null;
  if (a.disposition && b.disposition && a.disposition !== b.disposition) return null;
  if (!a.areaM2 || !b.areaM2) return null;
  const duvody: string[] = [];
  let skore = 40;

  // Plocha: do 1 m² (nebo 2 %) temer jiste stejne, do 4 % jeste mozne
  const rozdil = Math.abs(a.areaM2 - b.areaM2);
  const tolerance = Math.max(1, a.areaM2 * 0.02);
  if (rozdil <= 0.5) { skore += 25; duvody.push(`stejná plocha ${Math.round(a.areaM2)} m²`); }
  else if (rozdil <= tolerance) { skore += 18; duvody.push(`plocha ${Math.round(a.areaM2)} / ${Math.round(b.areaM2)} m²`); }
  else if (rozdil <= a.areaM2 * 0.04) { skore += 5; duvody.push(`plocha ${Math.round(a.areaM2)} / ${Math.round(b.areaM2)} m²`); }
  else return null;

  // Poloha: oba se souradnicemi do 150 m; bez nich stejna obec a cast
  if (a.latitude != null && a.longitude != null && b.latitude != null && b.longitude != null) {
    const m = vzdalenost({ lat: a.latitude, lon: a.longitude }, { lat: b.latitude, lon: b.longitude }) * 1000;
    if (m > 400) return null;
    if (m <= 40) { skore += 25; duvody.push("stejné místo"); }
    else if (m <= 150) { skore += 15; duvody.push(`${Math.round(m)} m od sebe`); }
    else { skore += 3; duvody.push(`${Math.round(m)} m od sebe`); }
  } else {
    if (zakladObce(a.city) !== zakladObce(b.city)) return null;
    if (a.district && b.district && a.district !== b.district) return null;
    skore += 5; duvody.push("stejná obec, poloha neznámá");
  }

  // Patro: rozdilne = jiny byt ve stejnem dome
  if (a.podlazi != null && b.podlazi != null) {
    if (a.podlazi !== b.podlazi) return null;
    skore += 15; duvody.push(`${a.podlazi === 0 ? "přízemí" : `${a.podlazi}. patro`}`);
  } else if (a.patro && b.patro) {
    if (a.patro !== b.patro) return null;
    skore += 5;
  }

  return { skore: Math.min(100, skore), duvod: duvody.join(" · ") };
}

/** Podlazi z udaju AI ("3. patro z 5", "přízemí"). */
export function podlaziZUdaju(info: unknown): number | null {
  if (!Array.isArray(info)) return null;
  for (const x of info) {
    if (typeof x !== "string") continue;
    if (/přízemí/i.test(x)) return 0;
    const m = /(\d+)\.\s*(patro|podlaží|NP)/i.exec(x);
    if (m) return Number(m[1]);
  }
  return null;
}
