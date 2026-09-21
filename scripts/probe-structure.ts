/**
 * Druha faze diagnostiky: vypise strukturu __NEXT_DATA__ na strankach portalu,
 * aby slo napsat parser proti skutecnemu tvaru dat, ne proti domnence.
 *
 * Hleda pole objektu, ktera vypadaji jako inzeraty, a vypise jejich cestu,
 * klice a jeden vzorek.
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const STRANKY = [
  { nazev: "SREALITY prodej bytu Praha", url: "https://www.sreality.cz/hledani/prodej/byty/praha" },
  { nazev: "SREALITY pronajem bytu Praha", url: "https://www.sreality.cz/hledani/pronajem/byty/praha" },
  { nazev: "BEZREALITKY prodej bytu Praha", url: "https://www.bezrealitky.cz/vyhledat?offerType=PRODEJ&estateType=BYT&location=Praha" },
];

/** Vypada zaznam jako inzerat? */
function jeInzerat(o: unknown): boolean {
  if (!o || typeof o !== "object" || Array.isArray(o)) return false;
  const k = Object.keys(o as object).map((x) => x.toLowerCase());
  const maCenu = k.some((x) => x.includes("price") || x.includes("cena"));
  const maDalsi = k.some((x) =>
    ["name", "title", "locality", "surface", "area", "uri", "hash_id", "id", "imagealt"].includes(x),
  );
  return maCenu && maDalsi;
}

interface Nalez { cesta: string; pocet: number; klice: string[]; vzorek: unknown }

function projdi(uzel: unknown, cesta: string, nalezy: Nalez[], hloubka = 0) {
  if (hloubka > 14 || uzel == null || typeof uzel !== "object") return;

  if (Array.isArray(uzel)) {
    if (uzel.length > 0 && jeInzerat(uzel[0])) {
      nalezy.push({
        cesta,
        pocet: uzel.length,
        klice: Object.keys(uzel[0] as object),
        vzorek: uzel[0],
      });
      return; // hloubeji uz nelezeme
    }
    uzel.slice(0, 6).forEach((v, i) => projdi(v, `${cesta}[${i}]`, nalezy, hloubka + 1));
    return;
  }

  for (const [k, v] of Object.entries(uzel as Record<string, unknown>)) {
    projdi(v, cesta ? `${cesta}.${k}` : k, nalezy, hloubka + 1);
  }
}

/** Zkratime vzorek, at je log citelny. */
function zkrat(o: unknown): string {
  const s = JSON.stringify(o, (_k, v) => (typeof v === "string" && v.length > 90 ? v.slice(0, 90) + "…" : v), 1);
  return s.length > 1800 ? s.slice(0, 1800) + "\n      …" : s;
}

async function main() {
  for (const s of STRANKY) {
    console.log("\n" + "=".repeat(74));
    console.log(`### ${s.nazev}`);
    console.log(s.url);

    try {
      const res = await fetch(s.url, {
        headers: { "User-Agent": UA, "Accept-Language": "cs-CZ,cs;q=0.9" },
      });
      const html = await res.text();
      console.log(`HTTP ${res.status}, ${html.length} B`);

      const m = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
      if (!m) {
        console.log("__NEXT_DATA__ nenalezeno.");
        // zkusime jestli nejsou data v jinem inline skriptu
        const kandidati = [...html.matchAll(/<script[^>]*>([\s\S]{200,}?)<\/script>/g)]
          .map((x) => x[1].trim())
          .filter((x) => x.startsWith("{") || x.includes("self.__next_f"));
        console.log(`jinych datovych skriptu: ${kandidati.length}`);
        continue;
      }

      const data = JSON.parse(m[1]);
      console.log(`__NEXT_DATA__ naparsovano (${m[1].length} B)`);
      console.log(`korenove klice: ${Object.keys(data).join(", ")}`);
      if (data.props?.pageProps) {
        console.log(`props.pageProps klice: ${Object.keys(data.props.pageProps).join(", ")}`);
      }

      const nalezy: Nalez[] = [];
      projdi(data, "", nalezy);

      if (nalezy.length === 0) {
        console.log("ŽÁDNÉ pole vypadající jako inzeráty nenalezeno.");
      } else {
        for (const n of nalezy.slice(0, 3)) {
          console.log(`\n  NALEZENO: ${n.cesta}  (${n.pocet} položek)`);
          console.log(`  klíče: ${n.klice.join(", ")}`);
          console.log(`  vzorek: ${zkrat(n.vzorek)}`);
        }
      }
    } catch (e) {
      console.log(`VYJIMKA: ${e instanceof Error ? e.message : String(e)}`);
    }

    await new Promise((r) => setTimeout(r, 2000));
  }
}

main();
