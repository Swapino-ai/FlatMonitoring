"use client";

import { useState, useTransition } from "react";
import { porovnejPojistky } from "@/lib/pojistkyActions";
import type { PorovnaniPojistek as Vysledek } from "@/lib/pojistkaAi";
import { Badge } from "./Stat";

/** Tlacitko: AI porovna pojisteni vsech nemovitosti (z vytazenych udaju smluv). */
export function PorovnaniPojistek({ aiZapnuto }: { aiZapnuto: boolean }) {
  const [bezi, spust] = useTransition();
  const [v, setV] = useState<Vysledek | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  if (!aiZapnuto) return <p className="text-xs text-ink-muted">Porovnání AI je vypnuté (chybí ANTHROPIC_API_KEY).</p>;
  return (
    <div className="space-y-3">
      <button type="button" className="btn btn-primary" disabled={bezi}
        onClick={() => spust(async () => { setChyba(null); const r = await porovnejPojistky(); if (r.error) setChyba(r.error); else setV(r.vysledek ?? null); })}>
        {bezi ? "AI porovnává…" : v ? "Porovnat znovu" : "Porovnat pojistky AI"}
      </button>
      {chyba && <p className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">{chyba}</p>}
      {v && (
        <div className="space-y-2 text-sm">
          <p>{v.shrnuti}</p>
          <ul className="space-y-1">
            {v.doporuceni.map((d, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-2">
                <Badge tone={d.uroven === "OK" ? "good" : d.uroven === "POZOR" ? "warn" : "bad"}>{d.nemovitost}</Badge>
                <span className="text-ink-secondary">{d.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
