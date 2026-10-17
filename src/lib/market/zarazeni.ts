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

  let km: number | null = null;
  if (n.latitude != null && n.longitude != null && i.latitude != null && i.longitude != null) {
    km = vzdalenost({ lat: n.latitude, lon: n.longitude }, { lat: i.latitude, lon: i.longitude });
    // Male obce se skenuji pres kraj: nabidky z okolnich mest jeste davaji smysl
    if (km > Math.max(n.okruhKm * 5, 20)) return { skore: 0, doporuceno: false, duvod: `${km.toFixed(1)} km daleko`, mimo: true, vzdalenostKm: km };
    if (km > n.okruhKm) { skore -= 30; duvody.push(`${km.toFixed(1)} km, mimo okruh`); }
    else skore -= (km / n.okruhKm) * 15;
  } else if (i.city.trim().toLowerCase() !== n.city.trim().toLowerCase()) {
    skore -= 20; duvody.push("jiná obec, poloha neznámá");
  }

  if (i.areaM2 && n.areaM2) {
    const odchylka = Math.abs(i.areaM2 - n.areaM2) / n.areaM2;
    if (odchylka > 0.5) return { skore: 0, doporuceno: false, duvod: `plocha ${i.areaM2} m²`, mimo: true, vzdalenostKm: km };
    skore -= odchylka * 60;
    if (odchylka > 0.25) duvody.push(`plocha ${Math.round(i.areaM2)} m²`);
  } else {
    skore -= 15; duvody.push("plocha neznámá");
  }

  if (n.disposition && i.disposition && n.disposition !== i.disposition) {
    skore -= 15; duvody.push(`dispozice ${i.disposition}`);
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
  return {
    skore,
    doporuceno: skore >= 70 && !extrem,
    duvod: duvody.length ? duvody.join(", ") : "podobná nabídka",
    mimo: false,
    vzdalenostKm: km,
  };
}

export interface ZarazenyBod {
  /** Kdy se inzerat objevil na trhu (rrrr-mm-dd) */
  datum: string;
  pricePerM2: number;
}

export interface OdhadZarazenych {
  /** Aktualni odhad celkem (cena nebo mesicni najem) */
  hodnota: number;
  perM2: number;
  pocet: number;
  /** Rada pro graf: odhad po kazdem dalsim zarazenem inzeratu */
  rada: { datum: string; hodnota: number; perM2: number; pocet: number }[];
}

/** Datum (rrrr-mm-dd) posunute o dny. */
function minusDni(datum: string, dni: number): string {
  return new Date(Date.parse(`${datum}T00:00:00Z`) - dni * 86400000).toISOString().slice(0, 10);
}

/**
 * Odhad ze zarazenych inzeratu, ktere se objevily na trhu za poslednich `oknoDni` dni
 * (pred datem posledniho z nich). Median ceny za m² krat plocha nemovitosti. Rada ukazuje,
 * jak se odhad vyvijel: v kazdem bode z nabidek za predchozich `oknoDni` dni.
 */
export function odhadZeZarazenych(body: ZarazenyBod[], areaM2: number, oknoDni = 61): OdhadZarazenych | null {
  const platne = body.filter((b) => b.pricePerM2 > 0).sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0));
  if (platne.length === 0) return null;
  const poDnech = new Map<string, { hodnota: number; perM2: number; pocet: number }>();
  for (const b of platne) {
    const od = minusDni(b.datum, oknoDni);
    const vzorek = platne.filter((x) => x.datum > od && x.datum <= b.datum);
    const perM2 = median(vzorek.map((x) => x.pricePerM2));
    poDnech.set(b.datum, { perM2, hodnota: Math.round(perM2 * areaM2), pocet: vzorek.length });
  }
  const rada = [...poDnech.entries()].map(([datum, v]) => ({ datum, ...v }));
  const posledni = rada[rada.length - 1];
  return { hodnota: posledni.hodnota, perM2: posledni.perM2, pocet: posledni.pocet, rada };
}

/** Inzeraty, ze kterych vznikl aktualni odhad (okno pred poslednim zarazenym). */
export function vOkneOdhadu<T extends ZarazenyBod>(body: T[], oknoDni = 61): T[] {
  const platne = body.filter((b) => b.pricePerM2 > 0);
  if (!platne.length) return [];
  const posledni = platne.reduce((m, b) => (b.datum > m ? b.datum : m), platne[0].datum);
  const od = minusDni(posledni, oknoDni);
  return platne.filter((b) => b.datum > od);
}
