import type { AiNahled } from "@/lib/market/aiNahled";
import type { Profil } from "@/lib/market/profily";

/**
 * Co AI vyčetla z textu inzerátu: vlastnosti podle profilu typu (zdůvodnění v bublině),
 * drobné údaje a jednovětné shrnutí. Jen k náhledu — rozhoduje ruční volba.
 */
export function AiInfo({ ai, profil, kompaktni = false }: { ai: AiNahled | null | undefined; profil: Profil; kompaktni?: boolean }) {
  if (!ai) return null;
  const znamé = profil.vlastnosti.filter((v) => ai.hodnoty[v.klic]);
  return (
    <div className={`space-y-1 ${kompaktni ? "text-[11px]" : "text-xs"}`}>
      <div className="flex flex-wrap items-center gap-1">
        <span className="rounded bg-accent/15 px-1.5 py-0.5 font-semibold text-accent" title="Vyčteno AI z textu stránky inzerátu">AI</span>
        {znamé.map((v) => (
          <span key={v.klic} className={`rounded-full px-2 py-0.5 ${v.hlavni ? "bg-surface-sunken" : "border border-line text-ink-secondary"}`}
            title={ai.duvody[v.klic] ? `${v.nazev}: ${ai.duvody[v.klic]}` : v.nazev}>
            {v.hlavni ? "" : `${v.nazev}: `}{v.moznosti[ai.hodnoty[v.klic]]}
          </span>
        ))}
        {znamé.length === 0 && <span className="text-ink-muted">nic z inzerátu nepoznala</span>}
        {ai.stitky.map((s) => <span key={s} className="rounded-full border border-line px-2 py-0.5 text-ink-muted">{s}</span>)}
      </div>
      {ai.shrnuti && <div className={`italic text-ink-secondary ${kompaktni ? "line-clamp-1" : ""}`} title={ai.shrnuti}>{ai.shrnuti}</div>}
    </div>
  );
}
