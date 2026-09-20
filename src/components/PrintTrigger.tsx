"use client";

import { useEffect } from "react";

/**
 * Otevre tiskovy dialog, kdyz se na /report prijde s ?tisk=1.
 * Takhle vznika PDF v prostredi, kde server nema Chromium — vzhled je stejny,
 * protoze se pouziji tytez tiskove styly.
 */
export function PrintTrigger({ active }: { active: boolean }) {
  useEffect(() => {
    if (!active) return;
    // Pockej, az se dokresli grafy, jinak by se vytiskly prazdne
    const timer = setTimeout(() => window.print(), 1200);
    return () => clearTimeout(timer);
  }, [active]);

  return null;
}
