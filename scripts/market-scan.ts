/**
 * Mesicni sken trhu — spousti se cronem, ne z prohlizece.
 *
 * Priklad crontab (1. den v mesici ve 4:00):
 *   0 4 1 * * cd /cesta/k/flatmonitoring && /usr/bin/npm run market:scan >> logs/market.log 2>&1
 */
import { PrismaClient } from "@prisma/client";
import { runScan, valuateFromMarket } from "../src/lib/market";
import { NEMOVITOST_MAP, nazevNemovitosti } from "../src/lib/catalogs";
import { doplnPolohu } from "../src/lib/geokodovani";
import { uklidDenik, ukonciBeh, zacniBeh } from "../src/lib/scanLog";

const prisma = new PrismaClient();

async function main() {
  const started = new Date();
  console.log(`[${started.toISOString()}] Spouštím sken trhu`);

  const properties = await prisma.property.findMany({ where: { status: { not: "SOLD" } } });
  if (properties.length === 0) {
    console.log("Žádné nemovitosti k ocenění. Končím.");
    return;
  }

  // Jeden dotaz na kombinaci mesto+dispozice — nechceme portaly zbytecne zatezovat
  // Kraj a souradnice u nemovitosti, kterym chybi — bez kraje neni zaloha
  // pro obce bez vlastniho vypisu z ceho vyjit
  for (const p of properties) {
    if (p.region && p.latitude != null) continue;
    const n = await doplnPolohu(p.id);
    if (n?.region) {
      p.region = n.region;
      p.latitude = n.latitude;
      p.longitude = n.longitude;
      console.log(`  ${p.name}: doplněn kraj ${n.region}`);
    }
  }

  const queries = new Map<string, { city: string; district: string | null; disposition: string | null; areaM2: number; type: string; region: string | null }>();
  for (const p of properties) {
    if (!NEMOVITOST_MAP.get(p.type)?.srealityCesta) continue;
    // Typ musi byt v klici — garaz a byt v jednom meste nejsou tentyz dotaz
    queries.set(`${p.type}|${p.city}|${p.disposition}`, {
      city: p.city, district: p.district, disposition: p.disposition, areaM2: p.areaM2, type: p.type, region: p.region,
    });
  }

  let ok = 0;
  let failed = 0;

  for (const q of queries.values()) {
    for (const dealType of ["SALE", "RENT"] as const) {
      const results = await runScan({
        city: q.city, district: q.district ?? undefined,
        disposition: q.disposition ?? undefined, areaM2: q.areaM2,
        category: q.type, region: q.region ?? undefined, dealType,
      });
      for (const r of results) {
        console.log(`  ${nazevNemovitosti(q.type)} ${q.city} ${q.disposition ?? ""} ${dealType} · ${r.source}: ${r.status} (${r.count})${r.message ? " — " + r.message : ""}`);
        r.status === "FAILED" ? failed++ : ok++;
      }
    }
  }

  console.log(`\nPřeceňuji nemovitosti:`);
  for (const p of properties) {
    const beh = await zacniBeh({
      trigger: "CRON_TRH", dealType: "SALE", propertyId: p.id,
      propertyName: p.name, city: p.city, category: p.type,
    });
    try {
      const v = await valuateFromMarket(p.id);
      if (!v) {
        console.log(`  ${p.name}: málo srovnatelných nabídek, hodnota beze změny`);
        await ukonciBeh(beh, { status: "PRAZDNY", result: "málo srovnatelných nabídek, hodnota beze změny" });
        continue;
      }
      const text = `${v.value.toLocaleString("cs-CZ")} Kč`;
      console.log(`  ${p.name}: ${text} (z ${v.stats.count} nabídek)`);
      await ukonciBeh(beh, {
        status: "OK", listingsFound: v.stats.count,
        okruhKm: v.stats.okruhKm, result: `nová hodnota ${text}`,
      });
    } catch (e) {
      const zprava = e instanceof Error ? e.message : String(e);
      console.log(`  ${p.name}: selhalo — ${zprava}`);
      await ukonciBeh(beh, { status: "SELHALO", message: zprava });
      failed++;
    }
  }

  const smazano = await uklidDenik();
  if (smazano > 0) console.log(`\nZ deníku odklizeno ${smazano} záznamů starších 90 dnů.`);

  const seconds = ((Date.now() - started.getTime()) / 1000).toFixed(0);
  console.log(`\nHotovo za ${seconds} s — ${ok} úspěšných dotazů, ${failed} selhalo.`);

  // Nenulovy exit kod, kdyz selhalo uplne vsechno — cron to pak nahlasi
  if (ok === 0 && failed > 0) process.exitCode = 1;
}

main()
  .catch((e) => { console.error("Sken selhal:", e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
