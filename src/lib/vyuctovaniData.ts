import { prisma } from "./db";
import { nazevDruhu } from "./categories";
import { nactiTypySluzeb } from "./typySluzeb";
import { cisloNajemce } from "./najemci";
import { pronajimatelNemovitosti, pronajimatelZRef } from "./provozovatel";
import { nactiStrany } from "./strany";
import type { NajemVstup, SluzbaVyuctovani } from "./vyuctovani";

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Vsechno, co vypocet vyuctovani pro najemce potrebuje, nactene z databaze.
 * Pouziva server pri vydani — cisla se nikdy neberou z toho, co poslal prohlizec.
 */
export async function nactiVstupyVyuctovani(propertyId: string) {
  const strany = await nactiStrany();
  const [nemovitost, smlouvy, sluzby, typy] = await Promise.all([
    prisma.property.findUnique({
      where: { id: propertyId },
      include: { operator: true, owners: { include: { user: true }, orderBy: { share: "desc" } } },
    }),
    prisma.lease.findMany({
      where: { propertyId }, include: { tenant: true, advanceChanges: { orderBy: { validFrom: "asc" } } },
    }),
    prisma.service.findMany({
      where: { propertyId },
      include: { settlements: { include: { readings: true }, orderBy: { periodFrom: "asc" } } },
    }),
    nactiTypySluzeb(),
  ]);
  if (!nemovitost) return null;

  const najmy: (NajemVstup & { tenantId: string | null })[] = smlouvy.map((n) => ({
    id: n.id, nazev: n.tenant?.name ?? n.tenantName, od: iso(n.startDate), do: n.endDate ? iso(n.endDate) : null,
    utilitiesMonthly: n.utilitiesMonthly,
    historieZaloh: n.advanceChanges.map((z) => ({ validFrom: z.validFrom, amount: z.amount })),
    tenantId: n.tenantId,
  }));

  const sluzbyVyuct: SluzbaVyuctovani[] = sluzby.map((s) => ({
    id: s.id, nazev: nazevDruhu(typy, s.type), dodavatel: s.provider, prectena: s.chargedToTenant,
    vyuctovani: s.settlements.map((v) => ({
      id: v.id, od: iso(v.periodFrom), do: iso(v.periodTo), naklad: v.totalCost, zalohyDodavateli: v.supplierAdvances,
      rezim: v.splitMode === "READINGS" ? "READINGS" as const : "DAYS" as const,
      jednotka: v.readingUnit, spotrebaVlastnik: v.ownerConsumption,
      odecty: Object.fromEntries(v.readings.map((o) => [o.leaseId, o.consumption])),
    })),
  }));

  const adresa = (u: { street: string | null; city: string | null; zip: string | null }) =>
    [u.street, [u.zip, u.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");

  return {
    nemovitost: { nazev: nemovitost.name, adresa: `${nemovitost.street}, ${nemovitost.zip} ${nemovitost.city}` },
    // Pronajimatel je provozovatel nemovitosti; bez nej vlastnik s nejvetsim podilem
    pronajimatel: pronajimatelNemovitosti(nemovitost),
    /** Pronajimatel konkretni smlouvy: vybrany na smlouve, jinak provozovatel nemovitosti. */
    pronajimatelPro: (ref: string | null) => pronajimatelZRef(ref, strany, pronajimatelNemovitosti(nemovitost)),
    smlouvy, najmy, sluzby: sluzbyVyuct,
    najemceInfo: (n: (typeof smlouvy)[number]) => ({
      cislo: n.tenant ? cisloNajemce(n.tenant.cislo) : null,
      name: n.tenant?.name ?? n.tenantName,
      adresa: adresa({ street: n.tenant?.street ?? n.tenantStreet, city: n.tenant?.city ?? n.tenantCity, zip: n.tenant?.zip ?? n.tenantZip }),
      email: n.tenant?.email ?? n.tenantEmail, phone: n.tenant?.phone ?? n.tenantPhone,
      ucet: n.tenant?.account ?? n.tenantAccount,
    }),
  };
}
