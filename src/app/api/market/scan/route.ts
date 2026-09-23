import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { runScan, valuateFromMarket, odhadniNajemPriZmene } from "@/lib/market";
import { NEMOVITOST_MAP } from "@/lib/catalogs";
import { doplnPolohu } from "@/lib/geokodovani";

// Jeden dotaz na portal trva 15-20 s, protoze se strankuje do hloubky,
// nez se nasbira dost srovnatelnych nabidek. Proto kazdy pozadavek resi
// jedinou kombinaci nemovitost + typ obchodu a klient je vola postupne.
// Cely sken v jednom pozadavku by na serverless funkci vyprsel.
export const maxDuration = 60;

interface Telo {
  propertyId?: string;
  dealType?: "SALE" | "RENT";
}

export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Nepřihlášen" }, { status: 401 });
  if (user.role !== "OWNER") return NextResponse.json({ error: "Jen majitel může spustit sken" }, { status: 403 });

  const telo = (await request.json().catch(() => ({}))) as Telo;

  // Bez parametru vracime seznam kroku, ktere ma klient projit
  if (!telo.propertyId) {
    const properties = await prisma.property.findMany({
      where: { status: { not: "SOLD" } },
      select: { id: true, name: true, city: true, disposition: true, type: true },
      orderBy: { name: "asc" },
    });
    // Bez ověřené cesty na Sreality nemovitost skenovat neumíme
    const skenovatelne = properties.filter((p) => NEMOVITOST_MAP.get(p.type)?.srealityCesta);
    const kroky = skenovatelne.flatMap((p) =>
      (["SALE", "RENT"] as const).map((dealType) => ({
        propertyId: p.id,
        dealType,
        popis: `${p.name} — ${dealType === "SALE" ? "prodejní" : "nájemní"} ceny`,
      })),
    );
    return NextResponse.json({ kroky });
  }

  const property = await prisma.property.findUnique({ where: { id: telo.propertyId } });
  if (!property) return NextResponse.json({ error: "Nemovitost neexistuje" }, { status: 404 });

  const dealType = telo.dealType ?? "SALE";

  // Nemovitosti zalozene pred naseptavacem nemaji kraj, a bez nej nefunguje
  // zaloha pro obce, ktere na Sreality vlastni vypis nemaji. Dohledame ho
  // z adresy a ulozime — priste uz to neni potreba.
  const poloha = await doplnPolohu(property.id);

  const results = await runScan({
    city: property.city,
    district: property.district ?? undefined,
    disposition: property.disposition ?? undefined,
    areaM2: property.areaM2,
    category: property.type,
    region: poloha?.region ?? property.region ?? undefined,
    dealType,
  });

  // Prodejni ceny urcuji odhad hodnoty — po nich rovnou precenime
  let valuation: { value: number; sample: number } | null = null;
  if (dealType === "SALE") {
    const v = await valuateFromMarket(property.id);
    if (v) valuation = { value: v.value, sample: v.stats.count };
  }

  // Najemni ceny plni stejnou historii jako nocni sken — rucni sken ji nepreskakuje
  let rent: { monthlyRent: number; zapsano: boolean; duvod: string } | null = null;
  if (dealType === "RENT") {
    const r = await odhadniNajemPriZmene(property.id);
    if (r) rent = { monthlyRent: r.monthlyRent, zapsano: r.zapsano, duvod: r.duvod };
  }

  return NextResponse.json({
    property: property.name,
    dealType,
    results,
    valuation,
    rent,
  });
}
