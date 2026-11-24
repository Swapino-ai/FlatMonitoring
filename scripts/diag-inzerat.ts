/**
 * Diagnostika: proc se inzerat (nebo inzeraty stejne dispozice v obci) nenavrhl k nemovitosti.
 * Jen cte. Nastaveni: INZERAT (externalId, vychozi 4030951500), NEMOVITOST (cast nazvu).
 */
import { PrismaClient } from "@prisma/client";
import { ohodnot, cenaVJednotce, jednotkaOdhadu } from "../src/lib/market/zarazeni";
import { okruhNemovitosti } from "../src/lib/market/inzeraty";
import { profilTypu } from "../src/lib/market/profily";

const prisma = new PrismaClient();
const EXT = process.env.INZERAT || "4030951500";
const NAZEV = (process.env.NEMOVITOST || "Topolčianská 1").toLowerCase();

async function main() {
  const nemovitosti = (await prisma.property.findMany()).filter((p) => p.name.toLowerCase().includes(NAZEV));
  console.log(`Nemovitosti „${NAZEV}“: ${nemovitosti.map((p) => `${p.name} (${p.disposition}, ${p.areaM2} m², ${p.city}, poloha ${p.latitude != null ? "ano" : "NE"}, sledovat trh ${p.sledovatTrh}, oceňuje se podle ${p.oceneniPodle ?? "-"})`).join("; ") || "žádná"}`);
  const i = await prisma.inzerat.findFirst({ where: { externalId: EXT } });
  if (!i) {
    console.log(`Inzerát ${EXT} v databázi NENÍ — žádný sken ho nestáhl.`);
  } else {
    console.log(`Inzerát ${EXT}: ${i.dealType} ${i.category} ${i.disposition} ${i.areaM2} m², ${i.city}/${i.district}, cena ${i.price}, poloha ${i.latitude},${i.longitude}, poprvé ${i.firstSeenAt.toISOString().slice(0, 10)}, naposledy ${i.lastSeenAt.toISOString().slice(0, 10)}, zmizel ${i.zmizelAt?.toISOString().slice(0, 10) ?? "-"}`);
    for (const z of await prisma.zarazeniInzeratu.findMany({ where: { inzeratId: i.id }, include: { property: { select: { name: true } } } })) {
      console.log(`  u nemovitosti ${z.property.name}: ${z.stav} (${z.duvod ?? ""})`);
    }
  }
  for (const p of nemovitosti) {
    const { zaklad, max } = okruhNemovitosti(p);
    const profil = profilTypu(p.type);
    const nem = { areaM2: p.areaM2, disposition: p.disposition, latitude: p.latitude, longitude: p.longitude, city: p.city, okruhKm: zaklad, maxKm: max, tolerancePlochy: profil.tolerancePlochy, stejnaDispozice: profil.stejnaDispozice };
    console.log(`\n${p.name}: okruh ${zaklad}–${max} km, tolerance plochy ${profil.tolerancePlochy * 100} %, vyloučené obce: ${p.excludedCities || "-"}`);
    if (i) {
      const { zaKus } = jednotkaOdhadu(p.type, p.areaM2);
      const h = ohodnot(nem, { ...i, pricePerM2: cenaVJednotce(i, zaKus) }, null);
      console.log(`  hodnocení inzerátu ${EXT}: ${h.mimo ? "MIMO — " : ""}${h.duvod} (skóre ${h.skore})`);
      console.log(`  kandidát? kategorie ${i.category === p.type ? "ano" : `NE (${i.category} vs ${p.type})`}, obec ${i.city.toLowerCase() === p.city.toLowerCase() ? "stejná" : "jiná"}, poloha ${i.latitude != null ? "ano" : "ne"}`);
    }
    // Prehled: inzeraty srovnatelne dispozice v databazi a jak dopadly
    const vsechny = await prisma.inzerat.findMany({ where: { category: p.type, dealType: "SALE", disposition: { in: ["1+1", "2+kk"] }, zmizelAt: null } });
    const zname = new Set((await prisma.zarazeniInzeratu.findMany({ where: { propertyId: p.id }, select: { inzeratId: true } })).map((z) => z.inzeratId));
    const souhrn = new Map<string, number>();
    for (const x of vsechny) {
      const k = zname.has(x.id) ? "už známé" : (() => { const h = ohodnot(nem, { ...x, pricePerM2: x.pricePerM2 }, null); return h.mimo ? `mimo: ${h.duvod.replace(/[\d,]+/g, "#")}` : "navrhl by se"; })();
      souhrn.set(k, (souhrn.get(k) ?? 0) + 1);
    }
    console.log(`  prodej 1+1 / 2+kk v databázi (živé): ${vsechny.length}`);
    for (const [k, n] of souhrn) console.log(`    ${n}× ${k}`);
  }
}
main().finally(() => prisma.$disconnect());
