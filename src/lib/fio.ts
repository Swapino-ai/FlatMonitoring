/**
 * Fio banka — cteni pohybu na uctu (API jen pro cteni).
 *
 * Token si uzivatel vygeneruje v internetbankingu Fio (Nastaveni → API, "pouze sledovat
 * ucet") a ulozi ho do promenne prostredi FIO_TOKEN (Vercel i GitHub). Jen serverova cast:
 * token se nesmi dostat do prohlizece ani do logu. Fio dovoli jeden dotaz za 30 s.
 */

export interface PohybBanky {
  bankaId: string;
  datum: string;
  castka: number;
  mena: string;
  protiucet: string | null;
  nazevProtiuctu: string | null;
  vs: string | null;
  ks: string | null;
  ss: string | null;
  zprava: string | null;
  typ: string | null;
}

type Sloupec = { value: string | number | null } | null;
type FioTransakce = Record<string, Sloupec>;

export const fioNastaveno = () => !!process.env.FIO_TOKEN?.trim();

const hodnota = (t: FioTransakce, n: number) => {
  const v = t[`column${n}`]?.value;
  return v == null || v === "" ? null : String(v).trim();
};

/** Pohyb z odpovedi Fio na nas tvar. */
export function prevedPohyb(t: FioTransakce): PohybBanky | null {
  const id = hodnota(t, 22);
  const datum = hodnota(t, 0)?.slice(0, 10);
  const castka = Number(t.column1?.value);
  if (!id || !datum || !Number.isFinite(castka)) return null;
  const ucet = hodnota(t, 2);
  const banka = hodnota(t, 3);
  // Zprava pro prijemce, jinak uzivatelska identifikace
  const zprava = hodnota(t, 16) ?? hodnota(t, 7);
  return {
    bankaId: `FIO:${id}`, datum, castka, mena: hodnota(t, 14) ?? "CZK",
    protiucet: ucet ? (banka ? `${ucet}/${banka}` : ucet) : null,
    nazevProtiuctu: hodnota(t, 10), vs: hodnota(t, 5)?.replace(/^0+/, "") || null, ks: hodnota(t, 4), ss: hodnota(t, 6),
    zprava, typ: hodnota(t, 8),
  };
}

/** Stahne pohyby za obdobi. Vraci chybu jako text (nikdy s tokenem). */
export async function stahniPohybyFio(od: string, doDne: string): Promise<{ ok: true; pohyby: PohybBanky[] } | { ok: false; chyba: string }> {
  const token = process.env.FIO_TOKEN?.trim().split(/\s+/)[0];
  if (!token) return { ok: false, chyba: "Fio není napojené — chybí FIO_TOKEN v nastavení Vercelu." };
  try {
    const r = await fetch(`https://fioapi.fio.cz/v1/rest/periods/${encodeURIComponent(token)}/${od}/${doDne}/transactions.json`, {
      cache: "no-store", signal: AbortSignal.timeout(20000),
    });
    if (r.status === 409) return { ok: false, chyba: "Fio dovoluje stáhnout pohyby jen jednou za 30 sekund — zkus to za chvíli." };
    if (r.status === 401 || r.status === 403) return { ok: false, chyba: "Fio odmítlo token — zkontroluj FIO_TOKEN." };
    if (!r.ok) return { ok: false, chyba: `Fio odpovědělo HTTP ${r.status}.` };
    const data = await r.json() as { accountStatement?: { transactionList?: { transaction?: FioTransakce[] } } };
    const pohyby = (data.accountStatement?.transactionList?.transaction ?? []).map(prevedPohyb).filter((p): p is PohybBanky => !!p);
    return { ok: true, pohyby };
  } catch (e) {
    const zprava = e instanceof Error ? e.message : String(e);
    return { ok: false, chyba: `Spojení s Fio selhalo: ${zprava.split(token).join("•••")}` };
  }
}

/** Cislo uctu pro porovnani: bez mezer, bez uvodnich nul a predcisli s nulami. */
export function normalizujUcet(u: string | null | undefined): string | null {
  if (!u) return null;
  const t = u.replace(/\s+/g, "");
  const m = /^(?:(\d+)-)?(\d+)\/(\d{4})$/.exec(t);
  if (!m) return t.toLowerCase();
  const pred = m[1] ? String(Number(m[1])) : "";
  return `${pred && pred !== "0" ? `${pred}-` : ""}${String(Number(m[2]))}/${m[3]}`;
}
