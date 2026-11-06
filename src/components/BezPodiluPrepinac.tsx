import Link from "next/link";

/** Odkaz Zobrazit / Schovat nemovitosti, na kterych zvoleny vlastnik nema podil. */
export function BezPodiluPrepinac({ pocet, zobrazeno, cesta }: { pocet: number; zobrazeno: boolean; cesta: string }) {
  if (!pocet) return null;
  return (
    <p className="no-print rounded-lg bg-surface-sunken px-3 py-2 text-sm text-ink-secondary">
      {zobrazeno
        ? <>Zobrazeny i nemovitosti bez podílu ({pocet}). <Link href={cesta} className="font-medium text-accent hover:underline">Schovat je</Link></>
        : <>{pocet} {pocet === 1 ? "nemovitost bez podílu je schovaná" : pocet < 5 ? "nemovitosti bez podílu jsou schované" : "nemovitostí bez podílu je schovaných"}.{" "}
            <Link href={`${cesta}?bezPodilu=1`} className="font-medium text-accent hover:underline">Zobrazit</Link></>}
    </p>
  );
}
