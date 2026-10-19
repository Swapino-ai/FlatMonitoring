import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { bezKolize, cestaSlozek, chybaKontextu, chybaSouboru, navrhNazvu, plnyKlic } from "@/lib/dokumenty";
import { prisma } from "@/lib/db";
import { ChybaDisku, zahajNahrani, zajistiCestu, zapomenSlozky } from "@/lib/googleDrive";
import { podepisListek, podkladNazvu, puvod, rozresKontext, zVstupu } from "@/lib/soubory";

export const dynamic = "force-dynamic";

const chyba = (zprava: string, stav: number) => NextResponse.json({ error: zprava }, { status: stav });

/**
 * Krok 1 nahravani: zkontroluje soubor a kontext, zalozi slozky a vrati adresu, na kterou
 * prohlizec soubor posle primo do Googlu, plus podepsany listek pro krok 2.
 */
export async function POST(req: Request) {
  const user = await getSession();
  if (!user) return chyba("Nejsi přihlášen.", 401);
  if (user.role !== "OWNER") return chyba("Soubory může nahrávat jen majitel.", 403);

  const b = await req.json().catch(() => null);
  const kontext = zVstupu(b?.kontext);
  const name = typeof b?.name === "string" ? b.name : "";
  const size = Number(b?.size);
  const mime = typeof b?.type === "string" && b.type ? b.type : "application/octet-stream";
  if (!kontext) return chyba("Neplatný kontext.", 400);

  const problemSouboru = chybaSouboru(name, size);
  if (problemSouboru) return chyba(problemSouboru, 400);

  const { popisky, vazby } = await rozresKontext(kontext);
  const problem = chybaKontextu(popisky);
  if (problem) return chyba(problem, 400);

  const cesta = cestaSlozek(popisky);
  // Citelny nazev podle obsahu ("Vyúčtování Elektřina (ČEZ) – Nový Bor – 2025.pdf"), bez kolize se stejnym
  const navrh = navrhNazvu(await podkladNazvu(kontext.kategorie, vazby), name);
  const stejne = await prisma.dokument.findMany({ where: { name: { startsWith: navrh.replace(/\.[^.]*$/, "") } }, select: { name: true } });
  const nazev = bezKolize(navrh, stejne.map((d) => d.name));
  const origin = puvod(req);

  try {
    // Kdyz slozka na Disku zmizela (smazana rucne), zapomeneme ji a zalozime znovu
    for (let pokus = 0; ; pokus++) {
      try {
        const slozka = await zajistiCestu(cesta);
        const uploadUrl = await zahajNahrani({ rodicId: slozka, nazev, mime, velikost: size, origin });
        const listek = await podepisListek({ kontext, name: nazev, mime, size, uid: user.id, slozka, ...(nazev !== name ? { puvodni: name } : {}) });
        return NextResponse.json({ uploadUrl, listek, cesta: cesta.map((s) => s.nazev).join(" / ") });
      } catch (e) {
        if (e instanceof ChybaDisku && e.stav === 404 && pokus === 0) {
          await zapomenSlozky(plnyKlic(cesta, 0));
          continue;
        }
        throw e;
      }
    }
  } catch (e) {
    if (e instanceof ChybaDisku) return chyba(e.message, e.stav >= 400 && e.stav < 600 ? e.stav : 502);
    console.error("Zahájení nahrávání:", e);
    return chyba("Nahrávání se nepodařilo zahájit.", 500);
  }
}
