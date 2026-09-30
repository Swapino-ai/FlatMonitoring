import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { adresaPrihlaseni, jeNastaveno } from "@/lib/googleDrive";
import { puvod } from "@/lib/soubory";

export const dynamic = "force-dynamic";

/** Zacatek pripojeni Google Disku: presmeruje na souhlas u Googlu. Jen majitel. */
export async function GET(req: Request) {
  const user = await getSession();
  if (!user || user.role !== "OWNER") return NextResponse.redirect(new URL("/login", req.url));
  const origin = puvod(req);
  if (!jeNastaveno()) return NextResponse.redirect(`${origin}/sprava?google=nenastaveno`);

  // Nahodny stav v cookie chrani pred podvrzenym navratem z Googlu
  const state = crypto.randomUUID();
  const res = NextResponse.redirect(adresaPrihlaseni(origin, state));
  res.cookies.set("fm_google_state", state, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 600, path: "/api/google",
  });
  return res;
}
