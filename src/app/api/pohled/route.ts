import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth";
import { POHLED_COOKIE } from "@/lib/ownership";

/** Prepnuti pohledu: cele portfolio, muj podil nebo podil jineho vlastnika. */
export async function POST(request: Request) {
  if (!(await getSession())) return NextResponse.json({ error: "Nepřihlášen" }, { status: 401 });

  const form = await request.formData();
  const v = String(form.get("pohled") ?? "vse");
  // "moje", "u:<id>" (podil jineho vlastnika), jinak cele portfolio
  const pohled = v === "moje" || /^u:[\w-]{1,64}$/.test(v) ? v : "vse";
  const kam = String(form.get("kam") ?? "/");

  (await cookies()).set(POHLED_COOKIE, pohled, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  // Zpet na stranku, ze ktere se prepinalo — jen v ramci aplikace
  const cil = kam.startsWith("/") && !kam.startsWith("//") ? kam : "/";
  return NextResponse.redirect(new URL(cil, request.url), 303);
}
