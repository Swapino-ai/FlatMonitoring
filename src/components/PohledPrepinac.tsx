"use client";

import { usePathname, useSearchParams } from "next/navigation";
import type { Pohled } from "@/lib/ownership";

/**
 * Prepinac mezi vlastnim podilem a celym portfoliem.
 * Jde o formular, ne o stav v prohlizeci — cisla pocita server a musi se
 * prepocitat cela stranka.
 */
export function PohledPrepinac({ pohled }: { pohled: Pohled }) {
  const pathname = usePathname();
  const params = useSearchParams().toString();
  const kam = pathname + (params ? `?${params}` : "");

  return (
    <form action="/api/pohled" method="post" className="no-print flex rounded-lg border border-line p-0.5">
      <input type="hidden" name="kam" value={kam} />
      {([
        ["moje", "Můj podíl"],
        ["vse", "Celé portfolio"],
      ] as [Pohled, string][]).map(([hodnota, popisek]) => (
        <button
          key={hodnota}
          type="submit"
          name="pohled"
          value={hodnota}
          aria-pressed={pohled === hodnota}
          className={`whitespace-nowrap rounded px-2.5 py-1 text-xs transition-colors ${
            pohled === hodnota ? "bg-accent font-medium text-white" : "text-ink-secondary hover:text-ink-primary"
          }`}
        >
          {popisek}
        </button>
      ))}
    </form>
  );
}
