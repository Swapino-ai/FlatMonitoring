/**
 * Cislo uctu: ceske "predcisli-cislo/kod banky" (kontrola modulo 11 podle
 * vyhlasky CNB) nebo ceske IBAN (CZkk + 20 cislic, kontrola modulo 97).
 * Ciste funkce, bezi v prohlizeci i na serveru.
 */

const VAHY = [1, 2, 4, 8, 5, 10, 9, 7, 3, 6]; // od posledni cislice

function modulo11(cislice: string): boolean {
  let soucet = 0;
  const r = cislice.split("").reverse();
  for (let i = 0; i < r.length; i++) soucet += Number(r[i]) * VAHY[i];
  return soucet % 11 === 0;
}

function modulo97(iban: string): number {
  const prehozene = iban.slice(4) + iban.slice(0, 4);
  const cisla = prehozene.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let zbytek = 0;
  for (const c of cisla) zbytek = (zbytek * 10 + Number(c)) % 97;
  return zbytek;
}

export type VysledekUctu = { ok: true; hodnota: string } | { ok: false; chyba: string };

/** Zkontroluje a sjednoti zapis (bez mezer, "predcisli-cislo/banka" nebo IBAN). Prazdne je platne. */
export function zkontrolujUcet(vstup: string): VysledekUctu | { ok: true; hodnota: null } {
  const t = vstup.replace(/\s/g, "").toUpperCase();
  if (!t) return { ok: true, hodnota: null };

  if (/^[A-Z]{2}\d{2}/.test(t)) {
    if (!/^CZ\d{22}$/.test(t)) return { ok: false, chyba: "České IBAN má tvar CZ + 22 číslic." };
    if (modulo97(t) !== 1) return { ok: false, chyba: "IBAN nesedí kontrolní součet — zkontroluj překlepy." };
    return { ok: true, hodnota: t };
  }

  const m = /^(?:(\d{1,6})-)?(\d{2,10})\/(\d{4})$/.exec(t);
  if (!m) return { ok: false, chyba: "Zadej ve tvaru 123456789/0800 nebo 19-123456789/0800." };
  const [, predcisli, cislo, banka] = m;
  if (predcisli && !modulo11(predcisli)) return { ok: false, chyba: "Předčíslí účtu nesedí kontrolní součet — zkontroluj překlepy." };
  if (!modulo11(cislo)) return { ok: false, chyba: "Číslo účtu nesedí kontrolní součet — zkontroluj překlepy." };
  if (/^0+$/.test(cislo)) return { ok: false, chyba: "Číslo účtu nemůže být samé nuly." };
  return { ok: true, hodnota: `${predcisli ? `${predcisli}-` : ""}${cislo}/${banka}` };
}
