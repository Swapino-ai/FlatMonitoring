import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { runScan, valuateFromMarket } from "@/lib/market";

export const maxDuration = 300;

/**
 * Spusti sken trhu pro vsechny evidovane nemovitosti a prepocita odhady hodnot.
 * Vola se z UI tlacitkem nebo mesicnim cronem (scripts/market-scan.ts).
 */
export async function POST() {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Nepřihlášen" }, { status: 401 });
  if (user.role !== "OWNER") return NextResponse.json({ error: "Jen majitel může spustit sken" }, { status: 403 });

  const properties = await prisma.property.findMany({ where: { status: { not: "SOLD" } } });
  const results = [];

  // Jeden sken na kombinaci mesto+dispozice — neopakujeme dotaz pro stejnou lokalitu
  const queries = new Map<string, { city: string; district: string | null; disposition: string; areaM2: number }>();
  for (const p of properties) {
    queries.set(`${p.city}|${p.disposition}`, { city: p.city, district: p.district, disposition: p.disposition, areaM2: p.areaM2 });
  }

  for (const q of queries.values()) {
    for (const dealType of ["SALE", "RENT"] as const) {
      const r = await runScan({
        city: q.city,
        district: q.district ?? undefined,
        disposition: q.disposition,
        areaM2: q.areaM2,
        dealType,
      });
      results.push(...r.map((x) => ({ ...x, city: q.city, dealType })));
    }
  }

  const valuations = [];
  for (const p of properties) {
    const v = await valuateFromMarket(p.id);
    if (v) valuations.push({ property: p.name, value: v.value, sample: v.stats.count });
  }

  return NextResponse.json({ results, valuations });
}
