import { prisma } from "./db";

/** Kontaktni udaje najemce — jedna pravda v tabulce Tenant, smlouvy nesou zrcadlo. */
export interface KontaktNajemce {
  name: string;
  email: string | null;
  phone: string | null;
  street: string | null;
  city: string | null;
  zip: string | null;
  account: string | null;
}

export const cisloNajemce = (n: number) => `N-${String(n).padStart(4, "0")}`;

/** Zrcadlo kontaktu ve smlouvach najemce, at ostatni cast aplikace cte jako drive. */
export async function synchronizujSmlouvy(tenantId: string): Promise<void> {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!t) return;
  await prisma.lease.updateMany({
    where: { tenantId },
    data: {
      tenantName: t.name, tenantEmail: t.email, tenantPhone: t.phone,
      tenantStreet: t.street, tenantCity: t.city, tenantZip: t.zip, tenantAccount: t.account,
    },
  });
}

/**
 * Najde najemce podle e-mailu, nebo zalozi noveho. Existujici najemce se aktualizuje
 * podle formulare — smlouva, ktera na nej odkazuje, tak neznici identitu.
 */
export async function urciNajemce(kontakt: KontaktNajemce, tenantId: string | null): Promise<string> {
  let id = tenantId && (await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } }))?.id || null;

  if (!id && kontakt.email) {
    id = (await prisma.tenant.findFirst({
      where: { email: { equals: kontakt.email, mode: "insensitive" } }, select: { id: true },
    }))?.id ?? null;
  }

  if (id) {
    await prisma.tenant.update({ where: { id }, data: kontakt });
    return id;
  }
  return (await prisma.tenant.create({ data: kontakt })).id;
}

/**
 * Smlouvy z doby pred databazi najemniku nemaji tenantId. Doplni se z jejich udaju:
 * stejny e-mail, nebo (bez e-mailu) stejne jmeno = stejny clovek. Idempotentni.
 */
export async function zajistiNajemce(): Promise<void> {
  const bez = await prisma.lease.findMany({ where: { tenantId: null }, orderBy: { startDate: "asc" } });
  if (bez.length === 0) return;

  const klic = (l: { tenantEmail: string | null; tenantName: string }) =>
    l.tenantEmail ? `e:${l.tenantEmail.toLowerCase()}` : `n:${l.tenantName.trim().toLowerCase()}`;
  const vytvoreni = new Map<string, string>();

  for (const l of bez) {
    const k = klic(l);
    let id = vytvoreni.get(k);
    if (!id) {
      const existujici = l.tenantEmail
        ? await prisma.tenant.findFirst({ where: { email: { equals: l.tenantEmail, mode: "insensitive" } }, select: { id: true } })
        : await prisma.tenant.findFirst({ where: { email: null, name: { equals: l.tenantName.trim(), mode: "insensitive" } }, select: { id: true } });
      id = existujici?.id ?? (await prisma.tenant.create({
        data: {
          name: l.tenantName, email: l.tenantEmail, phone: l.tenantPhone,
          street: l.tenantStreet, city: l.tenantCity, zip: l.tenantZip, account: l.tenantAccount,
        },
      })).id;
      vytvoreni.set(k, id);
    }
    await prisma.lease.update({ where: { id: l.id }, data: { tenantId: id } });
  }
}
