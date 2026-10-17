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
import { jeNastaveno } from "../src/lib/googleDrive";
import { HLAVICKY_PROHLIZECE, sleep } from "../src/lib/market/util";

const prisma = new PrismaClient();

/**
 * Existuje inzerat? true = ano, false = urcite ne (404/410 nebo presmerovani na Sreality jinam nez na
 * detail tohoto inzeratu), null = nevime (sit, souhlas s cookies) — pak se nic nemeni.
 */
async function inzeratExistuje(url: string, externalId: string): Promise<boolean | null> {
  try {
    const r = await fetch(url, { headers: HLAVICKY_PROHLIZECE, redirect: "follow" });
    if (r.status === 404 || r.status === 410) return false;
    if (!r.ok) return null;
    const cil = new URL(r.url);
    if (!cil.hostname.endsWith("sreality.cz")) return null;
    return cil.pathname.includes(externalId);
  } catch {
    return null;
  }
}

/** Overi existenci zarazenych inzeratu a porizuje jejich screenshoty. */
async function zarazeneInzeraty() {
  const inzeraty = await prisma.inzerat.findMany({
    // I drive "zmizele" se overi znovu: drivejsi kontrola je chybne oznacovala (presmerovani na souhlas s cookies)
    where: { zarazeni: { some: { stav: "ZARAZENO" } }, url: { not: null } },
    include: { snimky: { where: { druh: "SNIMEK" }, orderBy: { createdAt: "desc" }, take: 1 }, _count: { select: { snimky: { where: { druh: "FOTO" } } } } },
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
  let fotek = 0;
  let zmizelo = 0;
  let vraceno = 0;
  let neovereno = 0;
  for (const i of inzeraty) {
    const potrebaFotky = i._count.snimky === 0;
    const potrebaSnimek = potrebaFotky || !i.snimky[0] || (i.snimky[0].price != null && Math.abs(i.snimky[0].price - i.price) >= 1);
    try {
      const existuje = await inzeratExistuje(i.url!, i.externalId);
      if (existuje === false) {
        if (!i.zmizelAt) { await prisma.inzerat.update({ where: { id: i.id }, data: { zmizelAt: new Date() } }); zmizelo++; }
        continue;
      }
      if (existuje === null) neovereno++;
      if (existuje === true && i.zmizelAt) {
        await prisma.inzerat.update({ where: { id: i.id }, data: { zmizelAt: null } });
        vraceno++;
      }
      // "Nevim" (null, napr. presmerovani na souhlas s cookies) screenshot neblokuje:
      // prohlizec souhlas odklikne a az pak se overi, ze je na detailu inzeratu
      if (kontext && potrebaSnimek) {
        const stranka = await kontext.newPage();
        await stranka.goto(i.url!, { waitUntil: "domcontentloaded", timeout: 45_000 });
        // Souhlas s cookies (Seznam CMP) by jinak prekryl celou stranku
        await stranka.getByRole("button", { name: /souhlasím|přijmout vše|rozumím/i }).first().click({ timeout: 4000 }).catch(() => undefined);
        await stranka.waitForTimeout(2500);
        if (!stranka.url().includes(i.externalId)) {
          console.log(`  ${i.externalId}: prohlížeč skončil jinde (${new URL(stranka.url()).hostname}${new URL(stranka.url()).pathname.slice(0, 40)}), snímek přeskočen`);
        } else {
          // Prohlizec potvrdil, ze inzerat zije: pripadne chybne "zmizel" se vrati
          if (existuje === null && i.zmizelAt) {
            await prisma.inzerat.update({ where: { id: i.id }, data: { zmizelAt: null } });
            vraceno++;
          }
          const data = await stranka.screenshot({ type: "jpeg", quality: 65 });
          await prisma.inzeratSnimek.create({ data: { inzeratId: i.id, price: i.price, data: new Uint8Array(data) } });
          snimku++;
          // Fotografie z galerie inzeratu (jednou) — ulozi se a presunou na Google Disk
          if (potrebaFotky) {
            const adresy: string[] = await stranka.evaluate(() => Array.from(document.querySelectorAll("img"))
              .map((im) => (im as HTMLImageElement).currentSrc || (im as HTMLImageElement).src)
              .filter((u) => /sdn\.cz/.test(u) && !/logo|avatar|icon/i.test(u)));
            const unikatni = [...new Map(adresy.map((u) => [u.split("?")[0], u])).values()].slice(0, 30);
            let poradi = 0;
            for (const u of unikatni) {
              try {
                const odp = await stranka.request.get(u);
                const typ = odp.headers()["content-type"] ?? "image/jpeg";
                if (!odp.ok() || !typ.startsWith("image/")) continue;
                const telo = await odp.body();
                if (telo.length < 15_000) continue; // nahledy a ikonky
                await prisma.inzeratSnimek.create({ data: { inzeratId: i.id, druh: "FOTO", poradi: poradi++, mime: typ.split(";")[0], data: new Uint8Array(telo) } });
              } catch { /* jedna fotka nesmi shodit zbytek */ }
            }
            fotek += poradi;
          }
        }
        await stranka.close();
      }
    } catch (e) {
      console.log(`  ${i.externalId}: ${e instanceof Error ? e.message : e}`);
    }
    await sleep(1500);
  }
  await prohlizec?.close();
  console.log(`Zařazené inzeráty: ${inzeraty.length}, nových screenshotů ${snimku}, fotografií ${fotek}, zmizelo z trhu ${zmizelo}, chybně označených vráceno ${vraceno}, existenci nešlo ověřit ${neovereno}.`);
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
    console.log(`  ${"".padEnd(30)} ${navrhu} nových návrhů k zařazení (posouzeno ${st.kandidatu}: už známých ${st.uzZname}, daleko ${st.daleko}, jiná velikost ${st.velikost}, jiná dispozice ${st.jinaDispozice}, vyloučená obec ${st.vylouceneObce}, zmizelé ${st.zmizelych}; odebráno neplatných návrhů ${st.odebrano})`);
  }

  await zarazeneInzeraty();
  // Zmizele inzeraty v odhadu zustavaji (byly to skutecne nabidky), jen se prepocita
  for (const p of sledovane) {
    await aktualizujSkupinu(p.id);
  }
  const presunuto = await presunSnimkyNaDisk(500).catch((e) => { console.log("Přesun na Disk selhal:", e instanceof Error ? e.message : e); return 0; });
  const naDisku = await prisma.inzeratSnimek.count({ where: { driveId: { not: null } } });
  const cekaNaDisk = await prisma.inzeratSnimek.count({ where: { driveId: null, data: { not: null } } });
  const disk = !jeNastaveno() ? "chybí GOOGLE_CLIENT_ID/SECRET"
    : !(await prisma.googleConnection.findUnique({ where: { id: "main" } })) ? "Disk není v aplikaci připojený" : "připojeno";
  console.log(`Google Disk (${disk}): přesunuto ${presunuto}, celkem na Disku ${naDisku}, čeká ${cekaNaDisk}.`);

  const smazano = await uklidDenik();
  if (smazano > 0) console.log(`Z deníku odklizeno ${smazano} záznamů starších 90 dnů.`);

  const s = ((Date.now() - zacatek.getTime()) / 1000).toFixed(0);
  console.log(`\nHotovo za ${s} s — ${ok} úspěšných dotazů, ${selhalo} selhalo.`);
  if (ok === 0 && selhalo > 0) process.exitCode = 1;
}

main()
  .catch((e) => { console.error("Noční sken selhal:", e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
