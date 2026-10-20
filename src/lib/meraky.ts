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
  // ikona = nazev z components/Ikony (stejne jako u sluzeb)
  { klic: "ELEKTRINA", nazev: "Elektřina", jednotka: "kWh", ikona: "blesk" },
  { klic: "PLYN", nazev: "Plyn", jednotka: "m³", ikona: "plamen" },
  { klic: "VODA_STUDENA", nazev: "Studená voda", jednotka: "m³", ikona: "kapka" },
  { klic: "VODA_TEPLA", nazev: "Teplá voda", jednotka: "m³", ikona: "kohoutek" },
  { klic: "RADIATOR", nazev: "Radiátor", jednotka: "dílků", ikona: "radiator" },
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

export interface MerakSeStavy {
  id: string;
  druh: string;
  nazev: string | null;
  aktivni: boolean;
  dvoutarif: boolean;
  nahrazujeId: string | null;
  /** Kazdorocni vynulovani "MM-DD" (radiatory) */
  nulovani?: string | null;
  stavy: {
    datum: string; hodnota: number | null; hodnota2: number | null; vynulovanoPo?: boolean;
    /** Udalost a smlouva (predani / vraceni) — presne hranice najmu */
    udalost?: string; leaseId?: string | null;
    /** Vyuctovani od dodavatele, ke kterym je tohle konecny odecet */
    vyuctovani?: string[];
  }[];
}

/** Lezi den vynulovani (kazdy rok "MM-DD") v intervalu (od, do]? Vraci jeho datum. */
export function nulovaniMezi(nulovani: string | null | undefined, od: string, doDne: string): string | null {
  if (!nulovani || !/^\d{2}-\d{2}$/.test(nulovani)) return null;
  for (let rok = Number(od.slice(0, 4)); rok <= Number(doDne.slice(0, 4)); rok++) {
    const d = `${rok}-${nulovani}`;
    if (d > od && d <= doDne) return d;
  }
  return null;
}

/** "31/12" (den/mesic) → "12-31"; prazdne → null; neplatne → undefined. */
export function nulovaniZTextu(text: string): string | null | undefined {
  const t = text.trim();
  if (!t) return null;
  const m = /^(\d{1,2})[/.\-\s]+(\d{1,2})\.?$/.exec(t);
  if (!m) return undefined;
  const den = Number(m[1]), mesic = Number(m[2]);
  if (mesic < 1 || mesic > 12 || den < 1 || den > new Date(Date.UTC(2024, mesic, 0)).getUTCDate()) return undefined;
  return `${String(mesic).padStart(2, "0")}-${String(den).padStart(2, "0")}`;
}

/** "12-31" → "31/12" */
export const nulovaniText = (n: string | null | undefined) => (n ? `${n.slice(3, 5)}/${n.slice(0, 2)}` : "");

/**
 * Meraky seskupene podle mista: aktualni merak a pred nim ty, ktere nahradil
 * (od nejnovejsiho). Vyrazeny merak bez nastupce je samostatne misto.
 */
export function retezceMeraku<T extends { id: string; aktivni: boolean; nahrazujeId: string | null }>(meraky: T[]): T[][] {
  const podleId = new Map(meraky.map((m) => [m.id, m]));
  const nahrazene = new Set(meraky.map((m) => m.nahrazujeId).filter(Boolean));
  // Konec retezce = merak, ktery nikdo nenahradil
  return meraky.filter((m) => !nahrazene.has(m.id)).map((posledni) => {
    const retezec = [posledni];
    let m = posledni;
    while (m.nahrazujeId && podleId.has(m.nahrazujeId) && !retezec.includes(podleId.get(m.nahrazujeId)!)) {
      m = podleId.get(m.nahrazujeId)!;
      retezec.push(m);
    }
    return retezec;
  });
}

export interface SpotrebaVObdobi {
  spotreba: number;
  /** Prvni a posledni pouzity odecet — kdyz se lisi od hranic obdobi, je to jen cast */
  od: string;
  do: string;
  /** Pres vynulovani bez odectu tesne pred nim: cast spotreby pred vynulovanim chybi */
  neuplna?: boolean;
}

/**
 * Spotreba mista (retezce meraku) mezi dvema dny vcetne vymen a vynulovani: u kazdeho
 * meraku soucet prirustku mezi po sobe jdoucimi stavy. Kdyz se merak mezi dvema stavy
 * vynuloval (kazdorocni den nulovani, priznak z odectu, nebo u nulovaneho meraku pokles),
 * pocita se novy stav od nuly. Null, kdyz v obdobi nejsou aspon dva stavy.
 */
export function spotrebaVObdobi(retezec: MerakSeStavy[], od: string, doDne: string, tarif: 1 | 2 = 1): SpotrebaVObdobi | null {
  let spotreba = 0;
  let prvni: string | null = null;
  let posledni: string | null = null;
  let pouzito = false;
  let neuplna = false;
  for (const m of retezec) {
    const stavy = m.stavy
      .map((s) => ({ datum: s.datum, h: tarif === 2 ? s.hodnota2 : s.hodnota, nula: !!s.vynulovanoPo }))
      .filter((s): s is { datum: string; h: number; nula: boolean } => s.h != null && s.datum >= od && s.datum <= doDne)
      .sort((a, b) => a.datum.localeCompare(b.datum));
    if (stavy.length < 2) continue;
    for (let i = 1; i < stavy.length; i++) {
      const a = stavy[i - 1], b = stavy[i];
      const den = nulovaniMezi(m.nulovani, a.datum, b.datum);
      const vynulovano = a.nula || !!den || (!!m.nulovani && b.h < a.h);
      if (!vynulovano) { spotreba += b.h - a.h; continue; }
      spotreba += b.h;
      // Odecet tesne pred vynulovanim (den pred nim nebo s priznakem) = nic nechybi
      const denPred = den ? new Date(Date.parse(`${den}T00:00:00Z`) - 86400000).toISOString().slice(0, 10) : null;
      if (!a.nula && a.datum !== denPred) neuplna = true;
    }
    pouzito = true;
    if (!prvni || stavy[0].datum < prvni) prvni = stavy[0].datum;
    if (!posledni || stavy[stavy.length - 1].datum > posledni) posledni = stavy[stavy.length - 1].datum;
  }
  return pouzito ? { spotreba: Math.round(spotreba * 1000) / 1000, od: prvni!, do: posledni!, ...(neuplna ? { neuplna } : {}) } : null;
}

/**
 * Spolecna spotreba domu (spolecna elektrina, plyn kotelny SVJ): elektromer ani plynomer
 * v bytu ji nemeri. Pozna se podle dodavatele, skupiny nebo poznamky. Voda a teplo od SVJ
 * se ale podle meraku v bytu rozuctovavaji, ty se nevylucuji.
 */
export function jeSpolecnaSpotreba(s: { provider?: string | null; groupName?: string | null; notes?: string | null }): boolean {
  return /společn|spolecn|\bSVJ\b|\bS?BD\b|družstv|druzstv|chodb|osvětlen|osvetlen/i.test(`${s.provider ?? ""} ${s.groupName ?? ""} ${s.notes ?? ""}`);
}

/** Meraky sluzby s ohledem na nastaveni sluzby (rucne / automaticky bez spolecne spotreby). */
export function merakySluzby(ikona: string | undefined, s: { merak?: boolean | null; provider?: string | null; groupName?: string | null; notes?: string | null }): string[] {
  const druhy = druhyMerakuProSluzbu(ikona);
  if (s.merak === false) return [];
  if (s.merak == null && (ikona === "blesk" || ikona === "plamen") && jeSpolecnaSpotreba(s)) return [];
  return druhy;
}

/** Ktere meraky patri ke sluzbe (podle ikony druhu sluzby — plati i pro vlastni druhy). */
export function druhyMerakuProSluzbu(ikonaSluzby: string | undefined): string[] {
  switch (ikonaSluzby) {
    case "blesk": return ["ELEKTRINA"];
    case "plamen": return ["PLYN"];
    case "kapka": case "kohoutek": return ["VODA_STUDENA", "VODA_TEPLA"];
    case "radiator": case "teplomer": return ["RADIATOR"];
    default: return [];
  }
}
