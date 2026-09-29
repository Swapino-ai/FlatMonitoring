"use client";

import { useEffect, useState, type ReactNode } from "react";

export interface List {
  id: string;
  nazev: string;
  /** Drobne cislo u nazvu — kolik polozek list obsahuje. */
  pocet?: number;
  obsah: ReactNode;
}

/**
 * Listy nemovitosti.
 *
 * Detail nemovitosti mel pres dvacet karet pod sebou a k pohybum se scrollovalo
 * pres odpisy. Clenenim na listy je na obrazovce vzdy jen to, co clovek zrovna
 * resi.
 *
 * Obsah vsech listu je vykresleny a jen schovany — prepnuti je tak okamzite
 * a nezahodi se rozepsany formular na jinem listu.
 */
export function Listy({ klic, listy }: { klic: string; listy: List[] }) {
  const [aktivni, setAktivni] = useState(listy[0]?.id ?? "");

  // Posledni otevreny list az po pripojeni — jinak by se serverovy vystup
  // neshodoval s tim, co vykresli prohlizec
  useEffect(() => {
    try {
      const ulozeny = localStorage.getItem(`list:${klic}`);
      if (ulozeny && listy.some((l) => l.id === ulozeny)) setAktivni(ulozeny);
    } catch { /* soukrome okno nebo zakazana uloziste — zustane prvni list */ }
  }, [klic, listy]);

  function prepni(id: string) {
    setAktivni(id);
    try {
      localStorage.setItem(`list:${klic}`, id);
    } catch { /* neulozi se, prepnuti presto plati */ }
  }

  return (
    <div>
      <div className="table-scroll -mx-6 px-6">
        <div role="tablist" className="flex gap-1 border-b border-line">
          {listy.map((l) => {
            const je = l.id === aktivni;
            return (
              <button
                key={l.id}
                role="tab"
                aria-selected={je}
                onClick={() => prepni(l.id)}
                className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors ${
                  je
                    ? "border-accent font-medium text-ink-primary"
                    : "border-transparent text-ink-secondary hover:text-ink-primary"
                }`}
              >
                {l.nazev}
                {l.pocet != null && l.pocet > 0 && (
                  <span className={`ml-1.5 rounded px-1.5 py-0.5 text-[11px] ${
                    je ? "bg-accent/15 text-accent" : "bg-surface-sunken text-ink-muted"
                  }`}>
                    {l.pocet}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {listy.map((l) => (
        <div key={l.id} role="tabpanel" hidden={l.id !== aktivni} className="space-y-4 pt-4">
          {l.obsah}
        </div>
      ))}
    </div>
  );
}
