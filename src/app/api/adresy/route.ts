import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

/**
 * Naseptavac adres nad Mapy.cz.
 *
 * Bezi na serveru zamerne: klic by se v prohlizeci dal precist z libovolneho
 * pozadavku a zneuzit cizim webem. Takhle ho nikdo krome nasi aplikace nevidi.
 */

interface MapyPolozka {
  name?: string;
  label?: string;
  location?: string;
  position?: { lat?: number; lon?: number };
  regionalStructure?: { name?: string; type?: string }[];
  zip?: string;
}

/** Z regionalniho rozpadu vytahne to, co potrebuje formular. */
function rozeber(p: MapyPolozka) {
  const casti = p.regionalStructure ?? [];
  const najdi = (typ: string) => casti.find((c) => c.type === typ)?.name;

  // Mapy.cz vraci obec i mestskou cast zvlast; pro Prahu je "municipality"
  // Praha a "municipality_part" napr. Vinohrady
  const mesto = najdi("regional.municipality") ?? najdi("regional.region") ?? "";
  const cast = najdi("regional.municipality_part") ?? "";
  const ulice = najdi("regional.street") ?? "";
  // Kraj je zaloha pro male obce, ktere na Sreality vlastni vypis nemaji
  const kraj = najdi("regional.region") ?? "";

  return {
    // p.name u adresy nese "Korunní 734/15" i s cislem popisnym
    ulice: p.name ?? ulice,
    mesto,
    cast,
    psc: p.zip ?? "",
    kraj,
    latitude: p.position?.lat ?? null,
    longitude: p.position?.lon ?? null,
    popis: p.label ?? p.location ?? "",
  };
}

/** Opacny smer: z bodu na mape udelej adresu. */
async function zeSouradnic(lat: number, lon: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ navrh: null, poznamka: "Neplatné souřadnice." });
  }
  const klic = process.env.MAPY_API_KEY;
  if (!klic) return NextResponse.json({ navrh: null, poznamka: "Mapa není nastavená (chybí MAPY_API_KEY)." });

  const url = "https://api.mapy.cz/v1/rgeocode?" + new URLSearchParams({
    lat: String(lat), lon: String(lon), lang: "cs", apikey: klic,
  });

  try {
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) return NextResponse.json({ navrh: null, poznamka: `Mapy.cz vrátily HTTP ${r.status}.` });
    const data = (await r.json()) as { items?: MapyPolozka[] };
    const prvni = data.items?.[0];
    if (!prvni) return NextResponse.json({ navrh: null, poznamka: "Na tomhle místě žádná adresa není." });

    const navrh = rozeber(prvni);
    // Zpetne hledani nekdy vrati bod bez presnych souradnic — pak platí ten,
    // kam uzivatel klikl
    return NextResponse.json({
      navrh: { ...navrh, latitude: navrh.latitude ?? lat, longitude: navrh.longitude ?? lon },
    });
  } catch {
    return NextResponse.json({ navrh: null, poznamka: "Mapa je dočasně nedostupná." });
  }
}

export async function GET(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Nepřihlášen" }, { status: 401 });

  const params = new URL(request.url).searchParams;

  // Kliknuti do mapy: ze souradnic zpatky adresu
  const lat = params.get("lat");
  const lon = params.get("lon");
  if (lat && lon) return zeSouradnic(Number(lat), Number(lon));

  const dotaz = params.get("q")?.trim() ?? "";
  if (dotaz.length < 3) return NextResponse.json({ navrhy: [] });

  const klic = process.env.MAPY_API_KEY;
  if (!klic) {
    // Formular funguje i bez naseptavace — jen se vyplnuje rucne
    return NextResponse.json({
      navrhy: [],
      poznamka: "Našeptávač adres není nastavený (chybí MAPY_API_KEY). Vyplň adresu ručně.",
    });
  }

  const url = "https://api.mapy.cz/v1/suggest?" + new URLSearchParams({
    query: dotaz,
    lang: "cs",
    limit: "6",
    // Jen ceske adresy a obce — body zajmu jako restaurace nas nezajimaji
    type: "regional.address",
    locality: "cz",
    apikey: klic,
  });

  try {
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) {
      const duvod = r.status === 401 ? "klíč k Mapy.cz neplatí" : `Mapy.cz vrátily HTTP ${r.status}`;
      return NextResponse.json({ navrhy: [], poznamka: `Našeptávač nedostupný — ${duvod}.` });
    }
    const data = (await r.json()) as { items?: MapyPolozka[] };
    const navrhy = (data.items ?? []).map(rozeber).filter((n) => n.mesto);
    return NextResponse.json({ navrhy });
  } catch {
    return NextResponse.json({ navrhy: [], poznamka: "Našeptávač je dočasně nedostupný." });
  }
}
