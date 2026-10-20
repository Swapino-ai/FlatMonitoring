/**
 * Co z AI parametru inzeratu ukazat v aplikaci: hodnoty vlastnosti profilu se zduvodnenim,
 * drobne udaje a jednovetne shrnuti. Ciste funkce, bez SDK.
 */
import { platneHodnoty, type Profil } from "./profily";
import type { PodminkyNajmu } from "./aiParametry";

export interface AiNahled {
  /** Hodnoty vlastnosti (klic -> hodnota) */
  hodnoty: Record<string, string>;
  /** Zduvodneni (klic -> text) */
  duvody: Record<string, string>;
  /** Drobne udaje k zobrazeni jako text */
  stitky: string[];
  shrnuti: string;
  /** Pronajem: jak se plati (najem, sluzby, energie, kauce, provize) */
  najem?: PodminkyNajmu | null;
}

export function nahledAi(parametry: unknown, profil: Profil): AiNahled | null {
  if (!parametry || typeof parametry !== "object") return null;
  const p = parametry as Record<string, unknown>;
  // Novy tvar (profily): { hodnoty, duvody, info, shrnuti }
  if (p.hodnoty && typeof p.hodnoty === "object") {
    return {
      hodnoty: platneHodnoty(profil, p.hodnoty),
      duvody: (p.duvody && typeof p.duvody === "object" ? p.duvody : {}) as Record<string, string>,
      stitky: Array.isArray(p.info) ? (p.info as unknown[]).filter((x): x is string => typeof x === "string") : [],
      shrnuti: typeof p.shrnuti === "string" ? p.shrnuti : "",
      najem: p.najem && typeof p.najem === "object" ? p.najem as PodminkyNajmu : null,
    };
  }
  // Starsi tvar (jen byty): hodnoty v koreni, zduvodneni jako typDomuDuvod
  const duvody: Record<string, string> = {};
  for (const v of profil.vlastnosti) if (typeof p[`${v.klic}Duvod`] === "string") duvody[v.klic] = p[`${v.klic}Duvod`] as string;
  const stitky: string[] = [];
  if (typeof p.podlazi === "number") stitky.push(p.podlazi === 0 ? "přízemí" : `${p.podlazi}. patro${typeof p.podlaziCelkem === "number" ? ` z ${p.podlaziCelkem}` : ""}`);
  if (p.vytah === true) stitky.push("výtah"); else if (p.vytah === false) stitky.push("bez výtahu");
  if (typeof p.energetickaTrida === "string") stitky.push(`energ. třída ${p.energetickaTrida}`);
  return { hodnoty: platneHodnoty(profil, p), duvody, stitky, shrnuti: typeof p.shrnuti === "string" ? p.shrnuti : "" };
}
