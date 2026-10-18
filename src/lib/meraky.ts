/**
 * Meraky a jejich stavy pri predani a vraceni bytu.
 *
 * Stav se zapisuje k udalostem najmu: ZACATEK = predani bytu najemci, KONEC = vraceni.
 * Kdyz na smlouvu navazuje dalsi smlouva tehoz najemnika (prodlouzeni), byt se nepredava
 * a odecet mezi nimi neni potreba — takove udalosti se vynechaji.
 *
 * Soubor pouzivaji i klientske komponenty, takze tu nesmi byt nic serveroveho.
 */
import { denISO } from "./format";

export const DRUHY_MERAKU = [
  { klic: "ELEKTRINA", nazev: "Elektřina", jednotka: "kWh", ikona: "⚡" },
  { klic: "PLYN", nazev: "Plyn", jednotka: "m³", ikona: "🔥" },
  { klic: "VODA_STUDENA", nazev: "Studená voda", jednotka: "m³", ikona: "💧" },
  { klic: "VODA_TEPLA", nazev: "Teplá voda", jednotka: "m³", ikona: "♨️" },
  { klic: "RADIATOR", nazev: "Radiátor", jednotka: "dílků", ikona: "🌡️" },
] as const;

export type DruhMeraku = (typeof DRUHY_MERAKU)[number]["klic"];
export const DRUH_MERAKU_MAP = new Map<string, (typeof DRUHY_MERAKU)[number]>(DRUHY_MERAKU.map((d) => [d.klic, d]));

export function nazevMeraku(m: { druh: string; nazev: string | null }): string {
  const d = DRUH_MERAKU_MAP.get(m.druh);
  return [d?.nazev ?? m.druh, m.nazev].filter(Boolean).join(" · ");
}

export interface SmlouvaProMeraky {
  id: string;
  tenantId: string | null;
  tenantName: string;
  startDate: Date | string;
  endDate: Date | string | null;
  isActive: boolean;
}

export interface UdalostNajmu {
  leaseId: string;
  udalost: "ZACATEK" | "KONEC";
  /** Den predani / vraceni (ISO); null = konec smlouvy bez data */
  datum: string | null;
  najemce: string;
  /** Udalost je v budoucnu (smlouva teprve skonci) */
  budouci: boolean;
}

const den = (d: Date | string) => denISO(d);
const stejnyNajemce = (a: SmlouvaProMeraky, b: SmlouvaProMeraky) =>
  a.tenantId && b.tenantId ? a.tenantId === b.tenantId : a.tenantName.trim().toLowerCase() === b.tenantName.trim().toLowerCase();

/**
 * Udalosti, ke kterym patri stav meraku, od nejnovejsi. Navazujici smlouva tehoz
 * najemnika (zacne do 31 dni po konci predchozi) predavani nema.
 */
export function udalostiNajmu(smlouvy: SmlouvaProMeraky[], dnes = new Date()): UdalostNajmu[] {
  const serazene = [...smlouvy].sort((a, b) => den(a.startDate).localeCompare(den(b.startDate)));
  const dnesISO = den(dnes);
  const out: UdalostNajmu[] = [];
  serazene.forEach((s, i) => {
    const pred = serazene[i - 1];
    const po = serazene[i + 1];
    const navazuje = (a: SmlouvaProMeraky, b: SmlouvaProMeraky) =>
      stejnyNajemce(a, b) && (!a.endDate || Date.parse(den(b.startDate)) - Date.parse(den(a.endDate)) <= 31 * 86400000);
    if (!pred || !navazuje(pred, s)) {
      const datum = den(s.startDate);
      out.push({ leaseId: s.id, udalost: "ZACATEK", datum, najemce: s.tenantName, budouci: datum > dnesISO });
    }
    // Konec: smlouva ma datum konce nebo uz neplati — a nenavazuje na ni tyz najemnik
    if ((s.endDate || !s.isActive) && !(po && navazuje(s, po))) {
      const datum = s.endDate ? den(s.endDate) : null;
      out.push({ leaseId: s.id, udalost: "KONEC", datum, najemce: s.tenantName, budouci: !!datum && datum > dnesISO });
    }
  });
  return out.sort((a, b) => (b.datum ?? "9999").localeCompare(a.datum ?? "9999") || (a.udalost === "ZACATEK" ? -1 : 1));
}
