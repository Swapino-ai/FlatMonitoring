/**
 * Nocni sken najemniho trhu.
 *
 * Na rozdil od mesicniho skenu prodejnich cen bezi kazdou noc: najemne
 * reaguje na sezonu i na zmenu nabidky ve ctvrti radove rychleji nez
 * prodejni cena. Do historie se ale zapise jen kdyz se odhad skutecne
 * zmeni — viz odhadniNajemPriZmene().
 *
 * Spousti se z GitHub Actions (.github/workflows/rent-scan.yml), protoze
 * Sreality odmita dotazy z datovych center a Vercel ma casovy limit.
 */
import { PrismaClient } from "@prisma/client";
import { runScan, odhadniNajemPriZmene } from "../src/lib/market";
import { NEMOVITOST_MAP, nazevNemovitosti } from "../src/lib/catalogs";
import { doplnPolohu } from "../src/lib/geokodovani";
import { uklidDenik, ukonciBeh, zacniBeh } from "../src/lib/scanLog";

const prisma = new PrismaClient();

async function main() {
  const started = new Date();
  console.log(`[${started.toISOString()}] Noční sken nájemního trhu`);

  const properties = await prisma.property.findMany({ where: { status: { not: "SOLD" } } });
  const skenovatelne = properties.filter((p) => NEMOVITOST_MAP.get(p.type)?.srealityCesta);
  if (skenovatelne.length === 0) {
    console.log("Žádná nemovitost ke skenování. Končím.");
    return;
  }

  // Jeden dotaz na kombinaci mesto+dispozice — portaly zbytecne nezatezujeme
  // Kraj a souradnice u nemovitosti, kterym chybi — bez kraje neni zaloha
  // pro obce bez vlastniho vypisu z ceho vyjit
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

  const dotazy = new Map<string, { city: string; district: string | null; disposition: string | null; areaM2: number; type: string; region: string | null }>();
  for (const p of skenovatelne) {
    // Typ musi byt v klici — garaz a byt v jednom meste nejsou tentyz dotaz
    dotazy.set(`${p.type}|${p.city}|${p.disposition}`, {
      city: p.city, district: p.district, disposition: p.disposition, areaM2: p.areaM2, type: p.type, region: p.region,
    });
  }

  let ok = 0;
  let failed = 0;
  for (const q of dotazy.values()) {
    const results = await runScan({
      city: q.city,
      district: q.district ?? undefined,
      disposition: q.disposition ?? undefined,
      areaM2: q.areaM2,
      category: q.type,
      region: q.region ?? undefined,
      dealType: "RENT",
    });
    for (const r of results) {
      console.log(`  ${nazevNemovitosti(q.type)} ${q.city} ${q.disposition ?? ""} · ${r.source}: ${r.status} (${r.count})${r.message ? " — " + r.message : ""}`);
      r.status === "FAILED" ? failed++ : ok++;
    }
  }

  console.log("\nOdhady nájmu:");
  for (const p of skenovatelne) {
    const beh = await zacniBeh({
      trigger: "CRON_NAJEM", dealType: "RENT", propertyId: p.id,
      propertyName: p.name, city: p.city, category: p.type,
    });
    try {
      const v = await odhadniNajemPriZmene(p.id);
      if (!v) {
        console.log(`  ${p.name}: málo srovnatelných nabídek, odhad nevznikl`);
        await ukonciBeh(beh, { status: "PRAZDNY", result: "málo srovnatelných nabídek, odhad nevznikl" });
        continue;
      }
      const castka = v.monthlyRent.toLocaleString("cs-CZ");
      const text = v.zapsano
        ? `${castka} Kč/měs zapsáno (${v.duvod})`
        : `${castka} Kč/měs — nezapsáno (${v.duvod})`;
      console.log(`  ${p.name}: ${text}, ${v.stats.count} nabídek`);
      await ukonciBeh(beh, {
        status: "OK", listingsFound: v.stats.count,
        okruhKm: v.stats.okruhKm, result: text,
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
  if (ok === 0 && failed > 0) process.exitCode = 1;
}

main()
  .catch((e) => { console.error("Sken nájmů selhal:", e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
