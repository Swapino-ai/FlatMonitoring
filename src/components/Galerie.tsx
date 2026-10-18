"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DatumSkenu } from "./DatumSkenu";

export interface PolozkaGalerie {
  src: string;
  /** Napr. "Screenshot stránky 17. 10. 2026" */
  popis?: string;
  /** Dlouhy obrazek (screenshot cele stranky): zobrazit na sirku a posouvat svisle */
  posouvat?: boolean;
}

/**
 * Galerie fotek inzeratu: otevre se rovnou zvetsene (prvni byva screenshot stranky)
 * a listuje se sipkami (tlacitka, klavesy ← →, tazeni prstem). Esc nebo klik vedle zavre.
 */
export function Galerie({ polozky, onZavrit, rovnou = 0, naskenovano }: {
  polozky: PolozkaGalerie[];
  onZavrit: () => void;
  /** Kterou polozkou zacit (vychozi prvni) */
  rovnou?: number;
  /** Kdy sken inzerat nasel — zobrazi se vyrazne pres fotky */
  naskenovano?: string | Date | null;
}) {
  const [index, setIndex] = useState(Math.min(rovnou, Math.max(0, polozky.length - 1)));
  const startX = useRef<number | null>(null);

  const posun = useCallback((o: number) => {
    setIndex((i) => (i + o + polozky.length) % polozky.length);
  }, [polozky.length]);

  useEffect(() => {
    const klavesy = (e: KeyboardEvent) => {
      if (e.key === "Escape") onZavrit();
      else if (e.key === "ArrowRight") posun(1);
      else if (e.key === "ArrowLeft") posun(-1);
    };
    window.addEventListener("keydown", klavesy);
    const puvodni = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", klavesy); document.body.style.overflow = puvodni; };
  }, [onZavrit, posun]);

  const tlacitko = "flex items-center justify-center rounded-full bg-white/90 text-ink-primary shadow hover:bg-white";

  const p = polozky[index];
  if (!p) return null;
  return (
    <div className="fixed inset-0 z-[2000] flex flex-col bg-black/95" onClick={onZavrit}>
      <div className="flex items-center justify-between gap-3 p-3 text-sm text-white/80" onClick={(e) => e.stopPropagation()}>
        <span className="truncate">{index + 1} / {polozky.length}{p.popis ? ` · ${p.popis}` : ""}</span>
        <span className="flex shrink-0 gap-2">
          <a href={p.src} target="_blank" rel="noreferrer" className="rounded-full bg-white/15 px-3 py-1 hover:bg-white/25">Otevřít ↗</a>
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
        {naskenovano && <div className="fixed left-4 top-16 z-10"><DatumSkenu datum={naskenovano} velky /></div>}
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
