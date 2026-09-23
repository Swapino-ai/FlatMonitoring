/**
 * Provozni denik skenu.
 *
 * Bez nej nejde poznat, jestli nocni sken probehl: prazdna historie odhadu
 * muze znamenat "trh se nehnul" stejne jako "uz tyden to pada".
 *
 * Zapis denikem nesmi shodit sken — kdyz selze ulozeni zaznamu, sken bezi dal.
 */
import { prisma } from "./db";

export type Spoust = "CRON_NAJEM" | "CRON_TRH" | "RUCNI";

export interface ZacatekBehu {
  trigger: Spoust;
  dealType: "SALE" | "RENT";
  propertyId?: string | null;
  propertyName: string;
  city: string;
  category: string;
}

export interface KonecBehu {
  status: "OK" | "PRAZDNY" | "SELHALO";
  listingsFound?: number;
  okruhKm?: number | null;
  result?: string | null;
  message?: string | null;
}

/** Zalozi zaznam a vrati jeho id. Null = zapis se nepovedl, sken pokracuje. */
export async function zacniBeh(z: ZacatekBehu): Promise<string | null> {
  try {
    const r = await prisma.scanRun.create({
      data: { ...z, propertyId: z.propertyId ?? null, status: "SELHALO" },
      select: { id: true },
    });
    return r.id;
  } catch {
    return null;
  }
}

/**
 * Uzavre zaznam. Vychozi stav je SELHALO, takze beh prerusny uprostred
 * (vyprsel limit funkce, spadl runner) zustane v deniku jako selhany —
 * to je pravdivejsi nez tvarit se, ze nikdy nezacal.
 */
export async function ukonciBeh(id: string | null, k: KonecBehu): Promise<void> {
  if (!id) return;
  try {
    await prisma.scanRun.update({
      where: { id },
      data: {
        finishedAt: new Date(),
        status: k.status,
        listingsFound: k.listingsFound ?? 0,
        okruhKm: k.okruhKm ?? null,
        result: k.result ?? null,
        // Hlaska muze byt dlouhá; do prehledu se stejne vejde jen zacatek
        message: k.message?.slice(0, 500) ?? null,
      },
    });
  } catch {
    // Denik je pomucka, ne ucel — selhani zapisu nesmi shodit sken
  }
}

/** Starsi zaznamy uz nikdo nepotrebuje a jen by nafukovaly databazi. */
export async function uklidDenik(dnu = 90): Promise<number> {
  const hranice = new Date();
  hranice.setDate(hranice.getDate() - dnu);
  try {
    const r = await prisma.scanRun.deleteMany({ where: { startedAt: { lt: hranice } } });
    return r.count;
  } catch {
    return 0;
  }
}
