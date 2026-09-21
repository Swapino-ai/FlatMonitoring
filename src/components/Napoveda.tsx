"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TERMS } from "@/lib/terms";

/**
 * Vysvetlivka k ukazateli. Vykresluje se pres portal s pevnym pozicovanim,
 * protoze uvnitr tabulek s vodorovnym posuvem by ji orizl overflow.
 *
 * Otevira se najetim mysi, focusem z klavesnice i klepnutim na dotykovem
 * displeji — tam zadne "najeti" neexistuje.
 */
export function Napoveda({ term, children }: { term: keyof typeof TERMS | string; children?: React.ReactNode }) {
  const t = TERMS[term];
  const [otevreno, setOtevreno] = useState(false);
  const [pozice, setPozice] = useState<{ top: number; left: number; sirka: number } | null>(null);
  const spoust = useRef<HTMLButtonElement>(null);
  // Dotyk vyvola nejdriv pointerenter a hned pote click. Bez rozliseni typu
  // ukazatele by se bublina otevrela a tymz gestem zase zavrela.
  const typUkazatele = useRef<string>("mouse");
  // Dotyk navic vyvola focus, ktery bublinu otevre jeste pred kliknutim.
  // Pamatujeme si proto stav pred celym gestem, ne ten mezitim zmeneny.
  const stavPredGestem = useRef(false);
  const id = useId();

  useEffect(() => {
    if (!otevreno) return;

    const spocitej = () => {
      const r = spoust.current?.getBoundingClientRect();
      if (!r) return;
      // Kdyz stranka preteka, window.innerWidth je sirsi nez to, co uzivatel vidi
      const oknoSirka = Math.min(
        window.visualViewport?.width ?? window.innerWidth,
        document.documentElement.clientWidth || window.innerWidth,
      );
      const sirka = Math.min(320, oknoSirka - 24);
      // Drzime bublinu v okne, at nevyleze za okraj
      const left = Math.min(Math.max(12, r.left + r.width / 2 - sirka / 2), oknoSirka - sirka - 12);
      const podSpousti = r.bottom + 8;
      const vejdeSeDolu = podSpousti + 200 < window.innerHeight;
      setPozice({ top: vejdeSeDolu ? podSpousti : Math.max(12, r.top - 8 - 200), left, sirka });
    };

    spocitej();
    const zavri = (e: KeyboardEvent) => { if (e.key === "Escape") setOtevreno(false); };
    window.addEventListener("scroll", spocitej, true);
    window.addEventListener("resize", spocitej);
    document.addEventListener("keydown", zavri);
    return () => {
      window.removeEventListener("scroll", spocitej, true);
      window.removeEventListener("resize", spocitej);
      document.removeEventListener("keydown", zavri);
    };
  }, [otevreno]);

  if (!t) return <>{children}</>;

  return (
    <>
      <button
        ref={spoust}
        type="button"
        aria-describedby={otevreno ? id : undefined}
        aria-label={`Co znamená ${t.nazev}`}
        className="group inline-flex items-baseline gap-1 text-left"
        onPointerDown={(e) => {
          typUkazatele.current = e.pointerType || "mouse";
          stavPredGestem.current = otevreno;
        }}
        onPointerEnter={(e) => { if (e.pointerType === "mouse") setOtevreno(true); }}
        onPointerLeave={(e) => { if (e.pointerType === "mouse") setOtevreno(false); }}
        onFocus={() => setOtevreno(true)}
        onBlur={() => setOtevreno(false)}
        onClick={(e) => {
          e.preventDefault();
          // Mys uz stav resi najetim; prepiname jen u dotyku a pera
          if (typUkazatele.current !== "mouse") setOtevreno(!stavPredGestem.current);
        }}
      >
        {children}
        <span
          aria-hidden
          className="inline-flex h-3.5 w-3.5 shrink-0 translate-y-px items-center justify-center rounded-full border border-current text-[9px] font-semibold opacity-50 transition-opacity group-hover:opacity-100"
        >
          ?
        </span>
      </button>

      {otevreno && pozice && typeof document !== "undefined" && createPortal(
        <div
          id={id}
          role="tooltip"
          style={{ top: pozice.top, left: pozice.left, width: pozice.sirka }}
          className="pointer-events-none fixed z-50 rounded-card border border-line bg-surface-card p-3.5 shadow-xl"
        >
          <div className="text-sm font-semibold text-ink-primary">{t.nazev}</div>
          <p className="mt-1.5 text-xs leading-relaxed text-ink-secondary">{t.popis}</p>
          {t.vzorec && (
            <p className="mt-2 rounded bg-surface-sunken px-2 py-1.5 font-mono text-[11px] leading-relaxed text-ink-secondary">
              {t.vzorec}
            </p>
          )}
          {t.vyklad && (
            <p className="mt-2 border-t border-line pt-2 text-xs leading-relaxed text-ink-primary">{t.vyklad}</p>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
