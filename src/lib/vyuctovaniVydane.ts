import { dnuVObdobi, pridejDny, prunik, type RadekNajemce } from "./vyuctovani";
import type { SkupinaVyuctovani, VysledekNajemce } from "./vyuctovaniNajemce";

/**
 * Vyuctovani vydane najemci: zmrazeny obsah (snapshot), cisla, lhuty a text zpravy.
 * Ciste funkce — bezi na serveru i v prohlizeci a jdou testovat.
 */

export type StavVyuctovani = "VYDANO" | "ODESLANO" | "VYPORADANO" | "STORNO";
export type ZpusobOdeslani = "EMAIL" | "OSOBNE" | "POSTA" | "JINAK";

export const NAZVY_STAVU: Record<StavVyuctovani, string> = {
  VYDANO: "vydáno", ODESLANO: "odesláno nájemci", VYPORADANO: "vypořádáno", STORNO: "stornováno",
};
export const NAZVY_ZPUSOBU: Record<ZpusobOdeslani, string> = {
  EMAIL: "e-mailem", OSOBNE: "osobně", POSTA: "poštou", JINAK: "jinak",
};

export interface SnapshotVyuctovani {
  /** 1 = starsi doklady (bez skupin a prenosu), 2 = pruvodce */
  verze: 1 | 2;
  nemovitost: { nazev: string; adresa: string };
  najemce: { cislo: string | null; name: string; adresa: string; email: string | null; phone: string | null; ucet: string | null };
  pronajimatel: { name: string; adresa: string; ucet: string | null; ico?: string | null; dic?: string | null } | null;
  od: string;
  do: string;
  radky: RadekNajemce[];
  naklady: number;
  zalohy: number;
  /** Zalohy minus naklady: kladne = vratka najemci, zaporne = nedoplatek. */
  rozdil: number;
  /** Co v dobe vydani chybelo (vyuctovani dodavatele za cast obdobi, odecty). */
  nepokryto: { sluzba: string; popis: string }[];
  aktualniZaloha: number;
  doporucenaZaloha: number | null;
  /** Vyuctovane sluzby po skupinach (verze 2) */
  skupiny?: SkupinaVyuctovani[];
  /** Co dodavatel jeste nevyuctoval — prenese se do dalsiho vyuctovani (verze 2) */
  preneseno?: { sluzba: string; od: string; do: string; duvod?: string | null }[];
  /** Do kdy je ktera sluzba vyuctovana — dalsi vyuctovani na to navaze (verze 2) */
  sluzbyDo?: Record<string, string>;
  /** Zalohy nájemce po mesicich: predpis, kolik a kdy prislo */
  platby?: PlatbaZalohy[];
  /** Mesicni zalohy podle smlouvy po obdobich se stejnou vysi a jejich rozpis po sluzbach */
  rozpisZaloh?: ObdobiZaloh[];
  /** Z ceho se sklada "Zalohy za obdobi": useky se stejnou mesicni zalohou */
  zalohySluzeb?: { nazev: string; od: string; do: string; castka: number }[];
}

export interface ObdobiZaloh {
  od: string;
  do: string;
  mesicne: number;
  polozky: { nazev: string; castka: number }[];
}

/**
 * Mesicni zalohy podle smlouvy v rozsahu vyuctovani: kazda zmena vyse (nebo rozpisu)
 * zacne nove obdobi. Bez rozpisu jen celkova castka.
 */
export function rozpisZaloh(
  n: { utilitiesMonthly: number; advanceItems?: { serviceId: string; amount: number }[] | null; historieZaloh?: { validFrom: Date | string; amount: number; items?: { serviceId: string; amount: number }[] | null }[] },
  od: string, doDne: string, nazvy: Record<string, string>,
): ObdobiZaloh[] {
  const den = (d: Date | string) => new Date(d).toISOString().slice(0, 10);
  const zmeny = [...(n.historieZaloh ?? [])].sort((a, b) => den(a.validFrom).localeCompare(den(b.validFrom)));
  const stav = (d: string) => {
    if (!zmeny.length) return { mesicne: n.utilitiesMonthly, items: n.advanceItems ?? null };
    const z = [...zmeny].reverse().find((x) => den(x.validFrom) <= d) ?? zmeny[0];
    return { mesicne: z.amount, items: z.items ?? null };
  };
  // Zacatky obdobi: zacatek vyuctovani a kazda zmena uvnitr
  const zacatky = [od, ...zmeny.map((z) => den(z.validFrom)).filter((d) => d > od && d <= doDne)];
  return [...new Set(zacatky)].sort().map((z, i, arr) => {
    const k = arr[i + 1] ? pridejDny(arr[i + 1], -1) : doDne;
    const s = stav(z);
    const polozky = (s.items ?? []).filter((x) => x.amount > 0).map((x) => ({ nazev: nazvy[x.serviceId] ?? "služba", castka: x.amount }));
    const zbytek = s.mesicne - polozky.reduce((a, x) => a + x.castka, 0);
    if (polozky.length && zbytek > 0.5) polozky.push({ nazev: "ostatní", castka: zbytek });
    return { od: z, do: k, mesicne: s.mesicne, polozky };
  })
    // Stejna obdobi za sebou (zmena bez zmeny castek) se slouci
    .reduce<ObdobiZaloh[]>((acc, o) => {
      const p = acc[acc.length - 1];
      if (p && p.mesicne === o.mesicne && JSON.stringify(p.polozky) === JSON.stringify(o.polozky)) { p.do = o.do; return acc; }
      acc.push(o);
      return acc;
    }, []);
}

export interface PlatbaZalohy {
  /** rrrr-mm */
  mesic: string;
  predpis: number;
  zaplaceno: number | null;
  datum: string | null;
}

/** Zalohy smlouvy po mesicich v rozsahu vyuctovani (z pravidelnych plateb). */
export function platbyZaloh(
  navrh: { klic: string; mesic: string; castka: number; zaplaceno?: { datum: string; castka: number } | null }[],
  leaseId: string, od: string, doDne: string,
): PlatbaZalohy[] {
  return navrh
    .filter((p) => p.klic.startsWith(`zaloha:${leaseId}:`) && p.mesic >= od.slice(0, 7) && p.mesic <= doDne.slice(0, 7))
    .sort((a, b) => a.mesic.localeCompare(b.mesic))
    .map((p) => ({ mesic: p.mesic, predpis: Math.abs(p.castka), zaplaceno: p.zaplaceno?.castka ?? null, datum: p.zaplaceno?.datum ?? null }));
}

/** Cislo dokladu VN-2026-0001; poradi se pocita v ramci roku vydani. */
export function dalsiCislo(rok: number, existujici: string[]): string {
  const predpona = `VN-${rok}-`;
  const nejvyssi = existujici
    .filter((c) => c.startsWith(predpona))
    .map((c) => Number(c.slice(predpona.length)))
    .filter((n) => Number.isFinite(n))
    .reduce((a, b) => Math.max(a, b), 0);
  return `${predpona}${String(nejvyssi + 1).padStart(4, "0")}`;
}

/** Variabilni symbol: jen cislice z cisla dokladu (VN-2026-0001 -> 20260001). */
export const variabilniSymbol = (cislo: string) => cislo.replace(/\D/g, "");

/** Zakon o sluzbach (67/2013) pocita s vyuctovanim do 4 mesicu od konce obdobi — jen informativne. */
export function lhutaDoruceni(doDne: string): string {
  const d = new Date(`${doDne}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 4);
  return d.toISOString().slice(0, 10);
}

/** Vychozi splatnost nedoplatku (a termin vraceni preplatku): 30 dni od vydani. */
export const vychoziSplatnost = (vydano: string) => pridejDny(vydano, 30);

/**
 * Doporucena mesicni zaloha pro dalsi obdobi podle skutecnych nakladu. Vraci null,
 * kdyz je obdobi kratke (sezonni vykyvy) nebo se zaloha od skutecnosti lisi jen malo.
 */
export function doporucenaZaloha(naklady: number, od: string, doDne: string, aktualni: number): number | null {
  const dnu = dnuVObdobi(od, doDne);
  if (dnu < 90 || naklady <= 0) return null;
  const mesicne = (naklady / dnu) * (365 / 12);
  const zaokrouhleno = Math.ceil(mesicne / 10) * 10;
  const rozdil = Math.abs(zaokrouhleno - aktualni);
  return rozdil >= Math.max(100, aktualni * 0.05) ? zaokrouhleno : null;
}

/**
 * Navrh nove mesicni zalohy, kdyz se vyuctovaly jen nektere sluzby: zaloha se upravi jen
 * o rozdil mezi naklady a zalohami vyuctovanych sluzeb, ostatni sluzby zustanou jak jsou.
 */
export function upravaZalohy(naklady: number, zalohy: number, od: string, doDne: string, aktualni: number): number | null {
  const dnu = dnuVObdobi(od, doDne);
  if (dnu < 90 || naklady <= 0 || aktualni <= 0) return null;
  const novy = Math.ceil((aktualni + ((naklady - zalohy) / dnu) * (365 / 12)) / 10) * 10;
  const rozdil = Math.abs(novy - aktualni);
  return novy > 0 && rozdil >= Math.max(100, aktualni * 0.05) ? novy : null;
}

/** Prekryva obdobi jiz vydane (nestornovane) vyuctovani stejne smlouvy? Vraci prvni kolizi. */
export function kolize(
  existujici: { cislo: string; od: string; do: string; status: string }[], od: string, doDne: string,
): { cislo: string; od: string; do: string } | null {
  return existujici.find((e) => e.status !== "STORNO" && prunik(e.od, e.do, od, doDne)) ?? null;
}

export interface StavLhuty {
  /** Dnu do splatnosti; zaporne = po splatnosti. null = bez splatnosti nebo uz vyporadano. */
  dni: number | null;
  poSplatnosti: boolean;
}

export function stavLhuty(
  v: { status: string; dueDate: string | null }, dnes: string,
): StavLhuty {
  if (!v.dueDate || v.status === "VYPORADANO" || v.status === "STORNO") return { dni: null, poSplatnosti: false };
  const dni = Math.round((Date.parse(`${v.dueDate}T00:00:00Z`) - Date.parse(`${dnes}T00:00:00Z`)) / 86400000);
  return { dni, poSplatnosti: dni < 0 };
}

const kc = (n: number) => `${Math.round(Math.abs(n)).toLocaleString("cs-CZ").replace(/\s/g, " ")} Kč`;
const datum = (iso: string) => {
  const [r, m, d] = iso.split("-");
  return `${Number(d)}. ${Number(m)}. ${r}`;
};

/** Predmet a text e-mailu nebo zpravy najemci. Prilohu (PDF) pripoji uzivatel sam. */
export function textZpravy(s: SnapshotVyuctovani, cislo: string, splatnost: string | null): { predmet: string; telo: string } {
  const predmet = `Vyúčtování služeb ${datum(s.od)} – ${datum(s.do)} (${s.nemovitost.nazev})`;
  const jmeno = s.najemce.name;
  const radky = [`Dobrý den, ${jmeno},`, "", `v příloze posílám vyúčtování služeb za období ${datum(s.od)} – ${datum(s.do)} (č. ${cislo}).`, ""];

  radky.push(`Náklady na služby: ${kc(s.naklady)}`, `Zálohy za období: ${kc(s.zalohy)}`);
  if (Math.abs(s.rozdil) < 1) {
    radky.push("", "Zálohy odpovídají nákladům, nic se nedoplácí ani nevrací.");
  } else if (s.rozdil < 0) {
    radky.push("", `Nedoplatek: ${kc(s.rozdil)}`);
    if (splatnost) radky.push(`Splatnost: ${datum(splatnost)}`);
    if (s.pronajimatel?.ucet) radky.push(`Číslo účtu: ${s.pronajimatel.ucet}`, `Variabilní symbol: ${variabilniSymbol(cislo)}`);
  } else {
    radky.push("", `Přeplatek: ${kc(s.rozdil)}`);
    if (splatnost) radky.push(`Přeplatek vrátím nejpozději do ${datum(splatnost)}${s.najemce.ucet ? ` na účet ${s.najemce.ucet}` : ""}.`);
  }
  if (s.doporucenaZaloha != null) {
    radky.push("", `Navrhuji upravit měsíční zálohy na služby z ${kc(s.aktualniZaloha)} na ${kc(s.doporucenaZaloha)}.`);
  }
  radky.push("", "V případě dotazů se mi ozvěte.", "", s.pronajimatel?.name ?? "");
  return { predmet, telo: radky.join("\n") };
}

/** Odkaz mailto: s predvyplnenym predmetem a textem. */
export function odkazMailto(email: string | null, predmet: string, telo: string): string {
  return `mailto:${email ?? ""}?subject=${encodeURIComponent(predmet)}&body=${encodeURIComponent(telo)}`;
}

/** Co ve vyuctovani chybi: neprokryta obdobi a chybejici odecty. */
export function nepokrytoZRadku(radky: RadekNajemce[]): { sluzba: string; popis: string }[] {
  const out: { sluzba: string; popis: string }[] = [];
  for (const r of radky) {
    for (const c of r.chybi) out.push({ sluzba: r.nazev, popis: `chybí vyúčtování dodavatele za ${datum(c[0])} – ${datum(c[1])}` });
    for (const z of r.zdroje.filter((x) => x.chybiOdecet)) {
      out.push({ sluzba: r.nazev, popis: `chybí odečet nájemce ve vyúčtování ${datum(z.od)} – ${datum(z.do)}` });
    }
  }
  return out;
}

/** Slozi zmrazeny obsah vyuctovani z vysledku pruvodce a udaju o stranach. */
export function sestavSnapshot(a: {
  nemovitost: SnapshotVyuctovani["nemovitost"];
  najemce: SnapshotVyuctovani["najemce"];
  pronajimatel: SnapshotVyuctovani["pronajimatel"];
  v: VysledekNajemce;
  aktualniZaloha: number;
  /** Zalohy jsou zamerne jine nez naklady: navrh nove zalohy se nedava. */
  zamerne?: boolean;
  /** Platby zaloh po mesicich */
  platby?: PlatbaZalohy[];
  rozpisZaloh?: ObdobiZaloh[];
}): SnapshotVyuctovani {
  const { v } = a;
  const vyuctovane = v.sluzby.filter((r) => r.stav === "VYUCTOVANO");
  // Ploche radky kvuli starsim zobrazenim a kontrolam
  const radky: RadekNajemce[] = vyuctovane.map((r) => ({
    sluzbaId: r.sluzbaId, nazev: r.nazev, dodavatel: r.dodavatel, castka: r.castka, chybi: [],
    zdroje: r.zdroje.map((z) => ({ id: z.id, od: z.od, do: z.do, podil: z.podil, spotreba: z.spotreba, jednotka: z.jednotka, chybiOdecet: z.chybiOdecet })),
  }));
  const preneseno = v.sluzby.filter((r) => r.vybrana && r.preneseno).map((r) => ({ sluzba: r.nazev, od: r.preneseno![0], do: r.preneseno![1], duvod: r.duvodPrenosu ?? null }));
  return {
    verze: 2, nemovitost: a.nemovitost, najemce: a.najemce, pronajimatel: a.pronajimatel,
    od: v.od, do: v.do, radky, naklady: v.naklady, zalohy: v.zalohy, rozdil: v.rozdil,
    nepokryto: nepokrytoZRadku(radky), aktualniZaloha: a.aktualniZaloha,
    doporucenaZaloha: a.zamerne ? null : upravaZalohy(v.naklady, v.zalohy, v.od, v.do, a.aktualniZaloha),
    skupiny: v.skupiny, preneseno, sluzbyDo: v.sluzbyDo, platby: a.platby ?? [], rozpisZaloh: a.rozpisZaloh ?? [],
    zalohySluzeb: (v.zalohyObdobi ?? []).map((o) => ({ nazev: `${kc(o.mesicne)} měsíčně`, od: o.od, do: o.do, castka: Math.round(o.castka) })),
  };
}
