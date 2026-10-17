/**
 * Parametry inzeratu vytazene AI z celeho textu stranky (Sreality detail), podle profilu
 * typu nemovitosti (byt, dum, garaz, pozemek, komercni — viz profily.ts).
 *
 * Bezi jen v nocnim skenu (GitHub Actions, secret ANTHROPIC_API_KEY). Kazdy inzerat
 * se cte jednou; vysledek se ulozi k inzeratu (Inzerat.parametry) a slouzi jako
 * vychozi hodnoty vlastnosti — rucni volba u zarazeni ma vzdy prednost.
 */
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { platneHodnoty, type Profil } from "./profily";

/** Levny model staci na cteni textu; jde prepnout promennou AI_MODEL. */
export const AI_MODEL = process.env.AI_MODEL || "claude-haiku-5-5";

/** Parametry vyctene pred zavedenim profilu se prectou znovu (nove vlastnosti, jine typy). */
export const PROFILY_OD = new Date("2026-10-17T22:00:00Z");

/** Co se uklada do Inzerat.parametry */
export interface AiParametry {
  profil: Profil["klic"];
  model: string;
  /** Hodnoty vlastnosti profilu (jen platne) */
  hodnoty: Record<string, string>;
  /** Zduvodneni k hlavnim vlastnostem */
  duvody: Record<string, string>;
  /** Drobne udaje (vytah, septik, 400 V...) */
  info: string[];
  shrnuti: string;
}

/** Schema odpovedi pro dany profil: kazda vlastnost jako text (normalizuje se pak), k hlavnim zduvodneni. */
function schema(profil: Profil) {
  const pole: Record<string, z.ZodType> = {};
  for (const v of profil.vlastnosti) {
    // Volny text misto vyctu: model obcas vrati jinou hodnotu a cely inzerat by propadl
    pole[v.klic] = z.string().nullable().describe(`${v.ai} Povolene hodnoty: ${Object.keys(v.moznosti).join(", ")}; kdyz to z textu nejde poznat, null.`);
    if (v.hlavni) pole[`${v.klic}Duvod`] = z.string().describe(`Kratka citace nebo zduvodneni k "${v.nazev}" (cesky, do 120 znaku); prazdne, kdyz null.`);
  }
  pole.info = z.array(z.string()).describe(`Do 6 kratkych udaju cesky (2–4 slova), ktere jsou v inzeratu a ovlivnuji cenu: ${profil.aiInfo}.`);
  pole.shrnuti = z.string().describe(`Jedna veta cesky: co je na teto nemovitosti (${profil.nazev}) podstatne pro cenu (stav, vybaveni, vady, lokalita).`);
  return z.object(pole);
}

const system = (profil: Profil) => `Jsi odhadce ceskych nemovitosti. Dostanes cely text stranky inzeratu (${profil.nazev}) ze Sreality
(vcetne menu, reklam a podobnych inzeratu — ty ignoruj, posuzuj jen tento jeden inzerat).
Vytahni parametry podle schematu. Vychazej jen z textu; kdyz udaj v textu neni, vrat null — nehadej.
U stavu ver vic konkretnim popisum (co je nove, co puvodni) nez obecnym pojmum typu "velmi dobry stav".
Zduvodneni pis cesky a strucne, idealne kratkou citaci z inzeratu.`;

/** Text stranky muze byt dlouhy (podobne inzeraty, paticka); popis inzeratu je na zacatku. */
const MAX_ZNAKU = 20_000;

export async function vytahniParametry(textStranky: string, profil: Profil, client = new Anthropic()): Promise<{ parametry: AiParametry; vstup: number; vystup: number }> {
  const odpoved = await client.messages.parse({
    model: AI_MODEL,
    max_tokens: 4000,
    // Klasifikace textu: hluboke premysleni nepotrebuje
    output_config: { effort: "low", format: zodOutputFormat(schema(profil)) },
    system: system(profil),
    messages: [{ role: "user", content: textStranky.slice(0, MAX_ZNAKU) }],
  });
  if (odpoved.stop_reason === "refusal") throw new Error("AI odmítla zpracovat text");
  const p = odpoved.parsed_output as Record<string, unknown> | null;
  if (!p) throw new Error(`AI nevrátila parametry (${odpoved.stop_reason})`);
  // Velka pismena: model obcas vrati "cihla" misto "CIHLA"
  const surove = Object.fromEntries(profil.vlastnosti.map((v) => [v.klic, typeof p[v.klic] === "string" ? (p[v.klic] as string).toUpperCase() : null]));
  const hodnoty = platneHodnoty(profil, surove);
  const duvody: Record<string, string> = {};
  for (const v of profil.vlastnosti) {
    const d = p[`${v.klic}Duvod`];
    if (v.klic in hodnoty && typeof d === "string" && d.trim()) duvody[v.klic] = d.trim();
  }
  return {
    parametry: {
      profil: profil.klic, model: AI_MODEL, hodnoty, duvody,
      info: Array.isArray(p.info) ? (p.info as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 6) : [],
      shrnuti: typeof p.shrnuti === "string" ? p.shrnuti : "",
    },
    vstup: odpoved.usage.input_tokens,
    vystup: odpoved.usage.output_tokens,
  };
}

/** Cena za milion tokenu (vstup, vystup) v USD pro odhad nakladu v logu. */
export const CENIK: Record<string, [number, number]> = {
  "claude-haiku-5-5": [0.1, 0.5],
  "claude-sonnet-5-5": [2, 10],
  "claude-opus-5-5": [4, 20],
};
