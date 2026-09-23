/**
 * Mesicni sken trhu — spousti se cronem, ne z prohlizece.
 *
 * Priklad crontab (1. den v mesici ve 4:00):
 *   0 4 1 * * cd /cesta/k/flatmonitoring && /usr/bin/npm run market:scan >> logs/market.log 2>&1
 */
import { PrismaClient } from "@prisma/client";
import { runScan, valuateFromMarket } from "../src/lib/market";
import { NEMOVITOST_MAP, nazevNemovitosti } from "../src/lib/catalogs";

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
    const v = await valuateFromMarket(p.id);
    console.log(v
      ? `  ${p.name}: ${v.value.toLocaleString("cs-CZ")} Kč (z ${v.stats.count} nabídek)`
      : `  ${p.name}: málo srovnatelných nabídek, hodnota beze změny`);
  }

  const seconds = ((Date.now() - started.getTime()) / 1000).toFixed(0);
  console.log(`\nHotovo za ${seconds} s — ${ok} úspěšných dotazů, ${failed} selhalo.`);

  // Nenulovy exit kod, kdyz selhalo uplne vsechno — cron to pak nahlasi
  if (ok === 0 && failed > 0) process.exitCode = 1;
}

main()
  .catch((e) => { console.error("Sken selhal:", e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
