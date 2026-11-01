/**
 * Cteni uctenky / faktury AI z fotky nebo PDF: datum, castka, obchod a navrh kategorie
 * krátkodobého pronájmu. Jen serverova cast (klic ANTHROPIC_API_KEY na Vercelu).
 * Vysledek je jen navrh — uzivatel ho pred ulozenim potvrdi nebo opravi.
 */
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { KATEGORIE_KRATKODOBE } from "./categories";
import { AI_MODEL } from "./market/aiParametry";

export interface UctenkaAi {
  datum: string | null;
  castka: number | null;
  obchod: string | null;
  popis: string;
  kategorie: string | null;
}

export const aiNastaveno = () => !!process.env.ANTHROPIC_API_KEY?.trim();

const vydaje = KATEGORIE_KRATKODOBE.filter((k) => k.kind === "EXPENSE");

const schema = z.object({
  datum: z.string().nullable().describe("Datum nakupu / vystaveni ve tvaru RRRR-MM-DD; null, kdyz neni citelne."),
  castka: z.number().nullable().describe("Celkova zaplacena castka v Kc (vcetne DPH), kladne cislo; null, kdyz neni citelna."),
  obchod: z.string().nullable().describe("Obchod nebo dodavatel (napr. 'Lidl', 'Airbnb', 'ČEZ')."),
  popis: z.string().describe("Kratky popis cesky, co se koupilo (do 60 znaku), napr. 'Drogerie a toaletní papír'."),
  kategorie: z.string().nullable().describe(`Nejvhodnejsi kategorie pro krátkodobý pronájem bytu: ${vydaje.map((k) => `${k.key} (${k.label}${k.hint ? `: ${k.hint}` : ""})`).join(", ")}.`),
});

/** Precte uctenku (obrazek JPEG/PNG/WebP nebo PDF v base64). */
export async function prectiUctenkuAi(data: string, mime: string): Promise<UctenkaAi> {
  const client = new Anthropic();
  const obsah = mime === "application/pdf"
    ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data } }
    : { type: "image" as const, source: { type: "base64" as const, media_type: mime as "image/jpeg" | "image/png" | "image/webp", data } };
  const odpoved = await client.messages.parse({
    model: AI_MODEL,
    max_tokens: 1000,
    output_config: { effort: "low", format: zodOutputFormat(schema) },
    system: "Ctes ceske uctenky a faktury za naklady na krátkodobý pronájem bytu (Airbnb). Vytahni udaje podle schematu, nic si nevymyslej — co neni citelne, vrat null.",
    messages: [{ role: "user", content: [obsah, { type: "text", text: "Přečti tuto účtenku." }] }],
  });
  const p = odpoved.parsed_output as z.infer<typeof schema> | null;
  if (!p) throw new Error("AI účtenku nepřečetla.");
  return {
    datum: p.datum && /^\d{4}-\d{2}-\d{2}$/.test(p.datum) ? p.datum : null,
    castka: typeof p.castka === "number" && Number.isFinite(p.castka) ? Math.abs(Math.round(p.castka * 100) / 100) : null,
    obchod: p.obchod?.trim() || null,
    popis: p.popis?.trim() ?? "",
    kategorie: p.kategorie && vydaje.some((k) => k.key === p.kategorie) ? p.kategorie : null,
  };
}
