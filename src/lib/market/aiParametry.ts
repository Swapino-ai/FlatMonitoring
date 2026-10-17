/**
 * Parametry inzeratu vytazene AI z celeho textu stranky (Sreality detail).
 *
 * Bezi jen v nocnim skenu (GitHub Actions, secret ANTHROPIC_API_KEY). Kazdy inzerat
 * se cte jednou; vysledek se ulozi k inzeratu (Inzerat.parametry) a slouzi jako
 * vychozi typ domu a stav bytu — rucni volba u zarazeni ma vzdy prednost.
 */
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

/** Levny model staci na cteni textu; jde prepnout promennou AI_MODEL. */
export const AI_MODEL = process.env.AI_MODEL || "claude-haiku-5-5";

const Parametry = z.object({
  // Volny text misto vyctu: model obcas vrati jinou hodnotu (napr. SMISENA) a cely inzerat by
  // propadl; neznama hodnota se pak bere jako JINY (viz normalizace nize)
  typDomu: z.string().nullable()
    .describe("Typ domu: PANEL, CIHLA, NOVOSTAVBA (dum postaveny nebo dokonceny v poslednich ~5 letech), nebo JINY (smisena, skeletova, drevostavba...)."),
  typDomuDuvod: z.string().describe("Kratka citace nebo zduvodneni z textu (cesky, do 120 znaku)."),
  stavBytu: z.enum(["PRED_REKONSTRUKCI", "CASTECNA_REKONSTRUKCE", "PO_REKONSTRUKCI", "NOVOSTAVBA"]).nullable()
    .describe("Skutecny stav BYTU (ne domu): puvodni stav / nutna rekonstrukce = PRED_REKONSTRUKCI; jen neco nove (kuchyn nebo koupelna nebo okna) = CASTECNA_REKONSTRUKCE; kompletne zrekonstruovano = PO_REKONSTRUKCI; novy byt = NOVOSTAVBA. Kdyz text nerika nic konkretniho, null."),
  stavBytuDuvod: z.string().describe("Kratka citace nebo zduvodneni z textu (cesky, do 120 znaku)."),
  podlazi: z.number().int().nullable().describe("Podlazi bytu (prizemi = 0)."),
  podlaziCelkem: z.number().int().nullable().describe("Pocet nadzemnich podlazi domu."),
  vytah: z.boolean().nullable(),
  balkon: z.boolean().nullable().describe("Balkon, lodzie nebo terasa."),
  sklep: z.boolean().nullable(),
  parkovani: z.boolean().nullable().describe("Garaz nebo vlastni parkovaci stani."),
  energetickaTrida: z.enum(["A", "B", "C", "D", "E", "F", "G"]).nullable(),
  vlastnictvi: z.enum(["OSOBNI", "DRUZSTEVNI", "JINE"]).nullable(),
  rokRekonstrukce: z.number().int().nullable().describe("Rok posledni rekonstrukce bytu, pokud je uveden."),
  zateplenyDum: z.boolean().nullable(),
  shrnuti: z.string().describe("Jedna veta cesky: co je na bytu podstatne pro cenu (stav, vybaveni, vady, lokalita)."),
});
export type AiParametry = z.infer<typeof Parametry>;

const SYSTEM = `Jsi odhadce ceskych nemovitosti. Dostanes cely text stranky inzeratu bytu ze Sreality
(vcetne menu, reklam a podobnych inzeratu — ty ignoruj, posuzuj jen tento jeden inzerat).
Vytahni parametry podle schematu. Vychazej jen z textu; kdyz udaj v textu neni, vrat null — nehadej.
U stavu bytu ver vic konkretnim popisum (co je nove, co puvodni) nez obecnym pojmum typu "velmi dobry stav".
Zduvodneni pis cesky a strucne, idealne kratkou citaci z inzeratu.`;

/** Text stranky muze byt dlouhy (podobne inzeraty, paticka); popis inzeratu je na zacatku. */
const MAX_ZNAKU = 20_000;

export async function vytahniParametry(textStranky: string, client = new Anthropic()): Promise<{ parametry: AiParametry; vstup: number; vystup: number }> {
  const odpoved = await client.messages.parse({
    model: AI_MODEL,
    max_tokens: 4000,
    // Klasifikace textu: hluboke premysleni nepotrebuje
    output_config: { effort: "low", format: zodOutputFormat(Parametry) },
    system: SYSTEM,
    messages: [{ role: "user", content: textStranky.slice(0, MAX_ZNAKU) }],
  });
  if (odpoved.stop_reason === "refusal") throw new Error("AI odmítla zpracovat text");
  if (!odpoved.parsed_output) throw new Error(`AI nevrátila parametry (${odpoved.stop_reason})`);
  const p = odpoved.parsed_output;
  const typ = p.typDomu?.toUpperCase() ?? null;
  p.typDomu = typ == null ? null : ["PANEL", "CIHLA", "NOVOSTAVBA"].includes(typ) ? typ : "JINY";
  return { parametry: p, vstup: odpoved.usage.input_tokens, vystup: odpoved.usage.output_tokens };
}

/** Cena za milion tokenu (vstup, vystup) v USD pro odhad nakladu v logu. */
export const CENIK: Record<string, [number, number]> = {
  "claude-haiku-5-5": [0.1, 0.5],
  "claude-sonnet-5-5": [2, 10],
  "claude-opus-5-5": [4, 20],
};
