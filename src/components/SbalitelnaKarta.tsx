"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Karta, kterou jde sbalit — a ktera si to pamatuje.
 *
 * Co clovek nepotrebuje, at pri nabehu stranky neprekazi. Stav se drzi
 * v prohlizeci u kazde karty zvlast, takze sbalene zustane sbalene i priste.
 *
 * Sbalena karta neni prazdna: v zahlavi zustane shrnuti, aby se kvuli jednomu
 * cislu nemusela rozbalovat.
 */
export function SbalitelnaKarta({ klic, title, action, shrnuti, vychoziSbalena = false, children }: {
  /** Musi byt jedinecny v ramci prohlizece — jinak by si karty stav pletly. */
  klic: string;
  title: string;
  action?: ReactNode;
  shrnuti?: ReactNode;
  vychoziSbalena?: boolean;
  children: ReactNode;
}) {
  const [otevrena, setOtevrena] = useState(!vychoziSbalena);

  useEffect(() => {
    try {
      const ulozeny = localStorage.getItem(`karta:${klic}`);
      if (ulozeny === "1") setOtevrena(true);
      else if (ulozeny === "0") setOtevrena(false);
    } catch { /* bez uloziste plati vychozi stav */ }
  }, [klic]);

  function prepni() {
    const novy = !otevrena;
    setOtevrena(novy);
    try {
      localStorage.setItem(`karta:${klic}`, novy ? "1" : "0");
    } catch { /* neulozi se, prepnuti presto plati */ }
  }

  return (
    <section className="card">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={prepni}
          className="group flex min-w-0 items-center gap-2 text-left"
          aria-expanded={otevrena}>
          <span className={`text-ink-muted transition-transform group-hover:text-ink-primary ${
            otevrena ? "rotate-90" : ""
          }`} aria-hidden>›</span>
          <h2 className="card-title truncate">{title}</h2>
          {!otevrena && shrnuti && (
            <span className="truncate text-sm text-ink-secondary">· {shrnuti}</span>
          )}
        </button>
        {otevrena && action}
      </div>

      {otevrena && <div className="mt-4">{children}</div>}
    </section>
  );
}
