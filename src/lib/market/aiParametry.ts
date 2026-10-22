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
export const PROFILY_OD = new Date("2026-10-22T20:00:00Z");
/** Najmy prectene pred ctenim platebnich podminek se prectou znovu. */
export const NAJEM_OD = new Date("2026-10-20T15:00:00Z");

/** Jak se u pronajmu plati (z textu inzeratu); castky mesicne v Kc, null = v textu neni. */
export interface PodminkyNajmu {
  najem: number | null;
  /** Zalohy na sluzby / poplatky SVJ mesicne (soucet) */
  sluzby: number | null;
  /** Rozpis sluzeb, jak je v inzeratu (castka null = uvedeno bez castky) */
  polozky?: { nazev: string; castka: number | null }[];
  /** Energie (elektrina, plyn): v cene / zvlast / zaloha */
  energie: string | null;
  /** Kauce v Kc (kdyz je uvedena v mesicich, prepocet z najmu) */
  kauce: number | null;
  /** Provize RK v Kc */
  provize: number | null;
  /** Jedna veta: co vse najemce mesicne plati */
  popis: string;
}

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
  /** Jen u pronajmu: platebni podminky */
  najem?: PodminkyNajmu;
}

/** Schema odpovedi pro dany profil: kazda vlastnost jako text (normalizuje se pak), k hlavnim zduvodneni. */
function schema(profil: Profil, pronajem: boolean) {
  const pole: Record<string, z.ZodType> = {};
  for (const v of profil.vlastnosti) {
    // Volny text misto vyctu: model obcas vrati jinou hodnotu a cely inzerat by propadl
    pole[v.klic] = z.string().nullable().describe(`${v.ai} Povolene hodnoty: ${Object.keys(v.moznosti).join(", ")}; kdyz to z textu nejde poznat, null.`);
    if (v.hlavni) pole[`${v.klic}Duvod`] = z.string().describe(`Kratka citace nebo zduvodneni k "${v.nazev}" (cesky, do 120 znaku); prazdne, kdyz null.`);
  }
  pole.info = z.array(z.string()).describe(`Do 6 kratkych udaju cesky (2–4 slova), ktere jsou v inzeratu a ovlivnuji cenu: ${profil.aiInfo}.`);
  if (pronajem) {
    pole.najem = z.object({
      najem: z.number().nullable().describe("Cista mesicni cena najmu v Kc bez sluzeb a energii; null, kdyz z textu nejde oddelit."),
      sluzby: z.number().nullable().describe("Soucet mesicnich zaloh na sluzby a poplatku (voda, teplo, SVJ, fond oprav, internet, zalohy na energie, pokud jsou zvlast vycislene) v Kc; null, kdyz nejsou uvedene."),
      polozky: z.array(z.object({
        nazev: z.string().describe("Polozka cesky, kratce (napr. 'Voda', 'Teplo', 'Fond oprav', 'Elektřina — záloha', 'Internet')."),
        castka: z.number().nullable().describe("Mesicne v Kc; null, kdyz inzerat polozku zminuje bez castky."),
      })).describe("Rozpis sluzeb a poplatku tak, jak je v inzeratu; prazdne, kdyz rozpis neni."),
      energie: z.string().nullable().describe("Energie (elektrina, plyn): 'v cene', 'zvlast' nebo 'zaloha X Kc'; null, kdyz neni uvedeno."),
      kauce: z.number().nullable().describe("Vratna kauce v Kc; kdyz je v mesicich, prepocti z najmu (s poplatky, pokud tak text pise); null, kdyz neni uvedena."),
      provize: z.number().nullable().describe("Provize realitni kancelare v Kc; 0 kdyz text rika bez provize; null, kdyz neni uvedena."),
      popis: z.string().describe("Jedna kratka veta cesky: kolik najemce mesicne celkem plati a za co (najem + sluzby + energie), pripadne kauce a provize."),
    }).describe("Platebni podminky pronajmu podle textu inzeratu.");
  }
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

export async function vytahniParametry(textStranky: string, profil: Profil, client = new Anthropic(), pronajem = false): Promise<{ parametry: AiParametry; vstup: number; vystup: number }> {
  const odpoved = await client.messages.parse({
    model: AI_MODEL,
    max_tokens: 4000,
    // Klasifikace textu: hluboke premysleni nepotrebuje
    output_config: { effort: "low", format: zodOutputFormat(schema(profil, pronajem)) },
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
      ...(pronajem && p.najem && typeof p.najem === "object" ? { najem: podminky(p.najem as Record<string, unknown>) } : {}),
    },
    vstup: odpoved.usage.input_tokens,
    vystup: odpoved.usage.output_tokens,
  };
}

const kladne = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? Math.round(x) : null);
function podminky(p: Record<string, unknown>): PodminkyNajmu {
  return {
    najem: kladne(p.najem), sluzby: kladne(p.sluzby), kauce: kladne(p.kauce), provize: kladne(p.provize),
    polozky: Array.isArray(p.polozky)
      ? (p.polozky as Record<string, unknown>[]).filter((x) => x && typeof x.nazev === "string" && x.nazev.trim())
        .map((x) => ({ nazev: String(x.nazev).trim(), castka: kladne(x.castka) })).slice(0, 15)
      : [],
    energie: typeof p.energie === "string" && p.energie.trim() ? p.energie.trim() : null,
    popis: typeof p.popis === "string" ? p.popis.trim() : "",
  };
}

/** Cena za milion tokenu (vstup, vystup) v USD pro odhad nakladu v logu. */
export const CENIK: Record<string, [number, number]> = {
  "claude-haiku-5-5": [0.1, 0.5],
  "claude-sonnet-5-5": [2, 10],
  "claude-opus-5-5": [4, 20],
};
