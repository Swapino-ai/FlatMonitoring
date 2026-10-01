/** Strana, ktera je na smlouvach a vyuctovani jako pronajimatel. */
export interface Pronajimatel {
  name: string;
  adresa: string;
  ucet: string | null;
  ico?: string | null;
  dic?: string | null;
}

type Adresa = { street: string | null; city: string | null; zip: string | null };
const adresa = (a: Adresa) => [a.street, [a.zip, a.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");

/**
 * Pronajimatel nemovitosti: nastaveny provozovatel; kdyz zadny neni, vlastnik s nejvetsim
 * podilem (aby doklady fungovaly i u nemovitosti, kde se provozovatel jeste nenastavil).
 */
export function pronajimatelNemovitosti(p: {
  operator?: (Adresa & { name: string; account: string | null; ico: string | null; dic: string | null }) | null;
  owners: { user: Adresa & { name: string; account: string | null } }[];
}): Pronajimatel | null {
  if (p.operator) {
    return { name: p.operator.name, adresa: adresa(p.operator), ucet: p.operator.account, ico: p.operator.ico, dic: p.operator.dic };
  }
  const v = p.owners[0]?.user;
  return v ? { name: v.name, adresa: adresa(v), ucet: v.account } : null;
}
