import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ChybaDisku, stahni } from "@/lib/googleDrive";

export const dynamic = "force-dynamic";

/**
 * Zobrazi nebo stahne dokument. Jde pres nas server, takze ho uvidi kazdy prihlaseny
 * uzivatel aplikace (i partner jen pro cteni) — bez uctu Google a bez sdileni na Disku.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user) return new NextResponse("Nejsi přihlášen.", { status: 401 });

  const { id } = await ctx.params;
  const dok = await prisma.dokument.findUnique({ where: { id } });
  if (!dok) return new NextResponse("Dokument neexistuje.", { status: 404 });

  try {
    const r = await stahni(dok.driveId, req.headers.get("range"));
    if (r.status === 404) return new NextResponse("Soubor už na Disku není.", { status: 404 });
    if (!r.ok && r.status !== 206) return new NextResponse("Disk soubor nevydal.", { status: 502 });

    const stahnout = new URL(req.url).searchParams.get("stahnout") === "1";
    const hlavicky = new Headers({
      "Content-Type": dok.mime || "application/octet-stream",
      "Content-Disposition": `${stahnout ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(dok.name)}`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    });
    for (const h of ["content-length", "content-range", "accept-ranges"]) {
      const v = r.headers.get(h);
      if (v) hlavicky.set(h, v);
    }
    return new NextResponse(r.body, { status: r.status, headers: hlavicky });
  } catch (e) {
    if (e instanceof ChybaDisku) return new NextResponse(e.message, { status: e.stav >= 400 && e.stav < 600 ? e.stav : 502 });
    return new NextResponse("Dokument se nepodařilo načíst.", { status: 500 });
  }
}
