/**
 * Nocni sken trhu — jediny, ktery aplikace ma.
 *
 * Projde vsechny nemovitosti, stahne prodejni i najemni nabidky, precenit
 * a odhadne najem. Bezi kazdou noc; do historie se ale zapisuje jen zmena,
 * takze denni beh nevyrobi 365 skoro shodnych radku za rok.
 *
 * Spousti se z GitHub Actions (.github/workflows/nocni-sken.yml) — Sreality
 * odmitaji dotazy z datovych center a Vercel ma casovy limit.
 */
import { PrismaClient } from "@prisma/client";
import { odhadniNajemPriZmene, runScan, valuateFromMarket } from "../src/lib/market";
import { NEMOVITOST_MAP, nazevNemovitosti } from "../src/lib/catalogs";
import { doplnPolohu } from "../src/lib/geokodovani";
import { uklidDenik, ukonciBeh, zacniBeh } from "../src/lib/scanLog";

const prisma = new PrismaClient();

async function main() {
  const zacatek = new Date();
  console.log(`[${zacatek.toISOString()}] Noční sken trhu`);

  const vsechny = await prisma.property.findMany({ where: { status: { not: "SOLD" } } });
  const skenovatelne = vsechny.filter((p) => NEMOVITOST_MAP.get(p.type)?.srealityCesta);

  console.log(`${vsechny.length} nemovitostí, z toho ${skenovatelne.length} se skenuje.`);
  if (skenovatelne.length === 0) return;

  // Kraj a souradnice u tech, kterym chybi — bez kraje neni zaloha pro obce
  // bez vlastniho vypisu z ceho vyjit
  for (const p of skenovatelne) {
    if (p.region && p.latitude != null) continue;
    const n = await doplnPolohu(p.id);
    if (n?.region) {
      p.region = n.region;
      p.latitude = n.latitude;
      p.longitude = n.longitude;
      console.log(`  ${p.name}: doplněn kraj ${n.region}`);
    }
  }

  // Jeden dotaz na kombinaci typ + mesto + dispozice — portaly zbytecne
  // nezatezujeme tim, ze bychom se na totez ptali u kazde nemovitosti znovu
  const dotazy = new Map<string, typeof skenovatelne[number]>();
  for (const p of skenovatelne) dotazy.set(`${p.type}|${p.city}|${p.disposition}`, p);

  console.log(`\nStahuji trh (${dotazy.size} kombinací × prodej i pronájem):`);
  let ok = 0;
  let selhalo = 0;

  for (const q of dotazy.values()) {
    for (const dealType of ["SALE", "RENT"] as const) {
      const results = await runScan({
        city: q.city,
        district: q.district ?? undefined,
        disposition: q.disposition ?? undefined,
        areaM2: q.areaM2,
        category: q.type,
        region: q.region ?? undefined,
        dealType,
      });
      for (const r of results) {
        const popis = `${nazevNemovitosti(q.type)} ${q.city} ${q.disposition ?? ""} ${dealType === "SALE" ? "prodej" : "pronájem"}`;
        console.log(`  ${popis.padEnd(42)} ${r.status} (${r.count})${r.message ? " — " + r.message : ""}`);
        r.status === "FAILED" ? selhalo++ : ok++;
      }
    }
  }

  console.log(`\nPřeceňuji a odhaduji nájmy:`);
  for (const p of skenovatelne) {
    // Prodejni cena a najem jsou dva ruzne vysledky, proto i dva zaznamy
    // v deniku — jinak by nebylo poznat, ktery z nich selhal
    for (const dealType of ["SALE", "RENT"] as const) {
      const beh = await zacniBeh({
        trigger: "CRON_NOCNI", dealType, propertyId: p.id,
        propertyName: p.name, city: p.city, category: p.type,
      });
      try {
        const v = dealType === "SALE"
          ? await valuateFromMarket(p.id)
          : await odhadniNajemPriZmene(p.id);

        if (!v) {
          const duvod = "málo srovnatelných nabídek, odhad nevznikl";
          console.log(`  ${p.name} ${dealType === "SALE" ? "cena" : "nájem"}: ${duvod}`);
          await ukonciBeh(beh, { status: "PRAZDNY", result: duvod });
          continue;
        }

        const castka = "value" in v
          ? `${v.value.toLocaleString("cs-CZ")} Kč`
          : `${v.monthlyRent.toLocaleString("cs-CZ")} Kč/měs`;
        const text = v.zapsano ? `${castka} zapsáno (${v.duvod})` : `${castka} — beze změny (${v.duvod})`;
        console.log(`  ${p.name} ${dealType === "SALE" ? "cena " : "nájem"}: ${text}, ${v.stats.count} nabídek`);
        await ukonciBeh(beh, {
          status: "OK", listingsFound: v.stats.count,
          okruhKm: v.stats.okruhKm, result: text,
        });
      } catch (e) {
        const zprava = e instanceof Error ? e.message : String(e);
        console.log(`  ${p.name} ${dealType}: selhalo — ${zprava}`);
        await ukonciBeh(beh, { status: "SELHALO", message: zprava });
        selhalo++;
      }
    }
  }

  const smazano = await uklidDenik();
  if (smazano > 0) console.log(`\nZ deníku odklizeno ${smazano} záznamů starších 90 dnů.`);

  const s = ((Date.now() - zacatek.getTime()) / 1000).toFixed(0);
  console.log(`\nHotovo za ${s} s — ${ok} úspěšných dotazů, ${selhalo} selhalo.`);

  // Nenulovy exit kod jen kdyz selhalo uplne vsechno — jedna nefunkcni obec
  // nema shodit cely beh
  if (ok === 0 && selhalo > 0) process.exitCode = 1;
}

main()
  .catch((e) => { console.error("Noční sken selhal:", e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
