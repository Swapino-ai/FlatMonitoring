import { dnuVObdobi, pridejDny, prunik, type RadekNajemce, type VyuctovaniNajemce } from "./vyuctovani";

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
  verze: 1;
  nemovitost: { nazev: string; adresa: string };
  najemce: { cislo: string | null; name: string; adresa: string; email: string | null; phone: string | null; ucet: string | null };
  pronajimatel: { name: string; adresa: string; ucet: string | null } | null;
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

  radky.push(`Náklady na služby: ${kc(s.naklady)}`, `Zaplacené zálohy: ${kc(s.zalohy)}`);
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

/** Slozi zmrazeny obsah vyuctovani z vysledku vypoctu a udaju o stranach. */
export function sestavSnapshot(a: {
  nemovitost: SnapshotVyuctovani["nemovitost"];
  najemce: SnapshotVyuctovani["najemce"];
  pronajimatel: SnapshotVyuctovani["pronajimatel"];
  v: VyuctovaniNajemce;
  aktualniZaloha: number;
  /** Zalohy jsou zamerne jine nez naklady: navrh nove zalohy se nedava. */
  zamerne?: boolean;
}): SnapshotVyuctovani {
  const { v } = a;
  return {
    verze: 1, nemovitost: a.nemovitost, najemce: a.najemce, pronajimatel: a.pronajimatel,
    od: v.od, do: v.do, radky: v.radky, naklady: v.naklady, zalohy: v.zalohy, rozdil: v.rozdil,
    nepokryto: nepokrytoZRadku(v.radky), aktualniZaloha: a.aktualniZaloha,
    doporucenaZaloha: a.zamerne ? null : doporucenaZaloha(v.naklady, v.od, v.do, a.aktualniZaloha),
  };
}
