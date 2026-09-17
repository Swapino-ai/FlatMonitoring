import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "./db";

const COOKIE = "fm_session";

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    throw new Error("AUTH_SECRET není nastaven (min. 16 znaků). Doplň jej do .env.");
  }
  return new TextEncoder().encode(s);
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: "OWNER" | "PARTNER";
}

export async function verifyCredentials(email: string, password: string): Promise<SessionUser | null> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user) return null;
  if (!(await bcrypt.compare(password, user.passwordHash))) return null;
  return { id: user.id, email: user.email, name: user.name, role: user.role as SessionUser["role"] };
}

export async function createSession(user: SessionUser): Promise<void> {
  const token = await new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());

  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function destroySession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

export async function getSession(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return { id: payload.id as string, email: payload.email as string, name: payload.name as string, role: payload.role as SessionUser["role"] };
  } catch {
    return null;
  }
}

/** Vyzaduje prihlaseni. Vraci uzivatele, jinak vyhodi — stranky pouzivaji redirect. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}

export async function requireOwner(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "OWNER") throw new Error("FORBIDDEN");
  return user;
}

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 10);
}
