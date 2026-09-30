import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ChybaDisku, vymenKod, zalozKoren, zapomenToken } from "@/lib/googleDrive";
import { puvod } from "@/lib/soubory";

export const dynamic = "force-dynamic";

/** Navrat z Googlu: vymeni kod za trvaly pristup a zalozi korenovou slozku. */
export async function GET(req: Request) {
  const origin = puvod(req);
  const url = new URL(req.url);
  const zpet = (kod: string) => {
    const res = NextResponse.redirect(`${origin}/sprava?google=${kod}`);
    res.cookies.delete({ name: "fm_google_state", path: "/api/google" });
    return res;
  };

  const user = await getSession();
  if (!user || user.role !== "OWNER") return NextResponse.redirect(`${origin}/login`);
  if (url.searchParams.get("error")) return zpet("zamitnuto");

  const cookie = req.headers.get("cookie") ?? "";
  const stav = /(?:^|;\s*)fm_google_state=([^;]+)/.exec(cookie)?.[1];
  if (!stav || stav !== url.searchParams.get("state")) return zpet("stav");
  const kod = url.searchParams.get("code");
  if (!kod) return zpet("chyba");

  try {
    const { refreshToken, email } = await vymenKod(origin, kod);
    const stavajici = await prisma.googleConnection.findUnique({ where: { id: "main" } });
    const token = refreshToken ?? stavajici?.refreshToken;
    if (!token) return zpet("bez-tokenu");

    zapomenToken();
    // Kdyz uz koren existuje, zustava — pripojeni znovu nesmi rozbit slozky s dokumenty
    await prisma.googleConnection.upsert({
      where: { id: "main" },
      update: { refreshToken: token, email },
      create: { id: "main", refreshToken: token, email, rootFolderId: "" },
    });
    const koren = stavajici?.rootFolderId || (await zalozKoren());
    await prisma.googleConnection.update({ where: { id: "main" }, data: { rootFolderId: koren } });
    return zpet("ok");
  } catch (e) {
    console.error("Google callback:", e);
    return zpet(e instanceof ChybaDisku && e.stav === 401 ? "odebrano" : "chyba");
  }
}
