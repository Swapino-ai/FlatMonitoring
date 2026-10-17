import type { ReactNode } from "react";
import { aktualniPohled } from "@/lib/ownership.server";
import { NavKlient } from "./NavKlient";

/** Hlavicka: pohled (muj podil / cele portfolio) cte server z cookie a prepinac je vzdy nahore. */
export async function Nav({ user, verze }: { user: { name: string; role: string }; verze?: ReactNode }) {
  return <NavKlient user={user} verze={verze} pohled={await aktualniPohled()} />;
}
