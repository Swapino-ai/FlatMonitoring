/**
 * Co z AI parametru inzeratu ukazat v aplikaci: typ domu a stav se zduvodnenim,
 * shrnuti a doplnkove udaje jako kratke stitky. Ciste funkce, bez SDK.
 */
export interface AiNahled {
  typDomu: string | null;
  typDomuDuvod: string;
  stavBytu: string | null;
  stavBytuDuvod: string;
  shrnuti: string;
  stitky: string[];
}

type P = Partial<{
  typDomu: string | null; typDomuDuvod: string; stavBytu: string | null; stavBytuDuvod: string; shrnuti: string;
  podlazi: number | null; podlaziCelkem: number | null; vytah: boolean | null; balkon: boolean | null; sklep: boolean | null;
  parkovani: boolean | null; energetickaTrida: string | null; vlastnictvi: string | null; rokRekonstrukce: number | null; zateplenyDum: boolean | null;
}>;

export function nahledAi(parametry: unknown): AiNahled | null {
  if (!parametry || typeof parametry !== "object") return null;
  const p = parametry as P;
  const stitky: string[] = [];
  if (p.podlazi != null) stitky.push(p.podlazi === 0 ? "přízemí" : `${p.podlazi}. patro${p.podlaziCelkem ? ` z ${p.podlaziCelkem}` : ""}`);
  if (p.vytah != null) stitky.push(p.vytah ? "výtah" : "bez výtahu");
  if (p.balkon) stitky.push("balkon/lodžie");
  if (p.sklep) stitky.push("sklep");
  if (p.parkovani) stitky.push("parkování");
  if (p.zateplenyDum) stitky.push("zateplený dům");
  if (p.rokRekonstrukce) stitky.push(`rekonstrukce ${p.rokRekonstrukce}`);
  if (p.energetickaTrida) stitky.push(`energ. třída ${p.energetickaTrida}`);
  if (p.vlastnictvi === "DRUZSTEVNI") stitky.push("družstevní");
  else if (p.vlastnictvi === "OSOBNI") stitky.push("osobní vlastnictví");
  return {
    typDomu: p.typDomu ?? null, typDomuDuvod: p.typDomuDuvod ?? "",
    stavBytu: p.stavBytu ?? null, stavBytuDuvod: p.stavBytuDuvod ?? "",
    shrnuti: p.shrnuti ?? "", stitky,
  };
}
