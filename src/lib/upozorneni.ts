/**
 * Upozorneni na hlavni strance: co ceka na akci uzivatele (zarazeni nabidek z trhu,
 * platby ke kontrole, chybejici odecty, nezaplacene platby ...). Kazde vede tam, kde se resi.
 */
import { prisma } from "./db";
import { denISO } from "./format";
import { druhyMerakuProSluzbu, udalostiNajmu } from "./meraky";
import { nactiTypySluzeb } from "./typySluzeb";
import type { NavrzenaPlatba } from "./pravidelnePlatby";

export interface Upozorneni {
  klic: string;
  uroven: "bad" | "warn" | "info";
  /** Ikona z components/Ikony */
  ikona: string;
  text: string;
  detail?: string;
  href: string;
  akce: string;
}

const kc = (n: number) => `${Math.round(n).toLocaleString("cs-CZ")} Kč`;
const tvar = (n: number, jedna: string, dve: string, pet: string) => (n === 1 ? jedna : n >= 2 && n <= 4 ? dve : pet);

export async function nactiUpozorneni(
  nemovitosti: { id: string; name: string; status: string }[],
  navrhy: Map<string, NavrzenaPlatba[]>,
  dnes = new Date(),
): Promise<Upozorneni[]> {
  const aktivni = nemovitosti.filter((p) => p.status !== "SOLD");
  const ids = aktivni.map((p) => p.id);
  const nazev = new Map(aktivni.map((p) => [p.id, p.name]));
  const dnesISO = denISO(dnes);
  const out: Upozorneni[] = [];
  if (!ids.length) return out;

  const [navrhyTrhu, keKontrole, vydana, sMeraky] = await Promise.all([
    prisma.zarazeniInzeratu.findMany({ where: { propertyId: { in: ids }, stav: "NAVRH" }, select: { propertyId: true, inzerat: { select: { dealType: true } } } }),
    prisma.bankovniPohyb.count({ where: { stav: "KE_KONTROLE" } }).catch(() => 0),
    prisma.tenantStatement.findMany({ where: { propertyId: { in: ids }, status: { in: ["VYDANO", "ODESLANO"] }, dueDate: { lt: dnes } }, select: { propertyId: true, cislo: true, result: true } }),
    prisma.property.findMany({
      where: { id: { in: ids }, meraky: { some: {} } },
      select: {
        id: true,
        meraky: { select: { druh: true, stavy: { select: { leaseId: true, udalost: true, vyuctovani: true } } } },
        services: { select: { type: true, settlements: { select: { id: true } } } },
        leases: { select: { id: true, tenantId: true, tenantName: true, startDate: true, endDate: true, isActive: true } },
      },
    }),
  ]);

  // 1) Nabidky z trhu ke zarazeni (prodej / najem)
  const trh = new Map<string, { SALE: number; RENT: number }>();
  for (const z of navrhyTrhu) {
    const t = trh.get(z.propertyId) ?? { SALE: 0, RENT: 0 };
    if (z.inzerat.dealType === "RENT") t.RENT++; else t.SALE++;
    trh.set(z.propertyId, t);
  }
  for (const [id, t] of trh) {
    const casti = [t.SALE ? `${t.SALE} ${tvar(t.SALE, "nabídka prodeje", "nabídky prodeje", "nabídek prodeje")}` : "", t.RENT ? `${t.RENT} ${tvar(t.RENT, "nabídka nájmu", "nabídky nájmu", "nabídek nájmu")}` : ""].filter(Boolean);
    out.push({
      klic: `trh:${id}`, uroven: "info", ikona: "trend", text: `${nazev.get(id)}: projít nové nabídky z trhu`,
      detail: `Ke zařazení ${casti.join(" a ")}.`, href: `/properties/${id}/trh?typ=${t.SALE ? "SALE" : "RENT"}`, akce: "Zařadit",
    });
  }

  // 2) Platby z banky ke kontrole
  if (keKontrole > 0) {
    out.push({
      klic: "banka", uroven: "warn", ikona: "penize", text: `Banka: ${keKontrole} ${tvar(keKontrole, "platba čeká", "platby čekají", "plateb čeká")} na spárování`,
      detail: "Aplikace si nebyla jistá, komu platba patří.", href: "/banka", akce: "Spárovat",
    });
  }

  // 3) Nezaplacene prijmy (najem, zalohy) po splatnosti za posledni 3 mesice
  const odISO = denISO(new Date(dnes.getTime() - 92 * 86400000));
  const poSplatnosti = denISO(new Date(dnes.getTime() - 5 * 86400000));
  for (const p of aktivni) {
    const dluh = (navrhy.get(p.id) ?? []).filter((x) => x.castka > 0 && x.stav === "nezaplaceno" && x.datum >= odISO && x.datum <= poSplatnosti);
    if (!dluh.length) continue;
    const najemci = [...new Set(dluh.map((x) => x.skupina.nazev))];
    out.push({
      klic: `dluh:${p.id}`, uroven: "bad", ikona: "penize", text: `${p.name}: nezaplaceno ${kc(dluh.reduce((a, x) => a + x.castka, 0))} po splatnosti`,
      detail: `${najemci.join(", ")} · ${[...new Set(dluh.map((x) => `${Number(x.mesic.slice(5))}/${x.mesic.slice(0, 4)}`))].join(", ")}`,
      href: `/properties/${p.id}?list=pohyby`, akce: "Zkontrolovat",
    });
  }

  // 4) Vydana vyuctovani s neuhrazenym nedoplatkem / nevracenym preplatkem po terminu
  for (const v of vydana) {
    out.push({
      klic: `vyuct:${v.cislo}`, uroven: "warn", ikona: "dokument",
      text: `${nazev.get(v.propertyId)}: vyúčtování ${v.cislo} po termínu`,
      detail: v.result < 0 ? `Nájemce zatím neuhradil nedoplatek ${kc(-v.result)}.` : `Přeplatek ${kc(v.result)} zatím není označený jako vrácený.`,
      href: `/properties/${v.propertyId}?list=vyuctovani`, akce: "Vyřídit",
    });
  }

  // 5) Meraky: predani / vraceni bez stavu a vyuctovani dodavatele bez konecneho odectu
  const typy = sMeraky.length ? await nactiTypySluzeb() : {};
  for (const p of sMeraky) {
    const druhy = new Set(p.meraky.map((m) => m.druh));
    const stavy = p.meraky.flatMap((m) => m.stavy);
    const bezStavu = udalostiNajmu(p.leases, dnes).filter((u) => !u.budouci && u.datum && u.datum <= dnesISO
      && !stavy.some((s) => s.leaseId === u.leaseId && s.udalost === u.udalost));
    const prirazena = new Set(stavy.flatMap((s) => s.vyuctovani));
    const bezOdectu = p.services.filter((s) => druhyMerakuProSluzbu(typy[s.type]?.icon).some((d) => druhy.has(d)))
      .flatMap((s) => s.settlements).filter((v) => !prirazena.has(v.id));
    if (!bezStavu.length && !bezOdectu.length) continue;
    const casti = [
      bezStavu.length ? `${bezStavu.length} ${tvar(bezStavu.length, "předání/vrácení bez stavů", "předání/vrácení bez stavů", "předání/vrácení bez stavů")}` : "",
      bezOdectu.length ? `${bezOdectu.length} ${tvar(bezOdectu.length, "vyúčtování bez konečného odečtu", "vyúčtování bez konečného odečtu", "vyúčtování bez konečného odečtu")}` : "",
    ].filter(Boolean);
    out.push({
      klic: `meraky:${p.id}`, uroven: "warn", ikona: "blesk", text: `${nazev.get(p.id)}: doplnit odečty měřáků`,
      detail: casti.join(" · "), href: `/properties/${p.id}/meraky`, akce: "Doplnit",
    });
  }

  const poradi = { bad: 0, warn: 1, info: 2 };
  return out.sort((a, b) => poradi[a.uroven] - poradi[b.uroven]);
}
