import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { runScan, valuateFromMarket, odhadniNajemPriZmene } from "@/lib/market";
import { NEMOVITOST_MAP } from "@/lib/catalogs";
import { doplnPolohu } from "@/lib/geokodovani";
import { ukonciBeh, zacniBeh } from "@/lib/scanLog";

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

  const beh = await zacniBeh({
    trigger: "RUCNI", dealType, propertyId: property.id,
    propertyName: property.name, city: property.city, category: property.type,
  });

  let results;
  try {
    results = await runScan({
      city: property.city,
      district: property.district ?? undefined,
      disposition: property.disposition ?? undefined,
      areaM2: property.areaM2,
      category: property.type,
      region: poloha?.region ?? property.region ?? undefined,
      dealType,
    });
  } catch (e) {
    const zprava = e instanceof Error ? e.message : String(e);
    await ukonciBeh(beh, { status: "SELHALO", message: zprava });
    throw e;
  }

  // Prodejni ceny urcuji odhad hodnoty — po nich rovnou precenime
  let valuation: { value: number; sample: number } | null = null;
  let okruhKm: number | null = null;
  if (dealType === "SALE") {
    const v = await valuateFromMarket(property.id);
    if (v) {
      valuation = { value: v.value, sample: v.stats.count };
      okruhKm = v.stats.okruhKm;
    }
  }

  // Najemni ceny plni stejnou historii jako nocni sken — rucni sken ji nepreskakuje
  let rent: { monthlyRent: number; zapsano: boolean; duvod: string; okruhKm: number | null } | null = null;
  if (dealType === "RENT") {
    const r = await odhadniNajemPriZmene(property.id);
    if (r) rent = { monthlyRent: r.monthlyRent, zapsano: r.zapsano, duvod: r.duvod, okruhKm: r.stats.okruhKm };
  }

  const nalezeno = results.reduce((a, r) => a + r.count, 0);
  const selhalo = results.filter((r) => r.status === "FAILED");
  const vysledek = valuation
    ? `nová hodnota ${Math.round(valuation.value).toLocaleString("cs-CZ")} Kč`
    : rent
      ? `${Math.round(rent.monthlyRent).toLocaleString("cs-CZ")} Kč/měs${rent.zapsano ? " zapsáno" : ` — nezapsáno (${rent.duvod})`}`
      : "odhad nevznikl, málo srovnatelných nabídek";

  await ukonciBeh(beh, {
    // Porucha portalu se musi v deniku poznat od prazdneho trhu
    status: selhalo.length && nalezeno === 0 ? "SELHALO" : nalezeno === 0 ? "PRAZDNY" : "OK",
    listingsFound: nalezeno,
    okruhKm: okruhKm ?? rent?.okruhKm ?? null,
    result: vysledek,
    message: selhalo[0]?.message ?? null,
  });

  return NextResponse.json({
    property: property.name,
    dealType,
    results,
    valuation,
    rent,
  });
}
