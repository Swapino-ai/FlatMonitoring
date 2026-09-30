import { SignJWT, jwtVerify } from "jose";
import { prisma } from "./db";
import { nazevDruhu } from "./categories";
import { nactiTypySluzeb } from "./typySluzeb";
import { cisloNajemce } from "./najemci";
import { jeKategorie, type KategorieKlic, type KontextPopisky } from "./dokumenty";

/** Co klient rekne o tom, kam soubor patri — jen identifikatory, popisky se nacitaji z databaze. */
export interface KontextVstup {
  kategorie: KategorieKlic;
  propertyId?: string | null;
  tenantId?: string | null;
  leaseId?: string | null;
  sluzbaId?: string | null;
  settlementId?: string | null;
  rok?: number | null;
}

export interface KontextRozresen {
  popisky: KontextPopisky;
  vazby: { propertyId: string | null; tenantId: string | null; leaseId: string | null; serviceId: string | null; settlementId: string | null; rok: number | null };
}

export function zVstupu(o: unknown): KontextVstup | null {
  if (!o || typeof o !== "object") return null;
  const v = o as Record<string, unknown>;
  if (!jeKategorie(v.kategorie)) return null;
  const s = (x: unknown) => (typeof x === "string" && x ? x : null);
  const rok = typeof v.rok === "number" ? Math.round(v.rok) : null;
  return {
    kategorie: v.kategorie, propertyId: s(v.propertyId), tenantId: s(v.tenantId), leaseId: s(v.leaseId),
    sluzbaId: s(v.sluzbaId), settlementId: s(v.settlementId), rok,
  };
}

/** Dohleda nazvy a dopocita, co jde (najemce ze smlouvy, nemovitost ze sluzby). */
export async function rozresKontext(v: KontextVstup): Promise<KontextRozresen> {
  let { propertyId, tenantId } = v;
  const { leaseId, sluzbaId, settlementId } = v;

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
      settlementId: settlementId ?? null, rok: v.rok ?? null,
    },
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
