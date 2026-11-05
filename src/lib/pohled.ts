/** Nacteni portfolia z pohledu prihlaseneho uzivatele. */

import type { VahaNemovitosti } from "./series";
import { analyzeProperty, loadProperties, type PropertyAnalysis, type PropertyWithRelations } from "./portfolio";
import { nasobitel, podilNaUveru, type Pohled } from "./ownership";
import { aktualniPohled, kdoPohledu } from "./ownership.server";
import type { SessionUser } from "./auth";

export interface PohledNaPortfolio {
  pohled: Pohled;
  /** Cisi podil se zobrazuje (userId) */
  kdo: string;
  /** Vahy nemovitosti pro grafy a cash flow v pohledu "podil" */
  vahy?: Map<string, VahaNemovitosti>;
  properties: PropertyWithRelations[];
  analyses: PropertyAnalysis[];
  /** Existuje aspon jeden byt se zadanymi spoluvlastniky? Jinak prepinac nema smysl. */
  maSpoluvlastnictvi: boolean;
}

export async function nactiPortfolio(user: SessionUser, asOf = new Date()): Promise<PohledNaPortfolio> {
  const pohled = await aktualniPohled();
  // Cisi podil: muj, nebo vlastnika vybraneho v hlavicce
  const kdo = await kdoPohledu(user.id);
  const properties = await loadProperties();

  const analyses = properties.map((p) =>
    analyzeProperty(p, asOf, nasobitel(pohled, p.owners, kdo), (l) => podilNaUveru(pohled, l, p.owners, kdo)),
  );

  // Prepinac ukazujeme jen tam, kde nekdo skutecne vlastni jen cast
  const maSpoluvlastnictvi = properties.some(
    (p) => p.owners.length > 0 && p.owners.some((o) => o.share < 100),
  );

  // Vahy pro grafy a cash flow (v pohledu "vse" zadne — cele castky)
  const vahy = pohled === "moje"
    ? new Map<string, VahaNemovitosti>(properties.map((p, i) => [p.id, {
        podil: analyses[i].podil, podilSplatek: analyses[i].podilSplatek,
        uver: (id: string) => { const l = p.loans.find((x) => x.id === id); return l ? podilNaUveru(pohled, l, p.owners, kdo) : analyses[i].podilSplatek; },
      }]))
    : undefined;

  return { pohled, kdo, properties, analyses, maSpoluvlastnictvi, vahy };
}
