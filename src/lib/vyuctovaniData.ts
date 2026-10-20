import { prisma } from "./db";
import { nazevDruhu } from "./categories";
import { nactiTypySluzeb } from "./typySluzeb";
import { cisloNajemce } from "./najemci";
import { pronajimatelNemovitosti, pronajimatelZRef } from "./provozovatel";
import { nactiStrany } from "./strany";
import type { SluzbaVyuctovani } from "./vyuctovani";
import { sluzbyProNajemce, type DrivejsiVyuctovani, type NajemProVyuctovani } from "./vyuctovaniNajemce";
import { DRUH_MERAKU_MAP, druhyMerakuProSluzbu, type MerakSeStavy } from "./meraky";
import type { PolozkaZalohy } from "./zalohy";

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Vsechno, co vypocet vyuctovani pro najemce potrebuje, nactene z databaze.
 * Pouziva server pri vydani — cisla se nikdy neberou z toho, co poslal prohlizec.
 */
export async function nactiVstupyVyuctovani(propertyId: string) {
  const strany = await nactiStrany();
  const [nemovitost, smlouvy, sluzby, typy, meraky, vydana] = await Promise.all([
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
    prisma.merak.findMany({ where: { propertyId }, include: { stavy: true } }),
    prisma.tenantStatement.findMany({ where: { propertyId, status: { not: "STORNO" } }, select: { leaseId: true, periodFrom: true, periodTo: true, snapshot: true } }),
  ]);
  if (!nemovitost) return null;

  const najmy: (NajemProVyuctovani & { tenantId: string | null })[] = smlouvy.map((n) => ({
    id: n.id, nazev: n.tenant?.name ?? n.tenantName, od: iso(n.startDate), do: n.endDate ? iso(n.endDate) : null,
    utilitiesMonthly: n.utilitiesMonthly,
    historieZaloh: n.advanceChanges.map((z) => ({ validFrom: z.validFrom, amount: z.amount, items: z.items as PolozkaZalohy[] | null })),
    advanceItems: n.advanceItems as PolozkaZalohy[] | null,
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

  // Pruvodce: sluzby se skupinami, platnosti a meraky
  const merakySeStavy: MerakSeStavy[] = meraky.map((m) => ({
    id: m.id, druh: m.druh, nazev: m.nazev, aktivni: m.aktivni, dvoutarif: m.dvoutarif, nahrazujeId: m.nahrazujeId, nulovani: m.nulovani,
    stavy: m.stavy.map((x) => ({ datum: iso(x.datum), hodnota: x.hodnota, hodnota2: x.hodnota2, vynulovanoPo: x.vynulovanoPo, udalost: x.udalost, leaseId: x.leaseId, vyuctovani: x.vyuctovani })),
  }));
  const sluzbyNajemce = sluzbyProNajemce(
    sluzby, sluzbyVyuct.flatMap((x) => x.vyuctovani.map((v) => ({ ...v, serviceId: x.id }))), typy, merakySeStavy,
    druhyMerakuProSluzbu, (d) => DRUH_MERAKU_MAP.get(d)?.jednotka ?? null, (t) => nazevDruhu(typy, t),
  );
  /** Drive vydana vyuctovani smlouvy — odkud se ktera sluzba pocita. */
  const drivejsiPro = (leaseId: string): DrivejsiVyuctovani[] => vydana.filter((x) => x.leaseId === leaseId).map((x) => ({
    od: iso(x.periodFrom), do: iso(x.periodTo), sluzbyDo: (x.snapshot as { sluzbyDo?: Record<string, string> } | null)?.sluzbyDo ?? null,
  }));

  const adresa = (u: { street: string | null; city: string | null; zip: string | null }) =>
    [u.street, [u.zip, u.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");

  return {
    nemovitost: { nazev: nemovitost.name, adresa: `${nemovitost.street}, ${nemovitost.zip} ${nemovitost.city}` },
    // Pronajimatel je provozovatel nemovitosti; bez nej vlastnik s nejvetsim podilem
    pronajimatel: pronajimatelNemovitosti(nemovitost),
    /** Pronajimatel konkretni smlouvy: vybrany na smlouve, jinak provozovatel nemovitosti. */
    pronajimatelPro: (ref: string | null) => pronajimatelZRef(ref, strany, pronajimatelNemovitosti(nemovitost)),
    smlouvy, najmy, sluzby: sluzbyVyuct, sluzbyNajemce, drivejsiPro,
    najemceInfo: (n: (typeof smlouvy)[number]) => ({
      cislo: n.tenant ? cisloNajemce(n.tenant.cislo) : null,
      name: n.tenant?.name ?? n.tenantName,
      adresa: adresa({ street: n.tenant?.street ?? n.tenantStreet, city: n.tenant?.city ?? n.tenantCity, zip: n.tenant?.zip ?? n.tenantZip }),
      email: n.tenant?.email ?? n.tenantEmail, phone: n.tenant?.phone ?? n.tenantPhone,
      ucet: n.tenant?.account ?? n.tenantAccount,
    }),
  };
}
