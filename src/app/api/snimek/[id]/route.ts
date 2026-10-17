import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { stahni } from "@/lib/googleDrive";

export const dynamic = "force-dynamic";

/** Screenshot inzeratu: z databaze, nebo (po presunu) z Google Disku. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user) return new NextResponse("Nejsi přihlášen.", { status: 401 });
  const { id } = await ctx.params;
  const s = await prisma.inzeratSnimek.findUnique({ where: { id } });
  if (!s) return new NextResponse("Snímek neexistuje.", { status: 404 });
  const hlavicky = { "Content-Type": s.mime, "Cache-Control": "private, max-age=86400" };
  if (s.data) return new NextResponse(Buffer.from(s.data), { headers: hlavicky });
  if (s.driveId) {
    try {
      const r = await stahni(s.driveId);
      if (!r.ok) return new NextResponse("Snímek na Disku není.", { status: 404 });
      return new NextResponse(r.body, { headers: hlavicky });
    } catch {
      return new NextResponse("Disk snímek nevydal.", { status: 502 });
    }
  }
  return new NextResponse("Snímek je prázdný.", { status: 404 });
}
