/**
 * Dve otazky naraz:
 *
 * 1. Prijima kraj i jine kategorie nez byty? Overeny byl jen /byty/ustecky-kraj,
 *    ale sken zkousi i /garaze/ustecky-kraj.
 * 2. Neomezuje Sreality cetnost? V logu uzivatele tentyz tvar adresy jednou
 *    projde a o par radku niz vraci 404.
 *
 * Pouzivame primo nactiStranku, tedy tutez cestu jako scraper. Vlastni fetch
 * s rucnim presmerovanim tu uz dvakrat zmeril jen SSO odskok Seznamu (302)
 * a nerozlisil platnou adresu od neplatne.
 *
 * Nic nemeni, jen cte.
 */
import { nactiStranku } from "../src/lib/market/util";

function pocetVysledku(uzel: unknown, hloubka = 0): number {
  if (hloubka > 12 || uzel == null || typeof uzel !== "object") return 0;
  if (Array.isArray(uzel)) {
    if (uzel.length >= 3 && uzel.every((x) => x && typeof x === "object" && "priceCzk" in (x as object))) return uzel.length;
    for (const v of uzel.slice(0, 6)) { const n = pocetVysledku(v, hloubka + 1); if (n) return n; }
    return 0;
  }
  for (const v of Object.values(uzel as Record<string, unknown>)) {
    const n = pocetVysledku(v, hloubka + 1); if (n) return n;
  }
  return 0;
}

async function zkus(url: string): Promise<{ ok: boolean; popis: string }> {
  try {
    const { data } = await nactiStranku(url);
    const n = pocetVysledku(data);
    return { ok: n > 0, popis: `${n} nabídek` };
  } catch (e) {
    return { ok: false, popis: (e as Error).message.slice(0, 50) };
  }
}

async function main() {
  console.log(`Kraj × kategorie a četnost — ${new Date().toISOString()}\n${"=".repeat(74)}\n`);

  console.log("### Kraj s různými kategoriemi (mezi dotazy 2 s)");
  const nefunkcni: string[] = [];
  for (const cesta of ["byty", "garaze", "garazova-stani", "domy", "komercni/sklady", "komercni/kancelare", "komercni/obchodni-prostory", "pozemky"]) {
    for (const typ of ["prodej", "pronajem"]) {
      const r = await zkus(`https://www.sreality.cz/hledani/${typ}/${cesta}/ustecky-kraj`);
      if (!r.ok) nefunkcni.push(`${typ}/${cesta}`);
      console.log(`  ${r.ok ? "OK " : "!! "} ${typ}/${cesta} — ${r.popis}`);
      await new Promise((s) => setTimeout(s, 2000));
    }
  }

  console.log("\n### Osm dotazů hned po sobě, bez pauzy");
  // Kdyz zacnou selhavat az od nejakeho poradi, je to omezeni cetnosti
  let selhalo = 0;
  for (let i = 1; i <= 8; i++) {
    const r = await zkus("https://www.sreality.cz/hledani/prodej/byty/ustecky-kraj");
    if (!r.ok) selhalo++;
    console.log(`  ${i}. ${r.ok ? "OK " : "!! "} ${r.popis}`);
  }

  console.log(`\n${"=".repeat(74)}`);
  console.log(nefunkcni.length ? `Kraj nefunguje s: ${nefunkcni.join(", ")}` : "Kraj funguje se všemi zkoušenými kategoriemi.");
  console.log(selhalo ? `Rychlé dotazy: ${selhalo} z 8 selhalo — portál patrně omezuje četnost.` : "Rychlé dotazy: všech 8 prošlo, omezení četnosti se neprojevilo.");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
