import { redirect } from "next/navigation";
import { getSession, type SessionUser } from "./auth";

/** Vola se na zacatku kazde chranene stranky. */
export async function page(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) redirect("/login");
  return user;
}
