/**
 * Cena na vyzadani: portaly misto ceny uvadeji symbolickou castku (1 Kc, 0 Kc). Inzerat
 * s cenou pod touto hranici jde zaradit k porovnani, ale do odhadu ceny nevstupuje.
 */
export const MIN_SKUTECNA_CENA = 1000;

/** Velikostni trida dispozice: 1+1 a 2+kk = 2, 2+1 a 3+kk = 3 (srovnatelne byty). null = jina dispozice. */
export function tridaDispozice(d: string | null | undefined): number | null {
  const m = /^(\d+)\s*\+\s*(kk|1)$/i.exec((d ?? "").trim());
  if (!m) return null;
  return Number(m[1]) + (m[2].toLowerCase() === "kk" ? 0 : 1);
}
