import { nazevNemovitosti } from "@/lib/catalogs";
import { MAX_OKRUH_KM } from "@/lib/geo";
import { OKRUHY_PREHLED, POSTUP, STARI_DNU } from "@/lib/market/pravidla";

/**
 * Popis, jak odhad vznika. Cte se z pravidel, ne z pameti autora — kdyz se
 * zmeni cislo v kodu, zmeni se i tady.
 */
export function JakVznikaOdhad({ nastaveniJednotky }: {
  nastaveniJednotky?: { okruhKm: number | null; vyloucenaMesta: string | null };
}) {
  return (
    <div className="space-y-4">
      <ol className="space-y-3">
        {POSTUP.map((k) => (
          <li key={k.nadpis}>
            <div className="text-sm font-medium">{k.nadpis}</div>
            <p className="mt-0.5 text-sm text-ink-secondary">{k.popis}</p>
            {k.nastaveni && (
              <p className="mt-1 text-xs text-accent">Nastavitelné u jednotky: {k.nastaveni}</p>
            )}
          </li>
        ))}
      </ol>

      <div className="rounded-card bg-surface-sunken p-3">
        <div className="label mb-2">Výchozí okruh podle druhu</div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-secondary">
          {OKRUHY_PREHLED.map((o) => (
            <span key={o.klic}>{nazevNemovitosti(o.klic)} <strong>{o.km} km</strong></span>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          Rozšiřuje se zdvojnásobováním až do {MAX_OKRUH_KM} km. Prodejní nabídky se počítají
          {" "}{STARI_DNU.SALE} dnů zpětně, nájemní {STARI_DNU.RENT} — nájem se hýbe rychleji.
        </p>
      </div>

      {nastaveniJednotky && (
        <div className="rounded-card border border-accent/30 bg-accent/5 p-3">
          <div className="label mb-1.5">U této jednotky</div>
          <ul className="space-y-1 text-sm">
            <li>
              Okruh: <strong>{nastaveniJednotky.okruhKm ? `pevně ${nastaveniJednotky.okruhKm} km` : "automaticky"}</strong>
            </li>
            <li>
              Nezapočítávané obce:{" "}
              <strong>{nastaveniJednotky.vyloucenaMesta || "žádné"}</strong>
            </li>
          </ul>
          <p className="mt-2 text-xs text-ink-muted">Změníš to v úpravách nemovitosti.</p>
        </div>
      )}
    </div>
  );
}
