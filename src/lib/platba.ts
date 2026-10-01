import { naIban } from "./ucet";

/**
 * Retezec pro QR platbu podle ceskeho standardu SPAYD (SPD 1.0), ktery cte
 * kazda bankovni aplikace. Vrati null, kdyz neni platny ucet nebo kladna castka.
 */
export function spayd(a: { ucet: string; castka: number; vs?: string; zprava?: string }): string | null {
  const iban = naIban(a.ucet);
  if (!iban || !(a.castka > 0)) return null;
  // Hvezdicka je oddelovac poli; v hodnotach se nahrazuje, diakritika se odstranuje
  const cisty = (t: string) =>
    t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\*/g, " ").replace(/[^\x20-\x7E]/g, "").trim().slice(0, 60);
  const pole = [`ACC:${iban}`, `AM:${a.castka.toFixed(2)}`, "CC:CZK"];
  if (a.vs && /^\d{1,10}$/.test(a.vs)) pole.push(`X-VS:${a.vs}`);
  if (a.zprava) pole.push(`MSG:${cisty(a.zprava)}`);
  return `SPD*1.0*${pole.join("*")}`;
}
