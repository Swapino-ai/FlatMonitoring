/**
 * Cista logika noveho sledovani trhu: podobnost navrzeneho inzeratu a odhad
 * z posledních zarazenych inzeratu. Bez databaze, at jde otestovat.
 */

export interface NemovitostProSrovnani {
  areaM2: number;
  disposition: string | null;
  latitude: number | null;
  longitude: number | null;
  city: string;
  okruhKm: number;
  /** Tvrda hranice vzdalenosti (km); bez ni plati okruhKm */
  maxKm?: number;
}

export interface InzeratProSrovnani {
  areaM2: number | null;
  disposition: string | null;
  latitude: number | null;
  longitude: number | null;
  city: string;
  pricePerM2: number | null;
}

const R = 6371;
export function vzdalenost(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function median(cisla: number[]): number {
  if (cisla.length === 0) return 0;
  const s = [...cisla].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export interface Hodnoceni {
  /** 0-100, vic = podobnejsi */
  skore: number;
  /** Navrhnout k zarazeni (rozhoduje stejne uzivatel) */
  doporuceno: boolean;
  /** Kratke vysvetleni pro uzivatele */
  duvod: string;
  /** Vubec nenavrhovat: jina velikost nebo daleko */
  mimo: boolean;
  vzdalenostKm: number | null;
}

/**
 * Jak moc se inzerat hodi ke srovnani s nemovitosti. Vzdalenost, plocha, dispozice
 * a cena za m² proti uz zarazenym (extremy se nedoporucuji).
 */
export function ohodnot(n: NemovitostProSrovnani, i: InzeratProSrovnani, medianZarazenych: number | null): Hodnoceni {
  const duvody: string[] = [];
  let skore = 100;
  const mimo = (duvod: string, km: number | null = null): Hodnoceni => ({ skore: 0, doporuceno: false, duvod, mimo: true, vzdalenostKm: km });

  // Dispozice musi byt stejna (pravidlo uzivatele); neznama dispozice jen snizi skore
  if (n.disposition && i.disposition && n.disposition !== i.disposition) return mimo(`dispozice ${i.disposition}`);
  if (n.disposition && !i.disposition) { skore -= 10; duvody.push("dispozice neuvedena"); }

  // Vzdalenost: okruh je tvrda hranice; bez polohy jen stejna obec
  let km: number | null = null;
  const maxKm = n.maxKm ?? n.okruhKm;
  if (n.latitude != null && n.longitude != null && i.latitude != null && i.longitude != null) {
    km = vzdalenost({ lat: n.latitude, lon: n.longitude }, { lat: i.latitude, lon: i.longitude });
    if (km > maxKm) return mimo(`${km.toFixed(1).replace(".", ",")} km, mimo okruh ${maxKm} km`, km);
    skore -= (km / maxKm) * 20;
  } else if (i.city.trim().toLowerCase() !== n.city.trim().toLowerCase()) {
    return mimo("jiná obec a neznámá poloha");
  }

  // Plocha nejvys ±25 %
  if (i.areaM2 && n.areaM2) {
    const odchylka = Math.abs(i.areaM2 - n.areaM2) / n.areaM2;
    if (odchylka > 0.25) return mimo(`plocha ${Math.round(i.areaM2)} m²`, km);
    skore -= odchylka * 80;
  } else {
    skore -= 15; duvody.push("plocha neznámá");
  }

  let extrem = false;
  if (medianZarazenych && i.pricePerM2) {
    const pomer = i.pricePerM2 / medianZarazenych;
    if (pomer > 1.35 || pomer < 0.65) {
      skore -= 25;
      extrem = true;
      duvody.push(`cena za m² ${pomer > 1 ? "+" : ""}${Math.round((pomer - 1) * 100)} % proti zařazeným`);
    }
  }

  skore = Math.max(0, Math.min(100, Math.round(skore)));
  const popis = [km != null ? `${km.toFixed(1).replace(".", ",")} km` : "stejná obec", i.disposition, i.areaM2 ? `${Math.round(i.areaM2)} m²` : null].filter(Boolean).join(" · ");
  return {
    skore,
    doporuceno: skore >= 70 && !extrem,
    duvod: duvody.length ? `${popis} · ${duvody.join(", ")}` : `${popis} ✓`,
    mimo: false,
    vzdalenostKm: km,
  };
}

export interface ZarazenyBod {
  /** Kdy se inzerat objevil na trhu (rrrr-mm-dd) */
  datum: string;
  pricePerM2: number;
  /** Vaha v odhadu (vychozi 1) */
  vaha?: number;
}

/** Vazeny prumer: kazda nabidka prispeje podle sve vahy (podobnosti s nemovitosti). */
export function vazenyPrumer(body: { hodnota: number; vaha: number }[]): number {
  const s = body.filter((b) => b.vaha > 0);
  const celkem = s.reduce((a, b) => a + b.vaha, 0);
  return celkem > 0 ? s.reduce((a, b) => a + b.hodnota * b.vaha, 0) / celkem : 0;
}

/** Vazeny median: hodnota, u ktere kumulativni vaha prekroci polovinu. */
export function vazenyMedian(body: { hodnota: number; vaha: number }[]): number {
  const s = body.filter((b) => b.vaha > 0).sort((a, b) => a.hodnota - b.hodnota);
  if (!s.length) return 0;
  const celkem = s.reduce((a, b) => a + b.vaha, 0);
  let kum = 0;
  for (let k = 0; k < s.length; k++) {
    kum += s[k].vaha;
    if (Math.abs(kum - celkem / 2) < 1e-9 && k + 1 < s.length) return (s[k].hodnota + s[k + 1].hodnota) / 2;
    if (kum > celkem / 2) return s[k].hodnota;
  }
  return s[s.length - 1].hodnota;
}

export const TYPY_DOMU = { PANEL: "Panel", CIHLA: "Cihla", NOVOSTAVBA: "Novostavba" } as const;
export const STAVY_BYTU = { PRED_REKONSTRUKCI: "Před rekonstrukcí", CASTECNA_REKONSTRUKCE: "Částečná rekonstrukce", PO_REKONSTRUKCI: "Po rekonstrukci", NOVOSTAVBA: "Novostavba" } as const;
/** Poradi stavu: sousedni stav (napr. castecna vs. po rekonstrukci) je jeste trochu podobny. */
const PORADI_STAVU: Record<string, number> = { PRED_REKONSTRUKCI: 0, CASTECNA_REKONSTRUKCE: 1, PO_REKONSTRUKCI: 2, NOVOSTAVBA: 3 };

/**
 * Vaha zarazene nabidky podle podobnosti s nemovitosti: cim podobnejsi byt, tim vic urcuje cenu.
 * Plocha 1–2× (stejna = 2×), typ domu: shoda 2×, neshoda ½×; stav: shoda 2×, sousedni 1×, vzdaleny ½×;
 * poloha: stejna obec 1,5×, okoli do 5 km 1×, dal ¾×; neznamo 1×. Rucni vaha ma prednost.
 */
export function vahaNabidky(
  n: { areaM2: number; typDomu: string | null; stavBytu: string | null },
  i: { areaM2: number | null; typDomu: string | null; stavBytu: string | null; vahaRucne: number | null; stejnaObec?: boolean; km?: number | null },
): number {
  if (i.vahaRucne != null) return i.vahaRucne;
  let v = 1;
  if (i.areaM2 && n.areaM2) v *= 1 + Math.max(0, 1 - Math.abs(i.areaM2 - n.areaM2) / (0.25 * n.areaM2));
  if (n.typDomu && i.typDomu) v *= n.typDomu === i.typDomu ? 2 : 0.5;
  // Stav: shoda 2×, sousedni stav 1×, vzdaleny ½×
  if (n.stavBytu && i.stavBytu) {
    const rozdil = Math.abs((PORADI_STAVU[n.stavBytu] ?? 0) - (PORADI_STAVU[i.stavBytu] ?? 0));
    v *= rozdil === 0 ? 2 : rozdil === 1 ? 1 : 0.5;
  }
  if (i.stejnaObec) v *= 1.5;
  else if (i.km != null) v *= i.km <= 5 ? 1 : 0.75;
  return Math.round(v * 100) / 100;
}

/** Obec bez casti ("Novy Bor - Arnultovice" -> "novy bor"), pro porovnani. */
export function zakladObce(obec: string | null | undefined): string {
  return (obec ?? "").split(/\s+-\s+|,/)[0].trim().toLocaleLowerCase("cs");
}

type Poloha = { city: string | null; latitude: number | null; longitude: number | null };

/** Je nabidka ze stejne obce jako nemovitost, a jak daleko je. */
export function polohaNabidky(n: Poloha, i: Poloha): { stejnaObec: boolean; km: number | null } {
  const km = n.latitude != null && n.longitude != null && i.latitude != null && i.longitude != null
    ? vzdalenost({ lat: n.latitude, lon: n.longitude }, { lat: i.latitude, lon: i.longitude }) : null;
  return { stejnaObec: !!n.city && zakladObce(n.city) === zakladObce(i.city), km };
}

/** Typ domu a stav: rucni volba u zarazeni, jinak to, co AI vycetla z inzeratu. */
export function vlastnostiNabidky(z: { typDomu: string | null; stavBytu: string | null }, parametry: unknown) {
  const p = (parametry ?? {}) as { typDomu?: string | null; stavBytu?: string | null };
  return {
    typDomu: z.typDomu ?? p.typDomu ?? null,
    stavBytu: z.stavBytu ?? p.stavBytu ?? null,
    typAi: !z.typDomu && !!p.typDomu,
    stavAi: !z.stavBytu && !!p.stavBytu,
  };
}

/** Vaha zarazeni: spoji rucni volby, AI parametry inzeratu a polohu. */
export function vahaZarazeni(
  n: Poloha & { areaM2: number; typDomu: string | null; stavBytu: string | null },
  z: { typDomu: string | null; stavBytu: string | null; vahaRucne: number | null },
  i: Poloha & { areaM2: number | null; parametry?: unknown },
): number {
  const v = vlastnostiNabidky(z, i.parametry);
  return vahaNabidky(n, { areaM2: i.areaM2, typDomu: v.typDomu, stavBytu: v.stavBytu, vahaRucne: z.vahaRucne, ...polohaNabidky(n, i) });
}

export interface OdhadZarazenych {
  /** Aktualni odhad celkem (cena nebo mesicni najem) */
  hodnota: number;
  perM2: number;
  pocet: number;
  /** Totez jako vazeny median (odolny vuci extremum) */
  median: { hodnota: number; perM2: number };
  /** Rada pro graf: odhad po kazdem dalsim zarazenem inzeratu */
  rada: { datum: string; hodnota: number; perM2: number; pocet: number; medianHodnota: number; medianPerM2: number }[];
}

/** Datum (rrrr-mm-dd) posunute o dny. */
function minusDni(datum: string, dni: number): string {
  return new Date(Date.parse(`${datum}T00:00:00Z`) - dni * 86400000).toISOString().slice(0, 10);
}

/**
 * Odhad ze zarazenych inzeratu, ktere se objevily na trhu za poslednich `oknoDni` dni
 * (pred datem posledniho z nich). Vazeny prumer (a vedle nej vazeny median) ceny za m²
 * krat plocha nemovitosti. Rada ukazuje,
 * jak se odhad vyvijel: v kazdem bode z nabidek za predchozich `oknoDni` dni.
 */
export function odhadZeZarazenych(body: ZarazenyBod[], areaM2: number, oknoDni = 61): OdhadZarazenych | null {
  const platne = body.filter((b) => b.pricePerM2 > 0).sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0));
  if (platne.length === 0) return null;
  const poDnech = new Map<string, Omit<OdhadZarazenych["rada"][number], "datum">>();
  for (const b of platne) {
    const od = minusDni(b.datum, oknoDni);
    const vzorek = platne.filter((x) => x.datum > od && x.datum <= b.datum);
    const vazene = vzorek.map((x) => ({ hodnota: x.pricePerM2, vaha: x.vaha ?? 1 }));
    const perM2 = vazenyPrumer(vazene);
    const medianPerM2 = vazenyMedian(vazene);
    poDnech.set(b.datum, {
      perM2, hodnota: Math.round(perM2 * areaM2), pocet: vzorek.length,
      medianPerM2, medianHodnota: Math.round(medianPerM2 * areaM2),
    });
  }
  const rada = [...poDnech.entries()].map(([datum, v]) => ({ datum, ...v }));
  const posledni = rada[rada.length - 1];
  return {
    hodnota: posledni.hodnota, perM2: posledni.perM2, pocet: posledni.pocet,
    median: { hodnota: posledni.medianHodnota, perM2: posledni.medianPerM2 }, rada,
  };
}

/** Inzeraty, ze kterych vznikl aktualni odhad (okno pred poslednim zarazenym). */
export function vOkneOdhadu<T extends ZarazenyBod>(body: T[], oknoDni = 61): T[] {
  const platne = body.filter((b) => b.pricePerM2 > 0);
  if (!platne.length) return [];
  const posledni = platne.reduce((m, b) => (b.datum > m ? b.datum : m), platne[0].datum);
  const od = minusDni(posledni, oknoDni);
  return platne.filter((b) => b.datum > od);
}
