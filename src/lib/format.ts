export const czk = (v: number, decimals = 0) =>
  new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: decimals, minimumFractionDigits: decimals }).format(v || 0);

export const czkCompact = (v: number) => {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)} mil. Kč`;
  if (abs >= 1_000) return `${Math.round(v / 1_000)} tis. Kč`;
  return `${Math.round(v)} Kč`;
};

export const pct = (v: number, decimals = 1) =>
  `${(v ?? 0).toFixed(decimals).replace(".", ",")} %`;

export const num = (v: number, decimals = 0) =>
  new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: decimals, minimumFractionDigits: decimals }).format(v || 0);

/**
 * Kalendarni den (rrrr-mm-dd) z data. Datum bez casu (smlouvy, obdobi) je ulozene o pulnoci UTC
 * a bere se tak, jak je; skutecny okamzik (zalozeno, vydano) se prevede na cesky den.
 * Drive se den ctl v UTC jinde a v pasmu prohlizece jinde, takze se mohl posunout o jeden.
 */
export function denISO(d: Date | string | null | undefined): string {
  if (!d) return "";
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  if (dt.getUTCHours() === 0 && dt.getUTCMinutes() === 0 && dt.getUTCSeconds() === 0) return dt.toISOString().slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" }).format(dt);
}

export const dateCz = (d: Date | string | null | undefined) => {
  const iso = denISO(d);
  if (!iso) return "—";
  const [r, m, den] = iso.split("-");
  return `${Number(den)}. ${Number(m)}. ${r}`;
};

export const monthCz = (d: Date | string) =>
  new Intl.DateTimeFormat("cs-CZ", { month: "short", year: "2-digit" }).format(new Date(d));

export const STATUS_LABELS: Record<string, string> = {
  RENTED: "Pronajato",
  VACANT: "Volné",
  RENOVATION: "Rekonstrukce",
  FOR_SALE: "Na prodej",
  SOLD: "Prodáno",
};
