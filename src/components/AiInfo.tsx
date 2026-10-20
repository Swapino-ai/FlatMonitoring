"use client";

import { useState } from "react";
import type { PodminkyNajmu } from "@/lib/market/aiParametry";
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
      {ai.najem && <PlatbyNajmu n={ai.najem} />}
    </div>
  );
}

const kc = (x: number) => `${x.toLocaleString("cs-CZ")} Kč`;

/**
 * Jak se u pronajmu plati: najem, pod nim sluzby (soucet). Najetim mysi (na mobilu
 * klepnutim) se rozbali bublina s rozpisem sluzeb, energiemi, kauci a provizi.
 */
function PlatbyNajmu({ n }: { n: PodminkyNajmu }) {
  const [otevreno, setOtevreno] = useState(false);
  const polozky = n.polozky ?? [];
  const soucetPolozek = polozky.reduce((a, x) => a + (x.castka ?? 0), 0);
  const sluzby = n.sluzby ?? (soucetPolozek > 0 ? soucetPolozek : null);
  const detail = polozky.length > 0 || n.energie || n.kauce != null || n.provize != null || n.popis;
  if (n.najem == null && sluzby == null && !detail) return null;
  return (
    <div className="relative inline-block" onMouseEnter={() => setOtevreno(true)} onMouseLeave={() => setOtevreno(false)}>
      <button type="button" onClick={() => setOtevreno((x) => !x)} aria-expanded={otevreno}
        className="rounded-lg border border-line px-2 py-1 text-left tabular-nums hover:border-accent">
        <div><span className="text-ink-muted">Nájem</span> <strong className="text-ink-primary">{n.najem != null ? kc(n.najem) : "—"}</strong></div>
        <div className="text-ink-secondary">
          <span className="text-ink-muted">Služby</span> {sluzby != null ? kc(sluzby) : "neuvedeno"}
          {detail && <span className="ml-1 text-accent">ⓘ</span>}
        </div>
        {n.najem != null && sluzby != null && <div className="text-ink-muted">celkem {kc(n.najem + sluzby)}/měs.</div>}
      </button>
      {otevreno && detail && (
        <div role="tooltip" className="absolute left-0 top-full z-30 mt-1 w-72 rounded-xl border border-line bg-surface-card p-3 text-xs shadow-lg">
          <div className="mb-1.5 font-semibold text-ink-primary">Co nájemce platí</div>
          <table className="w-full tabular-nums">
            <tbody>
              {n.najem != null && <tr><td className="py-0.5">Nájem</td><td className="py-0.5 text-right font-medium">{kc(n.najem)}</td></tr>}
              {polozky.map((x, i) => (
                <tr key={i} className="text-ink-secondary"><td className="py-0.5 pl-2">{x.nazev}</td><td className="py-0.5 text-right">{x.castka != null ? kc(x.castka) : "—"}</td></tr>
              ))}
              {sluzby != null && (
                <tr className="border-t border-line"><td className="py-0.5">Služby celkem</td><td className="py-0.5 text-right font-medium">{kc(sluzby)}</td></tr>
              )}
              {n.najem != null && sluzby != null && (
                <tr className="font-semibold text-ink-primary"><td className="py-0.5">Měsíčně celkem</td><td className="py-0.5 text-right">{kc(n.najem + sluzby)}</td></tr>
              )}
            </tbody>
          </table>
          <div className="mt-2 space-y-0.5 text-ink-secondary">
            {n.energie && <div>Energie: {n.energie}</div>}
            {n.kauce != null && <div>Kauce: {kc(n.kauce)}</div>}
            {n.provize != null && <div>{n.provize === 0 ? "Bez provize" : `Provize: ${kc(n.provize)}`}</div>}
          </div>
          {n.popis && <div className="mt-2 italic text-ink-muted">{n.popis}</div>}
        </div>
      )}
    </div>
  );
}
