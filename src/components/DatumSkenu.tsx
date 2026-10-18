import { dateCz, denISO, stariCz } from "@/lib/format";

/** Barva podle stari: do 2 tydnu cerstve, do 2 mesicu (okno odhadu) stredni, pak stare. */
function barva(datum: string | Date): string {
  const dny = (Date.parse(`${denISO(new Date())}T00:00:00Z`) - Date.parse(`${denISO(datum)}T00:00:00Z`)) / 86400000;
  return dny <= 14 ? "bg-good" : dny <= 61 ? "bg-warn" : "bg-bad";
}

/**
 * Datum, kdy sken inzerat poprve nasel — pres fotku, at je hned videt, jak je nabidka stara.
 * Maly stitek do nahledu, velky box do galerie.
 */
export function DatumSkenu({ datum, velky = false }: { datum: string | Date | null | undefined; velky?: boolean }) {
  if (!datum) return null;
  if (!velky) {
    return (
      <span className={`pointer-events-none absolute left-1 top-1 rounded px-1 py-px text-[10px] font-semibold leading-tight text-white shadow ${barva(datum)}`}
        title={`Naskenováno ${dateCz(datum)} (${stariCz(datum)})`}>
        {dateCz(datum)}
      </span>
    );
  }
  return (
    <div className={`pointer-events-none rounded-xl px-4 py-2 text-white shadow-lg ${barva(datum)}`}>
      <div className="text-[11px] font-medium uppercase tracking-wide opacity-90">Naskenováno</div>
      <div className="text-xl font-bold tabular-nums leading-tight">{dateCz(datum)}</div>
      <div className="text-sm font-medium">{stariCz(datum)}</div>
    </div>
  );
}
