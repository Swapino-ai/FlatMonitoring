/**
 * Doplni odkazy u nabidek ulozenych drive, nez se adresa detailu ukladala
 * ve funkcnim tvaru.
 *
 * Stary tvar /detail/<typ>/byt/x/x/<id> se spolehal na to, ze portal zastupne
 * "x" prepise sam — neprepisuje, vraci 404. Spravna adresa obsahuje slug
 * ulice, ktery v datech stranky neni, takze ji nejde dopocitat. Da se ale
 * dohledat: projdeme vypisy pro mesta a kategorie, ktere v tabulce jsou,
 * a odkazy sparujeme podle id inzeratu.
 *
 * Co se dohledat neda (inzerat uz z trhu zmizel), zustane bez odkazu — to je
 * poctivejsi nez nabizet mrtvy odkaz.
 *
 * Spousti se rucne z GitHub Actions, protoze Sreality odmitaji datova centra.
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { nactiStranku, odkazyZVypisu, slugMesta, sleep } from "../src/lib/market/util";
import { NEMOVITOST_MAP } from "../src/lib/catalogs";

const prisma = new PrismaClient();
const MAX_STRAN = 10;

/** Odkaz, ktery nikam nevede — stary tvar se zastupnymi segmenty. */
function rozbity(url: string | null): boolean {
  return !url || url.includes("/x/x/");
}

async function main() {
  const zacatek = Date.now();
  console.log(`[${new Date().toISOString()}] Doplňuji odkazy u starých nabídek`);

  const vsechny = await prisma.marketListing.findMany({
    where: { source: "SREALITY", externalId: { not: null } },
    select: { id: true, externalId: true, url: true, city: true, category: true, dealType: true },
  });

  const kDoplneni = vsechny.filter((r) => rozbity(r.url));
  console.log(`V tabulce je ${vsechny.length} nabídek, z toho ${kDoplneni.length} bez použitelného odkazu.`);
  if (kDoplneni.length === 0) return;

  // Jedna kombinace město + kategorie + typ obchodu = jeden průchod výpisem
  const skupiny = new Map<string, typeof kDoplneni>();
  for (const r of kDoplneni) {
    const klic = `${r.city}|${r.category}|${r.dealType}`;
    const s = skupiny.get(klic) ?? [];
    s.push(r);
    skupiny.set(klic, s);
  }

  let doplneno = 0;
  let nenalezeno = 0;

  for (const [klic, radky] of skupiny) {
    const [city, category, dealType] = klic.split("|");
    const cesta = NEMOVITOST_MAP.get(category)?.srealityCesta;
    if (!cesta) {
      console.log(`  ${klic}: kategorie se neskenuje, přeskakuji (${radky.length} nabídek)`);
      nenalezeno += radky.length;
      continue;
    }

    const hledane = new Set(radky.map((r) => r.externalId!));
    const nalezene = new Map<string, string>();
    const typ = dealType === "SALE" ? "prodej" : "pronajem";
    const mesto = slugMesta(city);

    for (let strana = 1; strana <= MAX_STRAN && nalezene.size < hledane.size; strana++) {
      const url = `https://www.sreality.cz/hledani/${typ}/${cesta}/${mesto}${strana > 1 ? `?strana=${strana}` : ""}`;
      try {
        const { html } = await nactiStranku(url);
        for (const [id, odkaz] of odkazyZVypisu(html)) {
          if (hledane.has(id)) nalezene.set(id, odkaz);
        }
      } catch (e) {
        // Neexistujici dalsi stranka neni porucha, jen konec vysledku
        if (strana === 1) console.log(`  ${klic}: výpis nešel načíst — ${(e as Error).message.slice(0, 100)}`);
        break;
      }
      await sleep(1500); // ohleduplne tempo
    }

    for (const r of radky) {
      const odkaz = nalezene.get(r.externalId!);
      if (!odkaz) { nenalezeno++; continue; }
      await prisma.marketListing.update({ where: { id: r.id }, data: { url: odkaz } });
      doplneno++;
    }

    console.log(`  ${klic}: doplněno ${nalezene.size} z ${radky.length}`);
  }

  // Karty u ocenění čtou zamrzlý snímek, ne tabulku — ten je potřeba opravit
  // taky, jinak se u nich "bez odkazu" drží dál. I stará adresa nese id
  // inzerátu, takže se dá spárovat s tím, co jsme právě dohledali.
  const mapaOdkazu = new Map<string, string>();
  for (const r of await prisma.marketListing.findMany({
    where: { source: "SREALITY", externalId: { not: null } },
    select: { externalId: true, url: true },
  })) {
    if (!rozbity(r.url)) mapaOdkazu.set(r.externalId!, r.url!);
  }

  const snimky = await opravSnimky(mapaOdkazu);

  const s = ((Date.now() - zacatek) / 1000).toFixed(0);
  console.log(`\nHotovo za ${s} s — doplněno ${doplneno}, nedohledáno ${nenalezeno} (inzerát už z trhu zmizel).`);
  console.log(`Snímky u ocenění: opraveno ${snimky.odkazu} odkazů v ${snimky.zaznamu} záznamech.`);
}

/** V adrese /detail/.../<id> je na konci id inzerátu. */
function idZOdkazu(url: unknown): string | null {
  if (typeof url !== "string") return null;
  const m = url.match(/\/(\d+)\/?$/);
  return m ? m[1] : null;
}

async function opravSnimky(mapa: Map<string, string>) {
  let zaznamu = 0;
  let odkazu = 0;

  const prepis = (comparables: unknown): { data: unknown; zmen: number } | null => {
    if (!Array.isArray(comparables)) return null;
    let zmen = 0;
    const nove = comparables.map((n) => {
      const z = n as { url?: string | null };
      if (!rozbity(z.url ?? null)) return n;
      const id = idZOdkazu(z.url);
      const odkaz = id ? mapa.get(id) : undefined;
      if (!odkaz) return n;
      zmen++;
      return { ...z, url: odkaz };
    });
    return zmen > 0 ? { data: nove, zmen } : null;
  };

  for (const v of await prisma.valuation.findMany({ where: { comparables: { not: Prisma.DbNull } } })) {
    const r = prepis(v.comparables);
    if (!r) continue;
    await prisma.valuation.update({ where: { id: v.id }, data: { comparables: r.data as Prisma.InputJsonValue } });
    zaznamu++; odkazu += r.zmen;
  }

  for (const v of await prisma.rentEstimate.findMany({ where: { comparables: { not: Prisma.DbNull } } })) {
    const r = prepis(v.comparables);
    if (!r) continue;
    await prisma.rentEstimate.update({ where: { id: v.id }, data: { comparables: r.data as Prisma.InputJsonValue } });
    zaznamu++; odkazu += r.zmen;
  }

  return { zaznamu, odkazu };
}

main()
  .catch((e) => { console.error("Doplnění odkazů selhalo:", e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
