/**
 * Nocni sken trhu.
 *
 * Projde jen nemovitosti, ktere maji zapnute "Sledovat trh". Nabidky ze Sreality
 * ulozi do databaze trhu (kazdy inzerat jednou, s historii ceny), navrhne nove
 * k zarazeni a prepocita odhad JEN ze zarazenych inzeratu. Z nevybranych nabidek
 * nic neoceňuje.
 *
 * U zarazenych inzeratu navic overi, jestli jeste existuji, a porizuje jejich
 * screenshot (kdyz chybi nebo se zmenila cena).
 *
 * Spousti se z GitHub Actions (.github/workflows/nocni-sken.yml) — Sreality
 * odmitaji dotazy z datovych center a Vercel ma casovy limit.
 */
import { PrismaClient } from "@prisma/client";
import { NEMOVITOST_MAP } from "../src/lib/catalogs";
import { doplnPolohu } from "../src/lib/geokodovani";
import { uklidDenik } from "../src/lib/scanLog";
import { skenujNemovitost } from "../src/lib/market/sken";
import { aktualizujSkupinu } from "../src/lib/market/inzeraty";
import { presunSnimkyNaDisk } from "../src/lib/market/snimky";
import { HLAVICKY_PROHLIZECE, sleep } from "../src/lib/market/util";

const prisma = new PrismaClient();

/** Overi existenci zarazenych inzeratu a porizuje jejich screenshoty. */
async function zarazeneInzeraty() {
  const inzeraty = await prisma.inzerat.findMany({
    where: { zarazeni: { some: { stav: "ZARAZENO" } }, url: { not: null }, zmizelAt: null },
    include: { snimky: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (inzeraty.length === 0) return;

  let chromium: typeof import("playwright").chromium | null = null;
  try {
    chromium = (await import("playwright")).chromium;
  } catch {
    console.log("Playwright není k dispozici, screenshoty se přeskočí.");
  }
  const prohlizec = chromium ? await chromium.launch().catch((e) => { console.log("Prohlížeč nešel spustit:", e.message); return null; }) : null;
  const kontext = prohlizec ? await prohlizec.newContext({
    viewport: { width: 1280, height: 2000 }, locale: "cs-CZ", userAgent: HLAVICKY_PROHLIZECE["User-Agent"],
  }) : null;

  let snimku = 0;
  let zmizelo = 0;
  for (const i of inzeraty) {
    const potrebaSnimek = !i.snimky[0] || (i.snimky[0].price != null && Math.abs(i.snimky[0].price - i.price) >= 1);
    try {
      if (kontext && potrebaSnimek) {
        const stranka = await kontext.newPage();
        const odpoved = await stranka.goto(i.url!, { waitUntil: "domcontentloaded", timeout: 45_000 });
        const stav = odpoved?.status() ?? 0;
        if (stav === 404 || stav === 410 || !stranka.url().includes("/detail/")) {
          await prisma.inzerat.update({ where: { id: i.id }, data: { zmizelAt: new Date() } });
          zmizelo++;
        } else {
          // Souhlas s cookies (Seznam CMP) by jinak prekryl celou stranku
          await stranka.getByRole("button", { name: /souhlasím|přijmout vše|rozumím/i }).first().click({ timeout: 4000 }).catch(() => undefined);
          await stranka.waitForTimeout(2500);
          const data = await stranka.screenshot({ type: "jpeg", quality: 65 });
          await prisma.inzeratSnimek.create({ data: { inzeratId: i.id, price: i.price, data: new Uint8Array(data) } });
          snimku++;
        }
        await stranka.close();
      } else {
        // Bez prohlizece aspon overime, ze inzerat existuje
        const r = await fetch(i.url!, { headers: HLAVICKY_PROHLIZECE, redirect: "follow" });
        if (r.status === 404 || r.status === 410 || !r.url.includes("/detail/")) {
          await prisma.inzerat.update({ where: { id: i.id }, data: { zmizelAt: new Date() } });
          zmizelo++;
        }
      }
    } catch (e) {
      console.log(`  ${i.externalId}: ${e instanceof Error ? e.message : e}`);
    }
    await sleep(1500);
  }
  await prohlizec?.close();
  console.log(`Zařazené inzeráty: ${inzeraty.length}, nových screenshotů ${snimku}, zmizelo z trhu ${zmizelo}.`);
}

async function main() {
  const zacatek = new Date();
  console.log(`[${zacatek.toISOString()}] Noční sken trhu`);

  const sledovane = (await prisma.property.findMany({ where: { status: { not: "SOLD" }, sledovatTrh: true, oceneniPodle: null } }))
    .filter((p) => NEMOVITOST_MAP.get(p.type)?.srealityCesta);
  console.log(`${sledovane.length} nemovitostí se sleduje.`);

  let selhalo = 0;
  let ok = 0;
  for (const p of sledovane) {
    if (!p.region || p.latitude == null) await doplnPolohu(p.id);
    const { vysledky, navrhu, statistika: st } = await skenujNemovitost(p.id, "CRON_NOCNI");
    for (const v of vysledky) {
      const typ = v.dealType === "SALE" ? "prodej " : "pronájem";
      console.log(`  ${p.name.padEnd(30)} ${typ} ${v.chyba ? `SELHALO — ${v.chyba}` : `${v.nalezeno} nabídek, ${v.novych} nových, ${v.zmenCeny} změn ceny`}`);
      if (v.chyba) selhalo++; else ok++;
    }
    console.log(`  ${"".padEnd(30)} ${navrhu} nových návrhů k zařazení (posouzeno ${st.kandidatu}: už známých ${st.uzZname}, daleko ${st.daleko}, jiná velikost ${st.velikost}, vyloučená obec ${st.vylouceneObce}, zmizelé ${st.zmizelych})`);
  }

  await zarazeneInzeraty();
  // Zmizele inzeraty v odhadu zustavaji (byly to skutecne nabidky), jen se prepocita
  for (const p of sledovane) {
    await aktualizujSkupinu(p.id);
  }
  const presunuto = await presunSnimkyNaDisk(50).catch(() => 0);
  if (presunuto) console.log(`Na Google Disk přesunuto ${presunuto} snímků.`);

  const smazano = await uklidDenik();
  if (smazano > 0) console.log(`Z deníku odklizeno ${smazano} záznamů starších 90 dnů.`);

  const s = ((Date.now() - zacatek.getTime()) / 1000).toFixed(0);
  console.log(`\nHotovo za ${s} s — ${ok} úspěšných dotazů, ${selhalo} selhalo.`);
  if (ok === 0 && selhalo > 0) process.exitCode = 1;
}

main()
  .catch((e) => { console.error("Noční sken selhal:", e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
