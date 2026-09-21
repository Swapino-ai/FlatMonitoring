import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { HLAVICKY_PROHLIZECE } from "@/lib/market/util";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Meri, kde se cas skutecne travi. Bez toho se pomalost jen hada:
 * latence k databazi, probuzeni uspane instance a objem dat vypadaji
 * z prohlizece stejne.
 */
export async function GET() {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Nepřihlášen" }, { status: 401 });

  const zacatek = Date.now();

  // Prvni dotaz zahrnuje navazani spojeni a pripadne probuzeni uspane databaze
  const t1 = Date.now();
  await prisma.$queryRaw`SELECT 1`;
  const prvniDotaz = Date.now() - t1;

  // Dalsi dotazy uz jedou po navazanem spojeni — rozdil ukaze cenu probuzeni
  const casy: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    casy.push(Date.now() - t);
  }
  const median = [...casy].sort((a, b) => a - b)[2];

  // Skutecna zatez jedne stranky
  const t3 = Date.now();
  const properties = await prisma.property.findMany({
    include: {
      loans: true, leases: true, services: true,
      valuations: { orderBy: { date: "desc" } },
      transactions: { select: { id: true, date: true, amount: true, category: true, taxTreatment: true, description: true, documentRef: true } },
    },
  });
  const nacteniPortfolia = Date.now() - t3;

  const pocty = {
    nemovitosti: properties.length,
    transakce: properties.reduce((a, p) => a + p.transactions.length, 0),
    ocenení: properties.reduce((a, p) => a + p.valuations.length, 0),
  };
  const velikostKB = Math.round(JSON.stringify(properties).length / 1024);

  // Hostitele databaze vypisujeme bez pristupovych udaju
  let dbHost = "neznámý";
  let dbRegion = "neznámý";
  try {
    const u = new URL(process.env.DATABASE_URL ?? "");
    dbHost = u.hostname;
    // Neon ma region v nazvu hostitele, napr. ep-neco-pooler.eu-central-1.aws.neon.tech
    dbRegion = dbHost.match(/\.([a-z]{2}-[a-z]+-\d)\./)?.[1] ?? "nerozpoznán";
  } catch { /* promenna chybi nebo neni URL */ }

  // Dosazitelnost portalu primo odsud — z prohlizece to vypada jinak nez ze serveru
  const portal = await (async () => {
    const url = "https://www.sreality.cz/hledani/prodej/byty/praha";
    const t = Date.now();
    try {
      const r = await fetch(url, { headers: HLAVICKY_PROHLIZECE, redirect: "follow" });
      const html = await r.text();
      return {
        url,
        stav: r.status,
        msMs: Date.now() - t,
        velikostKB: Math.round(html.length / 1024),
        maData: /__NEXT_DATA__/.test(html),
      };
    } catch (e) {
      return { url, stav: 0, chyba: e instanceof Error ? e.message : String(e) };
    }
  })();

  const vercelRegion = process.env.VERCEL_REGION ?? "mimo Vercel";
  const stejnyKontinent = dbRegion.startsWith("eu") && vercelRegion.startsWith("fra");

  const diagnoza: string[] = [];
  if (prvniDotaz > median * 3 && prvniDotaz > 500) {
    diagnoza.push(`První dotaz trval ${prvniDotaz} ms proti ${median} ms u dalších — databáze byla uspaná a musela se probudit. Na Neonu se to děje po pěti minutách nečinnosti.`);
  }
  if (median > 50) {
    diagnoza.push(`Jeden dotaz trvá ${median} ms i po navázání spojení. Databáze je daleko od aplikace${dbRegion !== "neznámý" ? ` (${dbRegion} proti ${vercelRegion})` : ""}. Stránka jich dělá šest, takže jen čekáním na síť padne ${median * 6} ms.`);
  }
  if (velikostKB > 500) {
    diagnoza.push(`Pro jednu stránku se načítá ${velikostKB} kB dat. To už je hodně — vyplatí se omezit rozsah načítaných transakcí.`);
  }
  if (portal.stav === 404 || portal.stav === 403) {
    diagnoza.push(`Sreality odsud vracejí HTTP ${portal.stav} na adresu, která z jiných sítí funguje. Odmítají požadavky z datového centra. Sken spouštěj přes GitHub Actions (Actions → Měsíční sken trhu → Run workflow); hodnotu lze také zadat ručně v detailu bytu.`);
  } else if (portal.stav === 200 && !portal.maData) {
    diagnoza.push("Sreality odpovídají, ale stránka neobsahuje očekávaná data — patrně se změnila struktura webu. Spusť v Actions workflow Sonda portálů.");
  } else if (portal.stav === 200) {
    diagnoza.push(`Sreality jsou odsud dostupné (${portal.msMs} ms), sken trhu by měl fungovat.`);
  }

  if (diagnoza.length === 0) {
    diagnoza.push("Databáze odpovídá rychle a objem dat je malý. Pomalost bude jinde — nejspíš ve studeném startu funkce nebo na straně prohlížeče.");
  }

  return NextResponse.json({
    verze: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "lokální běh",
    nasazeno: process.env.VERCEL_GIT_COMMIT_MESSAGE?.split("\n")[0] ?? null,
    kdeBeziAplikace: vercelRegion,
    kdeBeziDatabaze: { host: dbHost, region: dbRegion },
    stejnyKontinent,
    casy: {
      prvniDotazMs: prvniDotaz,
      dalsiDotazyMs: casy,
      medianDotazuMs: median,
      nacteniPortfoliaMs: nacteniPortfolia,
      celkemMs: Date.now() - zacatek,
    },
    objemDat: { ...pocty, velikostKB },
    dostupnostPortalu: portal,
    diagnoza,
  }, { headers: { "Cache-Control": "no-store" } });
}
