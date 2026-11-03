"use client";

import { useEffect, useState, useTransition } from "react";
import { prepocitejStavUctu, type PlatbyState } from "@/lib/pravidelnePlatbyActions";
import { Hlaska } from "./form";
import { Ikona } from "./Ikony";

/**
 * Tlacitko "Přepočítat podle smluv" na strance Stav uctu: po zmene smlouvy prepise historicke
 * platby na castky podle soucasnych smluv. Pred spustenim varovani v okne (jako ostatni okna platby).
 */
export function PrepocetStavuUctu({ propertyId }: { propertyId: string }) {
  const [okno, setOkno] = useState(false);
  const [stav, setStav] = useState<PlatbyState>({});
  const [bezi, spust] = useTransition();
  useEffect(() => {
    if (!okno) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOkno(false); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [okno]);

  return (
    <div>
      <Hlaska state={stav} />
      <button type="button" className="btn text-xs" disabled={bezi} onClick={() => setOkno(true)}>
        {bezi ? "Přepočítávám…" : "Přepočítat podle smluv"}
      </button>
      {okno && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOkno(false)}>
          <div role="alertdialog" aria-modal="true" aria-label="Přepočítat stav účtu zpětně" onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-card border border-line bg-surface-card p-5 shadow-pop">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Ikona nazev="pozor" trida="h-4 w-4 text-bad" /> Přepočítat stav účtu zpětně?
            </h3>
            <div className="space-y-2 rounded-lg bg-bad/10 px-3 py-2 text-sm text-ink-secondary">
              <p><strong className="text-bad">Může dojít ke ztrátě dat.</strong> Všechny historické platby se přepíšou podle současných smluv a služeb:</p>
              <ul className="list-disc space-y-0.5 pl-5 text-xs">
                <li>zaplacené platby dostanou částku podle současného předpisu (datum zaplacení zůstane),</li>
                <li>ručně upravené částky se přepíšou,</li>
                <li>platby, které už v předpisu nejsou (např. po změně data smlouvy), se smažou.</li>
              </ul>
              <p className="text-xs">Platby spárované z banky zůstanou se skutečnou částkou. Vrátit to nejde.</p>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn" onClick={() => setOkno(false)}>Zrušit</button>
              <button type="button" className="btn bg-bad text-white hover:bg-bad/90" disabled={bezi}
                onClick={() => { setOkno(false); spust(async () => setStav(await prepocitejStavUctu(propertyId))); }}>Přepočítat</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
