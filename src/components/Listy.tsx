"use client";

import { useEffect, useState, type ReactNode } from "react";

export interface List {
  id: string;
  nazev: string;
  /** Drobne cislo u nazvu — kolik polozek list obsahuje. */
  pocet?: number;
  /** Na zalozce je neco, co chce pozornost — ukaze se tecka, i kdyz je otevrena jina. */
  varovani?: boolean;
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
      {/* Zalozky jako segmentovany prepinac: aktivni je vyplneny, ostatni jen text.
          Na telefonu se posouvaji do strany, ne lamou na druhy radek. */}
      <div className="max-w-full overflow-x-auto pb-1">
        <div role="tablist" className="flex w-fit gap-1 rounded-2xl bg-surface-card p-1 shadow-card">
          {listy.map((l) => {
            const je = l.id === aktivni;
            return (
              <button
                key={l.id}
                role="tab"
                aria-selected={je}
                onClick={() => prepni(l.id)}
                className={`whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors ${
                  je ? "bg-accent text-white" : "text-ink-secondary hover:bg-surface-sunken hover:text-ink-primary"
                }`}
              >
                {l.nazev}
                {l.varovani && (
                  <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-warn align-middle" title="Vyžaduje pozornost">
                    <span className="sr-only">vyžaduje pozornost</span>
                  </span>
                )}
                {l.pocet != null && l.pocet > 0 && (
                  <span className={`ml-1.5 rounded-md px-1.5 py-0.5 text-[11px] ${
                    je ? "bg-white/20 text-white" : "bg-surface-sunken text-ink-muted"
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
