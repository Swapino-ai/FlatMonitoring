/**
 * AI parametry inzeratu: projde navrzene a zarazene inzeraty, ktere jeste nemaji
 * parametry, nacte jejich stranku v prohlizeci a cely text da precist AI
 * (typ domu, stav bytu, podlazi, vytah...). Ulozi i odkazy na fotky z galerie.
 *
 * Vola ho nocni sken; samostatne: `npx tsx scripts/ai-parametry.ts [limit]`
 * (workflow ai-parametry.yml). Bez ANTHROPIC_API_KEY se tise preskoci.
 *
 * Na konci porovna AI s typem domu a stavem, ktere jsi u zarazenych nastavil rucne.
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import Anthropic from "@anthropic-ai/sdk";
import type { BrowserContext } from "playwright";
import { AI_MODEL, CENIK, NAJEM_OD, PROFILY_OD, vytahniParametry } from "../src/lib/market/aiParametry";
import { hodnotyNabidky, hodnotyZaznamu, profilTypu } from "../src/lib/market/profily";
import { HLAVICKY_PROHLIZECE, sleep } from "../src/lib/market/util";
import { nactiDetail } from "./sreality-detail";

export async function doplnParametry(prisma: PrismaClient, limit = 150, kontextZvenku?: BrowserContext | null): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("AI parametry: chybí ANTHROPIC_API_KEY, přeskočeno.");
    return;
  }
  const cekajici = await prisma.inzerat.findMany({
    // Bez parametru, nebo bez fotek galerie (ty se pak jen doplni, AI se znovu nevola)
    // Bez parametru, prectene pred profily typu, nebo bez fotek (ty se jen doplni)
    // Pronajmy prectene pred ctenim platebnich podminek znovu
    where: { OR: [{ parametryAt: null }, { parametryAt: { lt: PROFILY_OD } }, { fotkyUrl: { isEmpty: true } }, { dealType: "RENT", parametryAt: { lt: NAJEM_OD } }], url: { not: null }, zmizelAt: null, zarazeni: { some: { stav: { in: ["NAVRH", "ZARAZENO"] } } } },
    include: { zarazeni: { select: { stav: true } } },
  });
  // Zarazene napred (z nich se pocita odhad), pak navrhy
  cekajici.sort((a, b) => Number(b.zarazeni.some((z) => z.stav === "ZARAZENO")) - Number(a.zarazeni.some((z) => z.stav === "ZARAZENO")));
  const davka = cekajici.slice(0, limit);
  console.log(`AI parametry (${AI_MODEL}): čeká ${cekajici.length}, teď ${davka.length}.`);
  if (davka.length === 0) return porovnej(prisma);

  let prohlizec: Awaited<ReturnType<typeof import("playwright").chromium.launch>> | null = null;
  let kontext = kontextZvenku ?? null;
  if (!kontext) {
    const { chromium } = await import("playwright");
    prohlizec = await chromium.launch();
    kontext = await prohlizec.newContext({ viewport: { width: 1280, height: 2000 }, locale: "cs-CZ", userAgent: HLAVICKY_PROHLIZECE["User-Agent"] });
  }

  const client = new Anthropic();
  let hotovo = 0, chyb = 0, vstup = 0, vystup = 0;
  for (const i of davka) {
    const stranka = await kontext.newPage();
    try {
      const d = await nactiDetail(stranka, i.url!, i.externalId);
      if (d.stav === "NENI") {
        await prisma.inzerat.update({ where: { id: i.id }, data: { zmizelAt: new Date() } });
        console.log(`  ${i.externalId}: Sreality hlásí, že inzerát neexistuje — označen jako zmizelý`);
        continue;
      }
      if (d.stav === "NEVIM") {
        console.log(`  ${i.externalId}: stránka není detail inzerátu (${new URL(stranka.url()).pathname.slice(0, 40)}), přeskočeno`);
        continue;
      }
      if (i.parametryAt && i.parametryAt >= PROFILY_OD && (i.dealType !== "RENT" || i.parametryAt >= NAJEM_OD)) {
        // Parametry uz jsou, chybely jen fotky
        await prisma.inzerat.update({ where: { id: i.id }, data: { fotkyUrl: d.fotky } });
        continue;
      }
      const r = await vytahniParametry(d.text, profilTypu(i.category), client, i.dealType === "RENT");
      vstup += r.vstup; vystup += r.vystup;
      await prisma.inzerat.update({
        where: { id: i.id },
        data: { parametry: r.parametry as unknown as Prisma.InputJsonValue, parametryAt: new Date(), fotkyUrl: d.fotky },
      });
      hotovo++;
    } catch (e) {
      chyb++;
      console.log(`  ${i.externalId}: ${e instanceof Error ? e.message : e}`);
      // Dosly penize / spatny klic: nema smysl pokracovat
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) break;
      if (e instanceof Anthropic.BadRequestError && /credit|billing/i.test(e.message)) break;
    } finally {
      await stranka.close();
    }
    await sleep(1000);
  }
  await prohlizec?.close();

  const [cIn, cOut] = CENIK[AI_MODEL] ?? [0, 0];
  const usd = (vstup * cIn + vystup * cOut) / 1e6;
  console.log(`AI parametry: hotovo ${hotovo}, chyb ${chyb}; tokeny ${vstup} vstup / ${vystup} výstup ≈ $${usd.toFixed(4)} (${(usd * 23).toFixed(2)} Kč).`);
  await porovnej(prisma);
}

/** Shoda AI s tim, co jsi u zarazenych nastavil rucne, po vlastnostech profilu. */
async function porovnej(prisma: PrismaClient) {
  const zaznamy = await prisma.zarazeniInzeratu.findMany({
    where: { stav: "ZARAZENO", inzerat: { parametryAt: { gte: PROFILY_OD } } },
    include: { inzerat: { select: { externalId: true, category: true, parametry: true } } },
  });
  const souhrn = new Map<string, [number, number, number]>(); // shoda, jinak, AI nevi
  for (const z of zaznamy) {
    const profil = profilTypu(z.inzerat.category);
    const rucne = hodnotyZaznamu(profil, z);
    const { ai } = hodnotyNabidky(profil, {}, z.inzerat.parametry);
    for (const [klic, hodnota] of Object.entries(rucne)) {
      const nazev = `${profil.nazev}: ${profil.vlastnosti.find((v) => v.klic === klic)?.nazev ?? klic}`;
      const v = souhrn.get(nazev) ?? [0, 0, 0];
      if (!ai[klic]) v[2]++;
      else if (ai[klic] === hodnota) v[0]++;
      else { v[1]++; console.log(`  nesouhlasí ${nazev} u ${z.inzerat.externalId}: ručně ${hodnota}, AI ${ai[klic]}`); }
      souhrn.set(nazev, v);
    }
  }
  if (souhrn.size) console.log("Porovnání s ručním označením — " + [...souhrn].map(([n, [a, b, c]]) => `${n}: shoda ${a}, jinak ${b}, AI neví ${c}`).join("; ") + ".");
}

if (process.argv[1]?.endsWith("ai-parametry.ts")) {
  const prisma = new PrismaClient();
  doplnParametry(prisma, Number(process.argv[2]) || 150)
    .then(async () => {
      const { najdiShody } = await import("../src/lib/market/inzeraty");
      const r = await najdiShody();
      console.log(`Stejný byt: porovnáno ${r.porovnano} dvojic, nových možných shod ${r.novych}, odebráno neplatných ${r.odebrano}.`);
    })
    .catch((e) => { console.error("AI parametry selhaly:", e); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}
