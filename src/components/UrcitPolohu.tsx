"use client";

import { useState, useTransition } from "react";
import { urciPolohu, type PolohaStav } from "@/lib/polohaActions";

/** Tlacitko, ktere z ulozene adresy dopocita polohu a mapa se hned ukaze. */
export function UrcitPolohu({ propertyId }: { propertyId: string }) {
  const [stav, setStav] = useState<PolohaStav>({});
  const [bezi, start] = useTransition();

  return (
    <div className="space-y-2">
      <button
        type="button"
        className="btn btn-primary"
        disabled={bezi}
        onClick={() => start(async () => setStav(await urciPolohu(propertyId)))}
      >
        {bezi ? "Hledám…" : "Určit polohu z adresy"}
      </button>
      {stav.error && <p className="text-sm text-bad">{stav.error}</p>}
      {stav.success && <p className="text-sm text-good">{stav.success}</p>}
    </div>
  );
}
