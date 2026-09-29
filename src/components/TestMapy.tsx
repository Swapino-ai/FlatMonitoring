"use client";

import { useState, useTransition } from "react";
import { otestujMapy, type VysledekTestu } from "@/lib/mapyTest";

/**
 * Tlacitko, ktere klic opravdu vyzkousi. Bez toho by se chyba poznala az tim,
 * ze uzivateli nejde vyplnit adresa.
 */
export function TestMapy() {
  const [vysledky, setVysledky] = useState<VysledekTestu[] | null>(null);
  const [bezi, start] = useTransition();

  return (
    <div className="space-y-2">
      <button type="button" disabled={bezi} className="btn"
        onClick={() => start(async () => setVysledky(await otestujMapy()))}>
        {bezi ? "Zkouším…" : vysledky ? "Vyzkoušet znovu" : "Vyzkoušet připojení k Mapy.cz"}
      </button>

      {vysledky?.map((v) => (
        <div key={v.nazev} className={`rounded-lg px-3 py-2 text-sm ${v.ok ? "bg-good/10" : "bg-bad/10"}`}>
          <span className={`font-medium ${v.ok ? "text-good" : "text-bad"}`}>
            {v.ok ? "✓" : "✕"} {v.nazev}
          </span>
          <p className="text-xs text-ink-secondary">{v.detail}</p>
        </div>
      ))}
    </div>
  );
}
