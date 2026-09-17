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

export const dateCz = (d: Date | string | null | undefined) =>
  d ? new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" }).format(new Date(d)) : "—";

export const monthCz = (d: Date | string) =>
  new Intl.DateTimeFormat("cs-CZ", { month: "short", year: "2-digit" }).format(new Date(d));

export const STATUS_LABELS: Record<string, string> = {
  RENTED: "Pronajato",
  VACANT: "Volné",
  RENOVATION: "Rekonstrukce",
  FOR_SALE: "Na prodej",
  SOLD: "Prodáno",
};
