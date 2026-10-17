import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NEMOVITOST_MAP } from "@/lib/catalogs";
import { doplnPolohu } from "@/lib/geokodovani";
import { skenujNemovitost } from "@/lib/market/sken";

// Jeden dotaz na portal trva 15-20 s (strankuje se), proto kazdy pozadavek resi
// jednu nemovitost a jeden typ obchodu a klient je vola postupne.
export const maxDuration = 60;

interface Telo {
  propertyId?: string;
  dealType?: "SALE" | "RENT";
}

/**
 * Rucni sken: stahne nabidky do databaze trhu a navrhne nove k zarazeni.
 * Neoceňuje — odhad se pocita jen ze zarazenych nabidek.
 */
export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Nepřihlášen" }, { status: 401 });
  if (user.role !== "OWNER") return NextResponse.json({ error: "Jen majitel může spustit sken" }, { status: 403 });

  const telo = (await request.json().catch(() => ({}))) as Telo;

  // Bez parametru vracime seznam kroku: jen sledovane nemovitosti
  if (!telo.propertyId) {
    const properties = await prisma.property.findMany({
      where: { status: { not: "SOLD" }, sledovatTrh: true },
      select: { id: true, name: true, type: true },
      orderBy: { name: "asc" },
    });
    const kroky = properties.filter((p) => NEMOVITOST_MAP.get(p.type)?.srealityCesta).flatMap((p) =>
      (["SALE", "RENT"] as const).map((dealType) => ({
        propertyId: p.id, dealType,
        popis: `${p.name} — ${dealType === "SALE" ? "prodej" : "pronájem"}`,
      })),
    );
    return NextResponse.json({ kroky });
  }

  const property = await prisma.property.findUnique({ where: { id: telo.propertyId } });
  if (!property) return NextResponse.json({ error: "Nemovitost neexistuje" }, { status: 404 });
  if (!property.sledovatTrh) return NextResponse.json({ error: "U nemovitosti není zapnuté sledování trhu." }, { status: 409 });

  await doplnPolohu(property.id);
  const dealTypes = telo.dealType ? [telo.dealType] : (["SALE", "RENT"] as const).slice();
  const { vysledky, navrhu } = await skenujNemovitost(property.id, "RUCNI", dealTypes);

  return NextResponse.json({
    property: property.name,
    results: vysledky.map((v) => ({ source: "SREALITY", status: v.chyba ? "FAILED" : v.nalezeno ? "OK" : "PARTIAL", count: v.nalezeno, message: v.chyba })),
    novych: vysledky.reduce((a, v) => a + v.novych, 0),
    navrhu,
  });
}
