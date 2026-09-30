import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ChybaDisku, doKose, infoSouboru } from "@/lib/googleDrive";
import { overListek, rozresKontext } from "@/lib/soubory";

export const dynamic = "force-dynamic";

const chyba = (zprava: string, stav: number) => NextResponse.json({ error: zprava }, { status: stav });

/** Krok 2: soubor je na Disku; overime ho a zapiseme do evidence. */
export async function POST(req: Request) {
  const user = await getSession();
  if (!user || user.role !== "OWNER") return chyba("Nejsi oprávněn.", 403);

  const b = await req.json().catch(() => null);
  const listek = typeof b?.listek === "string" ? await overListek(b.listek) : null;
  const driveId = typeof b?.driveId === "string" ? b.driveId : "";
  if (!listek || !driveId) return chyba("Neplatný požadavek.", 400);
  if (listek.uid !== user.id) return chyba("Listek patří jinému uživateli.", 403);

  try {
    const soubor = await infoSouboru(driveId);
    // Soubor musi lezet ve slozce, kterou server pro tento listek schvalil
    if (soubor.trashed || !soubor.parents?.includes(listek.slozka)) return chyba("Soubor není tam, kam měl být nahrán.", 400);

    const { vazby } = await rozresKontext(listek.kontext);
    const zaznam = await prisma.dokument.upsert({
      where: { driveId },
      update: {},
      create: {
        driveId, name: listek.name, mime: listek.mime, size: Math.round(Number(soubor.size ?? listek.size)),
        kategorie: listek.kontext.kategorie, ...vazby, uploadedById: user.id,
      },
    });
    if (vazby.propertyId) revalidatePath(`/properties/${vazby.propertyId}`);
    revalidatePath("/sprava");
    return NextResponse.json({ id: zaznam.id, name: zaznam.name });
  } catch (e) {
    // Zapis se nepovedl: soubor by na Disku zustal bez evidence — uklidime ho
    await doKose(driveId).catch(() => undefined);
    if (e instanceof ChybaDisku) return chyba(e.message, e.stav >= 400 && e.stav < 600 ? e.stav : 502);
    console.error("Dokončení nahrávání:", e);
    return chyba("Soubor se nepodařilo zaevidovat.", 500);
  }
}
