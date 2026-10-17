import type { AiNahled } from "@/lib/market/aiNahled";
import { STAVY_BYTU, TYPY_DOMU } from "@/lib/market/zarazeni";

/**
 * Co AI vycetla z textu inzeratu: typ domu a stav (zdůvodnění v bublině), doplňkové
 * údaje a jednovětné shrnutí. Jen k náhledu — rozhoduje ruční volba.
 */
export function AiInfo({ ai, kompaktni = false }: { ai: AiNahled | null | undefined; kompaktni?: boolean }) {
  if (!ai) return null;
  const typ = ai.typDomu ? TYPY_DOMU[ai.typDomu as keyof typeof TYPY_DOMU] ?? ai.typDomu : null;
  const stav = ai.stavBytu ? STAVY_BYTU[ai.stavBytu as keyof typeof STAVY_BYTU] ?? ai.stavBytu : null;
  return (
    <div className={`space-y-1 ${kompaktni ? "text-[11px]" : "text-xs"}`}>
      <div className="flex flex-wrap items-center gap-1">
        <span className="rounded bg-accent/15 px-1.5 py-0.5 font-semibold text-accent" title="Vyčteno AI z textu stránky inzerátu">AI</span>
        <span className="rounded-full bg-surface-sunken px-2 py-0.5" title={ai.typDomuDuvod}>{typ ?? "typ domu neuveden"}</span>
        <span className="rounded-full bg-surface-sunken px-2 py-0.5" title={ai.stavBytuDuvod}>{stav ?? "stav neuveden"}</span>
        {ai.stitky.map((s) => <span key={s} className="rounded-full border border-line px-2 py-0.5 text-ink-secondary">{s}</span>)}
      </div>
      {!kompaktni && (ai.typDomuDuvod || ai.stavBytuDuvod) && (
        <div className="text-ink-muted">
          {[ai.typDomuDuvod && `Dům: ${ai.typDomuDuvod}`, ai.stavBytuDuvod && `Stav: ${ai.stavBytuDuvod}`].filter(Boolean).join(" · ")}
        </div>
      )}
      {ai.shrnuti && <div className="italic text-ink-secondary">{ai.shrnuti}</div>}
    </div>
  );
}
