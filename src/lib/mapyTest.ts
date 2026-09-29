"use server";

import { getSession } from "./auth";

export interface VysledekTestu {
  nazev: string;
  ok: boolean;
  detail: string;
}

/**
 * Zivy test klice k Mapy.cz. Pritomnost promenne nic nerika — klic muze byt
 * opsany s chybou, zruseny nebo mit vycerpany limit. Proto se opravdu zavola
 * obe sluzby, ktere aplikace pouziva: naseptavac a mapove dlazdice.
 */
export async function otestujMapy(): Promise<VysledekTestu[]> {
  const user = await getSession();
  if (!user || user.role !== "OWNER") {
    return [{ nazev: "Oprávnění", ok: false, detail: "Test může spustit jen majitel." }];
  }

  const klic = process.env.MAPY_API_KEY;
  if (!klic) {
    return [{
      nazev: "MAPY_API_KEY",
      ok: false,
      detail: "Klíč není nastavený v tomhle prostředí. Doplň ho ve Vercelu a nasaď znovu.",
    }];
  }

  return [await testNaseptavac(klic), await testDlazdice(klic)];
}

async function testNaseptavac(klic: string): Promise<VysledekTestu> {
  const url = "https://api.mapy.cz/v1/suggest?" + new URLSearchParams({
    query: "Korunní 15 Praha", lang: "cs", limit: "1",
    type: "regional.address", locality: "cz", apikey: klic,
  });

  try {
    const r = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
    if (r.status === 401 || r.status === 403) {
      return { nazev: "Našeptávač adres", ok: false, detail: `Klíč odmítnut (HTTP ${r.status}). Zkontroluj, že je opsaný celý.` };
    }
    if (r.status === 429) {
      return { nazev: "Našeptávač adres", ok: false, detail: "Vyčerpaný limit dotazů (HTTP 429). Klíč je platný, jen se musí počkat." };
    }
    if (!r.ok) return { nazev: "Našeptávač adres", ok: false, detail: `Mapy.cz vrátily HTTP ${r.status}.` };

    const data = (await r.json()) as { items?: { name?: string; location?: string }[] };
    const prvni = data.items?.[0];
    if (!prvni) return { nazev: "Našeptávač adres", ok: false, detail: "Odpověď přišla, ale bez návrhů — to je podezřelé." };

    return {
      nazev: "Našeptávač adres",
      ok: true,
      detail: `Na dotaz „Korunní 15 Praha“ vrátil: ${[prvni.name, prvni.location].filter(Boolean).join(", ")}`,
    };
  } catch {
    return { nazev: "Našeptávač adres", ok: false, detail: "Na Mapy.cz se nepodařilo připojit." };
  }
}

async function testDlazdice(klic: string): Promise<VysledekTestu> {
  // Dlazdice celych Cech v nejmensim priblizeni — staci na overeni, ze klic
  // ma pravo i na mapy, ne jen na geokodovani
  const url = `https://api.mapy.cz/v1/maptiles/basic/256/8/138/86?apikey=${encodeURIComponent(klic)}`;

  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) {
      return {
        nazev: "Mapové dlaždice",
        ok: false,
        detail: `HTTP ${r.status}. Klíč nemusí mít povolené mapové podklady — zkontroluj projekt na developer.mapy.cz.`,
      };
    }
    const velikost = (await r.arrayBuffer()).byteLength;
    if (velikost < 100) return { nazev: "Mapové dlaždice", ok: false, detail: "Přišel prázdný obrázek." };

    return { nazev: "Mapové dlaždice", ok: true, detail: `Dlaždice se načetla (${Math.round(velikost / 1024)} kB).` };
  } catch {
    return { nazev: "Mapové dlaždice", ok: false, detail: "Na Mapy.cz se nepodařilo připojit." };
  }
}
