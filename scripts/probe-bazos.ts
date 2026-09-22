/**
 * Sonda Bazose — jestli z nej jdou vytahnout nabidky pronajmu.
 *
 * Bazos nema strukturovana data v __NEXT_DATA__ jako Sreality; je to stare
 * serverem vykreslene HTML. Otazka tedy neni "kde lezi JSON", ale jestli
 * vubec pusti nas dotaz a v jakem tvaru inzeraty v HTML jsou.
 *
 * Nic nemeni, jen cte a vypisuje.
 */
import { HLAVICKY_PROHLIZECE } from "../src/lib/market/util";

const ADRESY = [
  // Ruzne tvary cesty — puvodni odhad vratil 404, hledame ten spravny
  "https://reality.bazos.cz/",
  "https://reality.bazos.cz/pronajmu/",
  "https://reality.bazos.cz/pronajem/",
  "https://reality.bazos.cz/pronajmu/byt/",
  "https://reality.bazos.cz/pronajmu/byt/praha/",
  // Fulltextove hledani s lokalitou podle PSC a okruhu v km
  "https://reality.bazos.cz/search.php?hledat=byt&rubriky=reality&hlokalita=11000&humkreis=25&cenaod=&cenado=",
  "https://reality.bazos.cz/pronajmu/?hledat=byt&hlokalita=11000&humkreis=25",
  // RSS by bylo nejcistsi, kdyby existovalo
  "https://reality.bazos.cz/rss.php?rubriky=reality&hledat=byt&hlokalita=11000&humkreis=25",
];

async function stahni(url: string) {
  const start = Date.now();
  const r = await fetch(url, { headers: HLAVICKY_PROHLIZECE, redirect: "follow" });
  const text = await r.text();
  return { r, text, ms: Date.now() - start };
}

function shrnHtml(html: string) {
  // Inzeratove radky Bazose historicky nesou tridu .inzeraty / .inzeratynadpis
  const inzeraty = (html.match(/class="inzerat/g) ?? []).length;
  const nadpisy = (html.match(/class="inzeratynadpis"/g) ?? []).length;
  const ceny = (html.match(/class="inzeratycena"/g) ?? []).length;
  const lokality = (html.match(/class="inzeratylok"/g) ?? []).length;
  // Odkazy na detail inzeratu: /inzerat/<id>/<slug>.php
  const odkazy = new Set(html.match(/\/inzerat\/\d+\/[^"']+/g) ?? []);
  const kc = (html.match(/\d[\d\s ]*Kč/g) ?? []).length;
  console.log(`    .inzerat*: ${inzeraty} · nadpisy: ${nadpisy} · ceny: ${ceny} · lokality: ${lokality}`);
  console.log(`    odkazy na detail: ${odkazy.size} · výskytů "Kč": ${kc}`);

  if (nadpisy > 0 || odkazy.size > 0) {
    // Vypis prvni tri inzeraty, at je videt, co presne se da precist
    const bloky = html.split(/<div class="inzeraty inzeratyflex">/).slice(1, 4);
    for (const b of bloky) {
      const nadpis = b.match(/<h2 class="nadpis">\s*<a[^>]*href="([^"]+)"[^>]*>([^<]+)</);
      const cena = b.match(/class="inzeratycena"[^>]*>\s*<b>([^<]+)</) ?? b.match(/class="inzeratycena"[^>]*>([^<]+)</);
      const lok = b.match(/class="inzeratylok"[^>]*>([\s\S]*?)<\/div>/);
      console.log(`      · ${nadpis?.[2]?.trim() ?? "?"}`);
      console.log(`        cena: ${cena?.[1]?.trim() ?? "?"} | lokalita: ${lok?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ?? "?"}`);
      console.log(`        url: ${nadpis?.[1] ?? "?"}`);
    }
    if (bloky.length === 0) {
      // Trida kontejneru se zmenila — ukaz okoli prvniho odkazu, at je z ceho vyjit
      const i = html.search(/\/inzerat\/\d+\//);
      if (i > 0) console.log(`    okolí prvního odkazu:\n${html.slice(Math.max(0, i - 600), i + 600).replace(/\s+/g, " ")}`);
    }
  }

  if (html.includes("<item>")) {
    const items = (html.match(/<item>/g) ?? []).length;
    console.log(`    RSS: ${items} položek`);
    const prvni = html.match(/<item>[\s\S]*?<\/item>/);
    if (prvni) console.log(`    první položka: ${prvni[0].slice(0, 500)}`);
  }
}

async function main() {
  console.log(`Sonda Bazoše — ${new Date().toISOString()}\n${"=".repeat(74)}\n`);

  // Slusnost predevsim: co nam robots.txt vubec dovoluje
  try {
    const { r, text } = await stahni("https://www.bazos.cz/robots.txt");
    console.log(`### robots.txt — HTTP ${r.status}`);
    console.log(text.slice(0, 800).split("\n").map((l) => "    " + l).join("\n"));
  } catch (e) {
    console.log(`### robots.txt — selhalo: ${(e as Error).message}`);
  }
  console.log();

  for (const url of ADRESY) {
    console.log(`### ${url}`);
    try {
      const { r, text, ms } = await stahni(url);
      console.log(`    HTTP ${r.status} (${ms} ms, ${Math.round(text.length / 1024)} kB)`);
      if (r.url !== url) console.log(`    přesměrováno: ${r.url}`);
      if (r.ok) shrnHtml(text);
    } catch (e) {
      console.log(`    selhalo: ${(e as Error).message}`);
    }
    console.log();
    await new Promise((s) => setTimeout(s, 2000)); // portal zbytecne nezatezujeme
  }

  console.log("=".repeat(74));
  console.log("Sonda dokončena.");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
