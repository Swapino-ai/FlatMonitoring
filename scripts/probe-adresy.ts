/**
 * Ktery zdroj ceskych adres se hodi na naseptavac.
 *
 * Zkousime na skutecnych dotazech, jak by je clovek psal — vcetne
 * nedopsanych a bez diakritiky. Zajima nas, jestli vysledek nese rozdelene
 * pole (ulice, mesto, PSC, mestska cast), protoze o to nam jde: uzivatel
 * napise jeden radek, formular se vyplni sam.
 *
 * Nic nemeni, jen cte.
 */
const DOTAZY = [
  "Korunní 15, Praha",
  "korunni 15 praha",          // bez diakritiky, jak se realne pise
  "Osadní 12, Praha 7",
  "Dlouhá 3, Litoměřice",
  "Masarykova 5, Brno",
  "Korunní",                    // nedopsany dotaz
];

const UA = "FlatMonitoring/1.0 (osobni evidence nemovitosti)";

async function nominatim(dotaz: string) {
  const url = "https://nominatim.openstreetmap.org/search?"
    + new URLSearchParams({
      q: dotaz, countrycodes: "cz", format: "jsonv2",
      addressdetails: "1", limit: "5", "accept-language": "cs",
    });
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!r.ok) return { ok: false, stav: r.status, polozky: [] as any[] };
  return { ok: true, stav: r.status, polozky: (await r.json()) as any[] };
}

async function mapy(dotaz: string) {
  // Bez klice — zajima nas prave to, jestli klic vyzaduje
  const url = "https://api.mapy.cz/v1/suggest?"
    + new URLSearchParams({ query: dotaz, lang: "cs", limit: "5" });
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  const text = await r.text();
  return { stav: r.status, ukazka: text.slice(0, 200) };
}

async function main() {
  console.log(`Sonda zdrojů adres — ${new Date().toISOString()}\n${"=".repeat(74)}\n`);

  console.log("### Mapy.cz — vyžaduje klíč?");
  try {
    const m = await mapy("Korunní 15, Praha");
    console.log(`    HTTP ${m.stav}`);
    console.log(`    ${m.ukazka}`);
  } catch (e) {
    console.log(`    selhalo: ${(e as Error).message}`);
  }
  console.log();

  console.log("### Nominatim (OpenStreetMap)\n");
  for (const d of DOTAZY) {
    console.log(`  "${d}"`);
    try {
      const { ok, stav, polozky } = await nominatim(d);
      if (!ok) { console.log(`    HTTP ${stav}`); continue; }
      if (polozky.length === 0) { console.log("    nic nenalezeno"); }
      for (const p of polozky.slice(0, 3)) {
        const a = p.address ?? {};
        // Presne ta pole, ktera formular potrebuje
        const ulice = [a.road, a.house_number].filter(Boolean).join(" ");
        const mesto = a.city ?? a.town ?? a.village ?? a.municipality ?? "—";
        const cast = a.suburb ?? a.city_district ?? a.borough ?? "—";
        console.log(`    · ulice="${ulice || "—"}" | město="${mesto}" | PSČ="${a.postcode ?? "—"}" | část="${cast}"`);
      }
    } catch (e) {
      console.log(`    selhalo: ${(e as Error).message}`);
    }
    // Pravidla Nominatimu: nejvys jeden dotaz za sekundu
    await new Promise((s) => setTimeout(s, 1200));
    console.log();
  }

  console.log("=".repeat(74));
  console.log("Sonda dokončena.");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
