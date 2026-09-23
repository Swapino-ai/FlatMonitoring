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

  return {
    // p.name u adresy nese "Korunní 734/15" i s cislem popisnym
    ulice: p.name ?? ulice,
    mesto,
    cast,
    psc: p.zip ?? "",
    latitude: p.position?.lat ?? null,
    longitude: p.position?.lon ?? null,
    popis: p.label ?? p.location ?? "",
  };
}

export async function GET(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Nepřihlášen" }, { status: 401 });

  const dotaz = new URL(request.url).searchParams.get("q")?.trim() ?? "";
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
