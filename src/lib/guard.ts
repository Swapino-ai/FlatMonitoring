import { redirect } from "next/navigation";
import { getSession, type SessionUser } from "./auth";
import { prisma } from "./db";

/** Vola se na zacatku kazde chranene stranky. */
export async function page(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) {
    // Cerstve nasazeni bez jedineho uctu — nabidneme zalozeni sprvce
    if ((await prisma.user.count()) === 0) redirect("/setup");
    redirect("/login");
  }
  return user;
}
