import Link from "next/link";
import { notFound } from "next/navigation";
import { page } from "@/lib/guard";
import { Nav } from "@/components/Nav";
import { Verze } from "@/components/Verze";
import { Card } from "@/components/Stat";
import { ValuationManager } from "@/components/ValuationManager";
import { TrhNemovitosti, type OdhadPanel, type RadekTrhu } from "@/components/TrhNemovitosti";
import { prisma } from "@/lib/db";
import { loadProperty } from "@/lib/portfolio";
import { NEMOVITOST_MAP, nazevNemovitosti } from "@/lib/catalogs";
import { denISO } from "@/lib/format";
import { odhadZeZarazenych } from "@/lib/market/zarazeni";
import { OKNO_ODHADU, navrhniProNemovitost, korenOceneni, okruhNemovitosti } from "@/lib/market/inzeraty";
import { vzdalenost, vahaNabidky } from "@/lib/market/zarazeni";
import { presunSnimkyNaDisk } from "@/lib/market/snimky";

export const dynamic = "force-dynamic";

/**
 * Ocenění a trh: sledovani trhu u nemovitosti, kontrola navrzenych nabidek,
 * zarazene nabidky a odhad z poslednich 10 zarazenych.
 */
export default async function TrhPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await page();
  const { id } = await params;
  const property = await loadProperty(id);
  if (!property) notFound();

  // Snimky porizene nocnim skenem se presouvaji na Google Disk postupne
  await presunSnimkyNaDisk(3).catch(() => 0);

  // Propojene oceneni: nabidky a rozhodovani patri nemovitosti, podle ktere se oceňuje
  const koren = await korenOceneni(id);
  const korenP = koren === id ? property : await prisma.property.findUnique({ where: { id: koren } });
  const [navazane, moznosti] = await Promise.all([
    prisma.property.findMany({ where: { oceneniPodle: id }, select: { id: true, name: true } }),
    prisma.property.findMany({
      where: { id: { not: id }, type: property.type, status: { not: "SOLD" }, oceneniPodle: null },
      select: { id: true, name: true }, orderBy: { name: "asc" },
    }),
  ]);
  // Proc co (ne)prislo do navrhu — bez zapisu
  // Pri otevreni: odebrat navrhy, ktere uz pravidlum nevyhovuji, a doplnit nove z databaze trhu
  if (korenP?.sledovatTrh) await navrhniProNemovitost(koren);
  const diag = await navrhniProNemovitost(koren, { zapsat: false });

  const zaznamy = await prisma.zarazeniInzeratu.findMany({
    where: { propertyId: koren },
    include: {
      inzerat: {
        include: {
          ceny: { orderBy: { at: "asc" } },
          snimky: { orderBy: [{ druh: "asc" }, { poradi: "asc" }, { createdAt: "desc" }], select: { id: true, createdAt: true, druh: true } },
        },
      },
    },
  });

  // Klic: jak se hleda, popsane vetou
  const zdroj = korenP ?? property;
  const okruh = okruhNemovitosti(zdroj);
  const vyloucene = (zdroj.excludedCities ?? "").split(",").map((m) => m.trim()).filter(Boolean);
  const plochaOd = Math.round(zdroj.areaM2 * 0.75), plochaDo = Math.round(zdroj.areaM2 * 1.25);
  const klic = [
    `Prodej i nájem: ${nazevNemovitosti(zdroj.type).toLowerCase()}${zdroj.disposition ? ` ${zdroj.disposition} (jen stejná dispozice)` : ""}, ${plochaOd}–${plochaDo} m²`,
    `do ${okruh.zaklad} km od obce ${zdroj.city}${okruh.pevny ? " (pevný okruh)" : `, při málo nabídkách až ${okruh.max} km`}; nabídka bez polohy jen ze stejné obce.`,
    vyloucene.length ? `Nezahrnuje se: ${vyloucene.join(", ")}.` : "",
    `Odhad = medián Kč/m² ze zařazených nabídek, které se objevily za poslední 2 měsíce, × ${property.areaM2} m²${koren !== id && korenP ? ` (nabídky sdílené s ${korenP.name})` : ""}.`,
  ].filter(Boolean).join(" ");

  // Obce, ze kterych nabidky prisly: klikem je jde vyloucit
  const obceMapa = new Map<string, { pocet: number; km: number | null }>();
  for (const z of zaznamy) {
    const i = z.inzerat;
    const km = zdroj.latitude != null && zdroj.longitude != null && i.latitude != null && i.longitude != null
      ? vzdalenost({ lat: zdroj.latitude, lon: zdroj.longitude }, { lat: i.latitude, lon: i.longitude }) : null;
    const o = obceMapa.get(i.city) ?? { pocet: 0, km: null };
    obceMapa.set(i.city, { pocet: o.pocet + 1, km: km == null ? o.km : o.km == null ? km : Math.min(o.km, km) });
  }
  const obce = [
    ...[...obceMapa.entries()].filter(([n]) => !vyloucene.some((v) => n.toLowerCase().includes(v.toLowerCase())))
      .map(([nazev, o]) => ({ nazev, pocet: o.pocet, km: o.km == null ? null : Math.round(o.km * 10) / 10, vyloucena: false })),
    ...vyloucene.map((nazev) => ({ nazev, pocet: 0, km: null, vyloucena: true })),
  ].sort((a, b) => Number(a.vyloucena) - Number(b.vyloucena) || (a.km ?? 99) - (b.km ?? 99));

  const radky: RadekTrhu[] = zaznamy.map((z) => {
    const i = z.inzerat;
    return {
      typDomu: z.typDomu, stavBytu: z.stavBytu, vahaRucne: z.vahaRucne,
      vaha: vahaNabidky(property, { areaM2: i.areaM2, typDomu: z.typDomu, stavBytu: z.stavBytu, vahaRucne: z.vahaRucne }),
      id: z.id, stav: z.stav as RadekTrhu["stav"], skore: z.skore, doporuceno: z.doporuceno, duvod: z.duvod,
      dealType: i.dealType === "RENT" ? "RENT" : "SALE", disposition: i.disposition, areaM2: i.areaM2,
      price: i.price, pricePerM2: i.pricePerM2, city: i.city, district: i.district, url: i.url,
      lat: i.latitude, lon: i.longitude, polohaRucne: i.polohaRucne, inzeratId: i.id,
      firstSeen: denISO(i.firstSeenAt), lastSeen: denISO(i.lastSeenAt), zmizel: i.zmizelAt ? denISO(i.zmizelAt) : null,
      ceny: i.ceny.map((c) => ({ at: denISO(c.at), price: c.price })),
      snimky: i.snimky.filter((s) => s.druh !== "FOTO").map((s) => ({ id: s.id, createdAt: s.createdAt.toISOString() })),
      fotky: i.snimky.filter((s) => s.druh === "FOTO").map((s) => s.id),
    };
  });

  const odhad = (d: "SALE" | "RENT"): OdhadPanel | null => {
    const o = odhadZeZarazenych(
      radky.filter((r) => r.dealType === d && r.stav === "ZARAZENO").map((r) => ({ datum: r.firstSeen, pricePerM2: r.pricePerM2 ?? 0, vaha: r.vaha })),
      property.areaM2, OKNO_ODHADU,
    );
    return o ? { hodnota: o.hodnota, perM2: o.perM2, pocet: o.pocet, rada: o.rada.map((b) => ({ datum: b.datum, hodnota: b.hodnota })) } : null;
  };

  const canEdit = user.role === "OWNER";
  const skenovatelne = !!NEMOVITOST_MAP.get(property.type)?.srealityCesta;

  return (
    <>
      <Nav user={user} verze={<Verze />} />
      <main className="mx-auto max-w-[1400px] space-y-4 px-6 py-6">
        <div>
          <Link href={`/properties/${id}`} className="text-xs text-accent">← {property.name}</Link>
          <h1 className="mt-1 text-xl font-semibold">Ocenění a trh</h1>
          <p className="mt-1 text-sm text-ink-secondary">
            {property.city} · {nazevNemovitosti(property.type)}
            {property.disposition && ` · ${property.disposition}`} · {property.areaM2} m²
          </p>
        </div>

        <TrhNemovitosti propertyId={id} trhId={koren} klic={klic} obce={obce} vlastnosti={{ typDomu: property.typDomu, stavBytu: property.stavBytu }} canEdit={canEdit} sledovat={korenP?.sledovatTrh ?? false}
          propojeni={{ podle: koren !== id && korenP ? { id: korenP.id, name: korenP.name } : null, navazane, moznosti }} skenovatelne={skenovatelne}
          poloha={property.latitude != null && property.longitude != null ? { lat: property.latitude, lon: property.longitude } : null}
          radky={radky} diag={diag} odhady={{ SALE: odhad("SALE"), RENT: odhad("RENT") }} />

        <Card title="Historie ocenění">
          <ValuationManager propertyId={id} valuations={property.valuations} areaM2={property.areaM2} canEdit={canEdit} vyrazene={[]} />
        </Card>
      </main>
    </>
  );
}
