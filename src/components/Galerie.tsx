"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface PolozkaGalerie {
  src: string;
  /** Napr. "Screenshot stránky 17. 10. 2026" */
  popis?: string;
  /** Dlouhy obrazek (screenshot cele stranky): zobrazit na sirku a posouvat svisle */
  posouvat?: boolean;
}

/**
 * Galerie fotek inzeratu: mrizka nahledu, klik zvetsi fotku a v ni se lze posouvat
 * sipkami (tlacitka, klavesy ← →, tazeni prstem). Esc zavre zvetseni, pak galerii.
 */
export function Galerie({ polozky, onZavrit }: { polozky: PolozkaGalerie[]; onZavrit: () => void }) {
  const [index, setIndex] = useState<number | null>(null);
  const startX = useRef<number | null>(null);

  const posun = useCallback((o: number) => {
    setIndex((i) => (i == null ? i : (i + o + polozky.length) % polozky.length));
  }, [polozky.length]);

  useEffect(() => {
    const klavesy = (e: KeyboardEvent) => {
      if (e.key === "Escape") { if (index != null) setIndex(null); else onZavrit(); }
      else if (index != null && e.key === "ArrowRight") posun(1);
      else if (index != null && e.key === "ArrowLeft") posun(-1);
    };
    window.addEventListener("keydown", klavesy);
    const puvodni = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", klavesy); document.body.style.overflow = puvodni; };
  }, [index, onZavrit, posun]);

  const tlacitko = "flex items-center justify-center rounded-full bg-white/90 text-ink-primary shadow hover:bg-white";

  if (index != null) {
    const p = polozky[index];
    return (
      <div className="fixed inset-0 z-[2000] flex flex-col bg-black/95" onClick={() => setIndex(null)}>
        <div className="flex items-center justify-between gap-3 p-3 text-sm text-white/80" onClick={(e) => e.stopPropagation()}>
          <span className="truncate">{index + 1} / {polozky.length}{p.popis ? ` · ${p.popis}` : ""}</span>
          <span className="flex shrink-0 gap-2">
            <a href={p.src} target="_blank" rel="noreferrer" className="rounded-full bg-white/15 px-3 py-1 hover:bg-white/25">Otevřít ↗</a>
            <button type="button" className="rounded-full bg-white/15 px-3 py-1 hover:bg-white/25" onClick={() => setIndex(null)}>Všechny fotky</button>
            <button type="button" className="rounded-full bg-white/15 px-3 py-1 hover:bg-white/25" onClick={onZavrit}>Zavřít ✕</button>
          </span>
        </div>
        <div className={`relative min-h-0 flex-1 px-2 pb-4 ${p.posouvat ? "overflow-y-auto" : "flex items-center justify-center"}`}
          onPointerDown={(e) => { startX.current = e.clientX; }}
          onPointerUp={(e) => {
            if (startX.current == null) return;
            const d = e.clientX - startX.current;
            startX.current = null;
            if (Math.abs(d) > 50) posun(d < 0 ? 1 : -1);
          }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.src} alt={p.popis ?? `Fotka ${index + 1}`} referrerPolicy="no-referrer" draggable={false}
            className={p.posouvat
              ? "mx-auto block w-full max-w-[1280px] select-none rounded-lg"
              : "max-h-full max-w-full select-none rounded-lg object-contain"}
            onClick={(e) => e.stopPropagation()} />
          {polozky.length > 1 && (
            <>
              <button type="button" aria-label="Předchozí" onClick={(e) => { e.stopPropagation(); posun(-1); }}
                className={`${tlacitko} fixed left-3 top-1/2 h-12 w-12 -translate-y-1/2 text-2xl`}>‹</button>
              <button type="button" aria-label="Další" onClick={(e) => { e.stopPropagation(); posun(1); }}
                className={`${tlacitko} fixed right-3 top-1/2 h-12 w-12 -translate-y-1/2 text-2xl`}>›</button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[2000] overflow-y-auto bg-black/85 p-4" onClick={onZavrit}>
      <div className="mx-auto mb-3 flex max-w-6xl items-center justify-between text-sm text-white/80" onClick={(e) => e.stopPropagation()}>
        <span>{polozky.length} {polozky.length === 1 ? "obrázek" : polozky.length < 5 ? "obrázky" : "obrázků"} · kliknutím zvětšíš</span>
        <button type="button" className="rounded-full bg-white px-3 py-1 text-ink-primary" onClick={onZavrit}>Zavřít ✕</button>
      </div>
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4" onClick={(e) => e.stopPropagation()}>
        {polozky.map((p, k) => (
          <button key={p.src + k} type="button" onClick={() => setIndex(k)} className="group relative aspect-[4/3] overflow-hidden rounded-lg bg-white/10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.src} alt={p.popis ?? `Fotka ${k + 1}`} loading="lazy" referrerPolicy="no-referrer"
              className={`h-full w-full transition-transform group-hover:scale-105 ${p.popis ? "object-cover object-top" : "object-cover"}`} />
            {p.popis && <span className="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1 text-left text-xs text-white">{p.popis}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
