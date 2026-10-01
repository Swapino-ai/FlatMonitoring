import { prisma } from "./db";
import { VYCHOZI_DRUHY, type TypySluzeb } from "./categories";

/**
 * Druhy sluzeb z databaze. Pri prvnim pouziti se zalozi vychozi (elektrina, plyn, ...),
 * potom uz o nich rozhoduje uzivatel. Sluzby odkazuji klicem, takze prejmenovani
 * nic nerozbije.
 */
export async function nactiTypySluzeb(): Promise<TypySluzeb> {
  // Dva dotazy najednou; prazdna tabulka se pozna z vysledku, ne z extra dotazu
  let [radky, pouzite] = await Promise.all([
    prisma.serviceType.findMany({ orderBy: [{ sort: "asc" }, { name: "asc" }] }),
    prisma.service.findMany({ distinct: ["type"], select: { type: true } }),
  ]);

  if (radky.length === 0) {
    await prisma.serviceType.createMany({
      data: Object.entries(VYCHOZI_DRUHY).map(([key, d], i) => ({
        key, name: d.name, icon: d.icon, chargedByDefault: d.chargedByDefault, sort: i,
      })),
      skipDuplicates: true,
    });
    radky = await prisma.serviceType.findMany({ orderBy: [{ sort: "asc" }, { name: "asc" }] });
  }

  const typy: TypySluzeb = Object.fromEntries(
    radky.map((r) => [r.key, { name: r.name, icon: r.icon, chargedByDefault: r.chargedByDefault }]),
  );
  // Sluzba s druhem, ktery uz v tabulce neni, se porad musi dat vybrat a pojmenovat
  for (const { type } of pouzite) {
    if (!typy[type]) typy[type] = VYCHOZI_DRUHY[type] ?? { name: type, icon: "tri", chargedByDefault: false };
  }
  return typy;
}
