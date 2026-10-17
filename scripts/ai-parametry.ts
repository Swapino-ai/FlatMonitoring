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
import { AI_MODEL, CENIK, vytahniParametry } from "../src/lib/market/aiParametry";
import { HLAVICKY_PROHLIZECE, sleep } from "../src/lib/market/util";
import { nactiDetail } from "./sreality-detail";

export async function doplnParametry(prisma: PrismaClient, limit = 150, kontextZvenku?: BrowserContext | null): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("AI parametry: chybí ANTHROPIC_API_KEY, přeskočeno.");
    return;
  }
  const cekajici = await prisma.inzerat.findMany({
    // Bez parametru, nebo bez fotek galerie (ty se pak jen doplni, AI se znovu nevola)
    where: { OR: [{ parametryAt: null }, { fotkyUrl: { isEmpty: true } }], url: { not: null }, zmizelAt: null, zarazeni: { some: { stav: { in: ["NAVRH", "ZARAZENO"] } } } },
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
      if (i.parametryAt) {
        // Parametry uz jsou, chybely jen fotky
        await prisma.inzerat.update({ where: { id: i.id }, data: { fotkyUrl: d.fotky } });
        continue;
      }
      const r = await vytahniParametry(d.text, client);
      vstup += r.vstup; vystup += r.vystup;
      await prisma.inzerat.update({
        where: { id: i.id },
        data: { parametry: { ...r.parametry, model: AI_MODEL } as Prisma.InputJsonValue, parametryAt: new Date(), fotkyUrl: d.fotky },
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

/** Shoda AI s rucne nastavenym typem domu a stavem u zarazenych nabidek. */
async function porovnej(prisma: PrismaClient) {
  const rucne = await prisma.zarazeniInzeratu.findMany({
    where: { OR: [{ typDomu: { not: null } }, { stavBytu: { not: null } }], inzerat: { parametryAt: { not: null } } },
    include: { inzerat: { select: { externalId: true, parametry: true } } },
  });
  if (!rucne.length) return;
  const vysledek = { typ: [0, 0, 0], stav: [0, 0, 0] }; // shoda, neshoda, AI nevi
  for (const z of rucne) {
    const p = (z.inzerat.parametry ?? {}) as { typDomu?: string | null; stavBytu?: string | null };
    for (const [k, rucni, ai] of [["typ", z.typDomu, p.typDomu], ["stav", z.stavBytu, p.stavBytu]] as const) {
      if (!rucni) continue;
      const v = vysledek[k];
      if (!ai) v[2]++;
      else if (ai === rucni) v[0]++;
      else { v[1]++; console.log(`  nesouhlasí ${k} u ${z.inzerat.externalId}: ručně ${rucni}, AI ${ai}`); }
    }
  }
  console.log(`Porovnání s ručním označením — typ domu: shoda ${vysledek.typ[0]}, jinak ${vysledek.typ[1]}, AI neví ${vysledek.typ[2]}; ` +
    `stav bytu: shoda ${vysledek.stav[0]}, jinak ${vysledek.stav[1]}, AI neví ${vysledek.stav[2]}.`);
}

if (process.argv[1]?.endsWith("ai-parametry.ts")) {
  const prisma = new PrismaClient();
  doplnParametry(prisma, Number(process.argv[2]) || 150)
    .catch((e) => { console.error("AI parametry selhaly:", e); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}
