/** Nacteni portfolia z pohledu prihlaseneho uzivatele. */

import { analyzeProperty, loadProperties, type PropertyAnalysis, type PropertyWithRelations } from "./portfolio";
import { nasobitel, type Pohled } from "./ownership";
import { aktualniPohled } from "./ownership.server";
import type { SessionUser } from "./auth";

export interface PohledNaPortfolio {
  pohled: Pohled;
  properties: PropertyWithRelations[];
  analyses: PropertyAnalysis[];
  /** Existuje aspon jeden byt se zadanymi spoluvlastniky? Jinak prepinac nema smysl. */
  maSpoluvlastnictvi: boolean;
}

export async function nactiPortfolio(user: SessionUser, asOf = new Date()): Promise<PohledNaPortfolio> {
  const pohled = await aktualniPohled();
  const properties = await loadProperties();

  const analyses = properties.map((p) =>
    analyzeProperty(p, asOf, nasobitel(pohled, p.owners, user.id)),
  );

  // Prepinac ukazujeme jen tam, kde nekdo skutecne vlastni jen cast
  const maSpoluvlastnictvi = properties.some(
    (p) => p.owners.length > 0 && p.owners.some((o) => o.share < 100),
  );

  return { pohled, properties, analyses, maSpoluvlastnictvi };
}
