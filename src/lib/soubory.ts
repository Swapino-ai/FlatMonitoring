import { SignJWT, jwtVerify } from "jose";
import { prisma } from "./db";
import { nazevDruhu } from "./categories";
import { nactiTypySluzeb } from "./typySluzeb";
import { cisloNajemce } from "./najemci";
import { jeKategorie, type KategorieKlic, type KontextPopisky, type PodkladNazvu } from "./dokumenty";

/** Co klient rekne o tom, kam soubor patri — jen identifikatory, popisky se nacitaji z databaze. */
export interface KontextVstup {
  kategorie: KategorieKlic;
  propertyId?: string | null;
  tenantId?: string | null;
  leaseId?: string | null;
  sluzbaId?: string | null;
  settlementId?: string | null;
  statementId?: string | null;
  rok?: number | null;
}

export interface KontextRozresen {
  popisky: KontextPopisky;
  vazby: { propertyId: string | null; tenantId: string | null; leaseId: string | null; serviceId: string | null; settlementId: string | null; statementId: string | null; rok: number | null };
}

export function zVstupu(o: unknown): KontextVstup | null {
  if (!o || typeof o !== "object") return null;
  const v = o as Record<string, unknown>;
  if (!jeKategorie(v.kategorie)) return null;
  const s = (x: unknown) => (typeof x === "string" && x ? x : null);
  const rok = typeof v.rok === "number" ? Math.round(v.rok) : null;
  return {
    kategorie: v.kategorie, propertyId: s(v.propertyId), tenantId: s(v.tenantId), leaseId: s(v.leaseId),
    sluzbaId: s(v.sluzbaId), settlementId: s(v.settlementId), statementId: s(v.statementId), rok,
  };
}

/** Dohleda nazvy a dopocita, co jde (najemce ze smlouvy, nemovitost ze sluzby). */
export async function rozresKontext(v: KontextVstup): Promise<KontextRozresen> {
  let { propertyId, tenantId } = v;
  const { leaseId, sluzbaId, settlementId, statementId } = v;

  const lease = leaseId ? await prisma.lease.findUnique({ where: { id: leaseId }, select: { propertyId: true, tenantId: true } }) : null;
  if (lease) { propertyId ??= lease.propertyId; tenantId ??= lease.tenantId; }

  const sluzba = sluzbaId ? await prisma.service.findUnique({ where: { id: sluzbaId } }) : null;
  if (sluzba) propertyId ??= sluzba.propertyId;

  const nemovitost = propertyId ? await prisma.property.findUnique({ where: { id: propertyId }, select: { name: true } }) : null;
  const najemce = tenantId ? await prisma.tenant.findUnique({ where: { id: tenantId } }) : null;
  const typy = sluzba ? await nactiTypySluzeb() : null;

  return {
    popisky: {
      kategorie: v.kategorie,
      propertyId: nemovitost ? propertyId : null,
      propertyNazev: nemovitost?.name ?? null,
      tenantId: najemce?.id ?? null,
      tenantPopisek: najemce ? `${cisloNajemce(najemce.cislo)} ${najemce.name}` : null,
      sluzbaKlic: sluzba?.id ?? null,
      sluzbaNazev: sluzba && typy ? `${nazevDruhu(typy, sluzba.type)} · ${sluzba.provider}` : null,
      rok: v.rok ?? null,
    },
    vazby: {
      propertyId: nemovitost ? propertyId ?? null : null, tenantId: najemce?.id ?? null,
      leaseId: lease ? leaseId ?? null : null, serviceId: sluzba?.id ?? null,
      settlementId: settlementId ?? null, statementId: statementId ?? null, rok: v.rok ?? null,
    },
  };
}

const isoDen = (d: Date) => d.toISOString().slice(0, 10);

/** Udaje pro citelny nazev souboru: nemovitost, najemce, sluzba, obdobi vyuctovani … */
export async function podkladNazvu(kategorie: KategorieKlic, v: KontextRozresen["vazby"]): Promise<PodkladNazvu> {
  const [nem, najemce, lease, sluzba, vyuct, vydane] = await Promise.all([
    v.propertyId ? prisma.property.findUnique({ where: { id: v.propertyId }, select: { name: true } }) : null,
    v.tenantId ? prisma.tenant.findUnique({ where: { id: v.tenantId }, select: { name: true } }) : null,
    v.leaseId ? prisma.lease.findUnique({ where: { id: v.leaseId }, select: { startDate: true } }) : null,
    v.serviceId ? prisma.service.findUnique({ where: { id: v.serviceId }, select: { type: true, provider: true } }) : null,
    v.settlementId ? prisma.serviceSettlement.findUnique({ where: { id: v.settlementId }, select: { periodFrom: true, periodTo: true, batchId: true } }) : null,
    v.statementId ? prisma.tenantStatement.findUnique({ where: { id: v.statementId }, select: { cislo: true, periodFrom: true, periodTo: true, snapshot: true } }) : null,
  ]);
  const typy = sluzba || vyuct?.batchId ? await nactiTypySluzeb() : null;
  let nazevSluzby = sluzba && typy ? `${nazevDruhu(typy, sluzba.type)} (${sluzba.provider})` : null;
  // Spolecny doklad vice sluzeb: nazev skupiny, jinak vycet druhu
  if (vyuct?.batchId && typy) {
    const casti = await prisma.serviceSettlement.findMany({ where: { batchId: vyuct.batchId }, select: { service: { select: { type: true, provider: true, groupName: true } } } });
    if (casti.length > 1) {
      const skupiny = [...new Set(casti.map((c) => c.service.groupName).filter(Boolean))];
      const dodavatele = [...new Set(casti.map((c) => c.service.provider))];
      nazevSluzby = skupiny.length === 1 && casti.every((c) => c.service.groupName)
        ? skupiny[0]!
        : `${[...new Set(casti.map((c) => nazevDruhu(typy, c.service.type)))].join(", ")}${dodavatele.length === 1 ? ` (${dodavatele[0]})` : ""}`;
    }
  }
  const najemceVydani = (vydane?.snapshot as { najemce?: { name?: string } } | null)?.najemce?.name;
  return {
    kategorie,
    nemovitost: nem?.name ?? null,
    najemce: najemce?.name ?? najemceVydani ?? null,
    sluzba: nazevSluzby,
    obdobi: vyuct ? [isoDen(vyuct.periodFrom), isoDen(vyuct.periodTo)] : vydane ? [isoDen(vydane.periodFrom), isoDen(vydane.periodTo)] : null,
    rok: v.rok,
    cislo: vydane?.cislo ?? null,
    od: lease ? isoDen(lease.startDate) : null,
  };
}

// --- Podepsany listek: zahajeni nahravani -> dokonceni ---

function tajemstvi(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) throw new Error("AUTH_SECRET není nastaven.");
  return new TextEncoder().encode(`soubory:${s}`);
}

export interface Listek {
  kontext: KontextVstup;
  name: string; mime: string; size: number; uid: string; slozka: string;
  /** Nazev, pod kterym soubor nahral uzivatel (kdyz ho aplikace prejmenovala) */
  puvodni?: string;
}

/** Klient s listkem nemuze dokoncit nic jineho, nez k cemu mu server dovolil nahravani. */
export async function podepisListek(l: Listek): Promise<string> {
  return new SignJWT({ l }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("2h").sign(tajemstvi());
}

export async function overListek(t: string): Promise<Listek | null> {
  try {
    const { payload } = await jwtVerify(t, tajemstvi());
    return (payload.l as Listek) ?? null;
  } catch {
    return null;
  }
}

export function puvod(req: Request): string {
  const h = req.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? new URL(req.url).host;
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
