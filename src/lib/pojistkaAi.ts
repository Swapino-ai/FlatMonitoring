/**
 * Rozbor pojistne smlouvy AI: z nahrane smlouvy (PDF nebo fotky stran) vytahne dulezite udaje
 * (pojistne, pojistne castky, spoluucast, rizika, vyluky) a posoudi, jestli kryti odpovida
 * nemovitosti (podpojisteni, chybejici rizika, pronajem). Jen serverova cast.
 * Vysledek je podklad k posouzeni — smlouvu je dobre si overit.
 */
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod/v4";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { RIZIKA, type Riziko } from "./pojistky";

/** Rozbor smlouvy je jednorazovy a dulezity — nejschopnejsi model (lze prepsat promennou) */
const MODEL_POJISTKY = process.env.AI_MODEL_POJISTKY || "claude-opus-5-5";

const KLICE_RIZIK = Object.keys(RIZIKA) as [Riziko, ...Riziko[]];

const schema = z.object({
  pojistovna: z.string().nullable(),
  cisloSmlouvy: z.string().nullable(),
  druh: z.enum(["NEMOVITOST", "DOMACNOST", "KOMBINOVANA", "ODPOVEDNOST"]).nullable(),
  od: z.string().nullable().describe("Pocatek pojisteni RRRR-MM-DD"),
  do: z.string().nullable().describe("Konec pojisteni RRRR-MM-DD; null = na dobu neurcitou"),
  frekvence: z.enum(["MESICNE", "CTVRTLETNE", "POLOLETNE", "ROCNE"]).nullable(),
  pojistneZaPlatbu: z.number().nullable().describe("Kc za jednu platbu podle frekvence"),
  rocniPojistne: z.number().nullable(),
  pojistnaCastkaNemovitost: z.number().nullable().describe("Pojistna castka / limit plneni stavby, Kc"),
  pojistnaCastkaDomacnost: z.number().nullable(),
  limitOdpovednosti: z.number().nullable(),
  spoluucast: z.number().nullable().describe("Zakladni spoluucast v Kc"),
  pojisteniNaNovou: z.boolean().nullable().describe("Plneni v nove (reprodukcni) cene, ne casove"),
  rizika: z.array(z.object({
    riziko: z.enum(KLICE_RIZIK),
    kryto: z.enum(["ANO", "NE", "NEJASNE"]),
    limit: z.number().nullable().describe("Sublimit plneni v Kc, kdyz je uveden"),
    poznamka: z.string().nullable(),
  })).describe("Kazde z uvedenych rizik prave jednou"),
  vyluky: z.array(z.string()).describe("Dulezite vyluky a podminky, ktere mohou plneni omezit"),
  dulezite: z.array(z.string()).describe("Nejdulezitejsi udaje ze smlouvy, kratce"),
  hodnoceni: z.object({
    stav: z.enum(["OK", "POZOR", "PROBLEM"]),
    body: z.array(z.object({ uroven: z.enum(["OK", "POZOR", "PROBLEM"]), text: z.string() })),
  }),
  shrnuti: z.string().describe("2-4 vety cesky"),
});
export type RozborPojistky = z.infer<typeof schema>;

export interface KontextNemovitosti {
  nazev: string; adresa: string; typ: string; plochaM2: number;
  porizovaciCena: number; aktualniHodnota: number | null; pronajimano: boolean; kratkodobe: boolean;
  zadano: { pojistovna: string; castka: number; frekvence: string; pojistnaCastka: number | null };
}

export const aiPojistkyNastaveno = () => !!process.env.ANTHROPIC_API_KEY?.trim();

const SYSTEM = `Jsi zkuseny cesky pojistovaci poradce. Ctes pojistne smlouvy k nemovitostem (byty, domy, garaze),
ktere majitel pronajima. Vytahni udaje podle schematu — nic si nevymyslej, co ve smlouve neni, vrat null
nebo u rizika NEJASNE. Pak posud, zda je kryti dostatecne:
- podpojisteni: pojistna castka stavby vs. hodnota nemovitosti (u bytu se pojistuje stavebni cast bez pozemku,
  orientacne reprodukcni cena; vyrazne nizsi castka = POZOR/PROBLEM, uved odhad, o kolik)
- chybejici zakladni rizika (zivel, voda z potrubi, povoden u rizikove polohy) a odpovednost
- u pronajimane nemovitosti odpovednost vuci najemci, skody zpusobene najemcem, ztrata najemneho
- vysoka spoluucast, plneni v casove cene, dulezite vyluky
Hodnoceni pis cesky, konkretne a strucne (body max. 1-2 vety).`;

/** Rozebere smlouvu. Soubory: PDF jako dokument, fotky stran jako obrazky. */
export async function rozeberPojistku(soubory: { data: string; mime: string }[], k: KontextNemovitosti): Promise<RozborPojistky> {
  const client = new Anthropic();
  const obsah: Anthropic.Beta.BetaContentBlockParam[] = soubory.map((s) => s.mime === "application/pdf"
    ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: s.data } }
    : { type: "image" as const, source: { type: "base64" as const, media_type: s.mime as "image/jpeg" | "image/png" | "image/webp", data: s.data } });
  const kontext = [
    `Nemovitost: ${k.nazev}, ${k.adresa}; typ ${k.typ}, ${k.plochaM2} m².`,
    `Pořizovací cena ${Math.round(k.porizovaciCena).toLocaleString("cs-CZ")} Kč${k.aktualniHodnota ? `, aktuální odhad hodnoty ${Math.round(k.aktualniHodnota).toLocaleString("cs-CZ")} Kč` : ""}.`,
    k.pronajimano ? `Nemovitost se pronajímá${k.kratkodobe ? " (i krátkodobě, Airbnb)" : ""}.` : "Nemovitost se nyní nepronajímá.",
    `Majitel zadal: pojišťovna ${k.zadano.pojistovna}, pojistné ${k.zadano.castka} Kč ${k.zadano.frekvence}${k.zadano.pojistnaCastka ? `, pojistná částka ${k.zadano.pojistnaCastka} Kč` : ""}. Když smlouva uvádí něco jiného, upozorni na to.`,
  ].join("\n");
  const odpoved = await client.beta.messages.parse({
    model: MODEL_POJISTKY,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "high", format: betaZodOutputFormat(schema) },
    system: SYSTEM,
    messages: [{ role: "user", content: [...obsah, { type: "text", text: `${kontext}\n\nRozeber tuto pojistnou smlouvu.` }] }],
  });
  if (odpoved.stop_reason === "refusal") throw new Error("AI rozbor smlouvy odmítla.");
  const p = odpoved.parsed_output as RozborPojistky | null;
  if (!p) throw new Error("AI smlouvu nepřečetla.");
  return p;
}

const schemaPorovnani = z.object({
  shrnuti: z.string().describe("3-5 vet cesky: jak si pojisteni napric nemovitostmi stoji"),
  doporuceni: z.array(z.object({ nemovitost: z.string(), uroven: z.enum(["OK", "POZOR", "PROBLEM"]), text: z.string() })),
});
export type PorovnaniPojistek = z.infer<typeof schemaPorovnani>;

/** Porovna pojistky vsech nemovitosti (z jiz vytazenych udaju — smlouvy se znovu necti). */
export async function porovnejPojistkyAi(polozky: { nemovitost: string; hodnota: number | null; pronajimano: boolean; pojistky: unknown[] }[]): Promise<PorovnaniPojistek> {
  const client = new Anthropic();
  const odpoved = await client.beta.messages.parse({
    model: MODEL_POJISTKY,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(schemaPorovnani) },
    system: `${SYSTEM}\nTed porovnavas pojisteni vsech nemovitosti jednoho majitele: rozdily v kryti, cene za korunu pojistne castky,
nemovitosti bez pojisteni nebo podpojistene, co sjednotit. Ke kazde nemovitosti jeden bod.`,
    messages: [{ role: "user", content: `Údaje o pojištění nemovitostí (JSON):\n${JSON.stringify(polozky)}` }],
  });
  if (odpoved.stop_reason === "refusal") throw new Error("AI porovnání odmítla.");
  const p = odpoved.parsed_output as PorovnaniPojistek | null;
  if (!p) throw new Error("AI porovnání nevrátila.");
  return p;
}
