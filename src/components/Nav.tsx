import type { ReactNode } from "react";
import { volbaPohledu } from "@/lib/ownership.server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NavKlient } from "./NavKlient";

/**
 * Hlavicka: pohled (cele portfolio / muj podil / podil jineho vlastnika) cte server z cookie
 * a prepinac je vzdy nahore. Kdyz se zobrazuje jen podil, je pod menu vyrazna lista.
 */
export async function Nav({ user, verze }: { user: { name: string; role: string }; verze?: ReactNode }) {
  const [volba, ja] = await Promise.all([volbaPohledu(), getSession()]);
  // Vlastnici, mezi kterymi jde prepinat: kdo ma podil na nemovitosti nebo uver
  const vlastnici = await prisma.user.findMany({
    where: { OR: [{ podily: { some: {} } }, { uvery: { some: {} } }] },
    select: { id: true, name: true }, orderBy: { name: "asc" },
  });
  const jine = vlastnici.filter((v) => v.id !== ja?.id);
  const zvoleny = volba.startsWith("u:") ? vlastnici.find((v) => v.id === volba.slice(2)) : null;
  // Neplatna volba (vlastnik uz neni) se chova jako cele portfolio
  const platna = volba.startsWith("u:") && !zvoleny ? "vse" : volba;
  const komu = platna === "moje" ? "tvůj podíl" : zvoleny ? `podíl: ${zvoleny.name}` : null;
  return (
    <NavKlient user={user} verze={verze} volba={platna} komu={komu}
      moznosti={[
        { value: "vse", label: "Celé portfolio" },
        { value: "moje", label: "Můj podíl" },
        ...jine.map((v) => ({ value: `u:${v.id}`, label: `Podíl: ${v.name}` })),
      ]} />
  );
}
