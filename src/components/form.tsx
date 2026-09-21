"use client";

import { useEffect, useState, type ReactNode } from "react";

export function Pole({ label, name, hint, sirka = "", ...rest }: {
  label: string; name: string; hint?: string; sirka?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={sirka}>
      <label className="label mb-1.5 block" htmlFor={name}>{label}</label>
      <input id={name} name={name} className="input" {...rest} />
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

export function Vyber({ label, name, options, defaultValue, hint, sirka = "" }: {
  label: string; name: string; options: [string, string][]; defaultValue?: string; hint?: string; sirka?: string;
}) {
  return (
    <div className={sirka}>
      <label className="label mb-1.5 block" htmlFor={name}>{label}</label>
      <select id={name} name={name} defaultValue={defaultValue} className="input">
        {options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

export function Zaskrtavatko({ label, name, defaultChecked, hint }: {
  label: string; name: string; defaultChecked?: boolean; hint?: string;
}) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={defaultChecked}
        className="mt-0.5 h-4 w-4 rounded border-line accent-accent" />
      <span>
        {label}
        {hint && <span className="block text-xs text-ink-muted">{hint}</span>}
      </span>
    </label>
  );
}

/**
 * Formular schovany pod tlacitkem, aby stranka nebyla zahlcena poli.
 * Po uspesnem ulozeni se sam zavre — jinak by v nem zustaly vyplnene hodnoty
 * a snadno by vznikl duplicitni zaznam.
 */
export function Rozbalovaci({ popisek, children, otevreno = false, zavritPo }: {
  popisek: string; children: ReactNode; otevreno?: boolean;
  /** Zmena teto hodnoty (zprava o uspechu) formular zavre. */
  zavritPo?: string;
}) {
  const [open, setOpen] = useState(otevreno);

  useEffect(() => {
    if (zavritPo) setOpen(false);
  }, [zavritPo]);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn mt-3 w-full border-dashed text-ink-secondary">
        + {popisek}
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-card border border-line bg-surface-sunken/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium">{popisek}</h3>
        <button onClick={() => setOpen(false)} className="text-xs text-ink-muted hover:text-ink-primary">Zavřít</button>
      </div>
      {children}
    </div>
  );
}

export function Hlaska({ state }: { state: { error?: string; success?: string } }) {
  if (!state.error && !state.success) return null;
  return (
    <p className={`mb-3 rounded-lg px-3 py-2 text-sm ${state.error ? "bg-bad/10 text-bad" : "bg-good/10 text-good"}`}>
      {state.error ?? state.success}
    </p>
  );
}

export function SmazatTlacitko({ action, id, potvrzeni }: {
  action: (payload: FormData) => void; id: string; potvrzeni: string;
}) {
  return (
    <form action={action} onSubmit={(e) => { if (!confirm(potvrzeni)) e.preventDefault(); }}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="text-xs text-bad hover:underline">Smazat</button>
    </form>
  );
}
