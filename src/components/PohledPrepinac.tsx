"use client";

import { useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Vyber pohledu: cele portfolio, muj podil nebo podil jineho vlastnika.
 * Jde o formular, ne o stav v prohlizeci — cisla pocita server a musi se
 * prepocitat cela stranka.
 */
export function PohledPrepinac({ volba, moznosti }: { volba: string; moznosti: { value: string; label: string }[] }) {
  const pathname = usePathname();
  const params = useSearchParams().toString();
  const kam = pathname + (params ? `?${params}` : "");
  const form = useRef<HTMLFormElement>(null);

  return (
    <form ref={form} action="/api/pohled" method="post" className="no-print">
      <input type="hidden" name="kam" value={kam} />
      <select name="pohled" aria-label="Zobrazit" defaultValue={volba} onChange={() => form.current?.requestSubmit()}
        className={`max-w-[11rem] rounded-lg border px-2 py-1 text-xs font-medium sm:max-w-[14rem] ${
          volba === "vse" ? "border-line bg-surface-card text-ink-secondary" : "border-warn bg-warn/15 text-ink-primary"}`}>
        {moznosti.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
      </select>
      <noscript><button type="submit" className="ml-1 text-xs">OK</button></noscript>
    </form>
  );
}
