import { prisma } from "./db";
import type { Pronajimatel, StranySmlouvy } from "./provozovatel";

type Adresa = { street: string | null; city: string | null; zip: string | null };
const adresa = (a: Adresa) => [a.street, [a.zip, a.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");

/** Vsichni uzivatele aplikace a provozovatele, ktere lze vybrat jako pronajimatele na smlouve. */
export async function nactiStrany(): Promise<StranySmlouvy> {
  const [uzivatele, provozovatele] = await Promise.all([
    prisma.user.findMany({ orderBy: { name: "asc" } }),
    prisma.operator.findMany({ orderBy: { name: "asc" } }),
  ]);
  const users: Record<string, Pronajimatel> = {};
  for (const u of uzivatele) users[u.id] = { name: u.name, adresa: adresa(u), ucet: u.account };
  const operators: Record<string, Pronajimatel> = {};
  for (const o of provozovatele) operators[o.id] = { name: o.name, adresa: adresa(o), ucet: o.account, ico: o.ico, dic: o.dic };
  return { users, operators };
}
