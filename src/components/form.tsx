"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Ikona } from "./Ikony";

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

export function Vyber({ label, name, options, defaultValue, hint, sirka = "", onChange }: {
  label: string; name: string; options: [string, string][]; defaultValue?: string; hint?: string; sirka?: string;
  /** Vyber zustava neřizeny (defaultValue); tohle jen dava vedet o zmene. */
  onChange?: (hodnota: string) => void;
}) {
  return (
    <div className={sirka}>
      <label className="label mb-1.5 block" htmlFor={name}>{label}</label>
      <select id={name} name={name} defaultValue={defaultValue} className="input"
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}>
        {options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

export function Zaskrtavatko({ label, name, defaultChecked, hint, checked, onChange }: {
  label: string; name: string; defaultChecked?: boolean; hint?: string;
  /** Rizena varianta: kdyz je zadano checked, o stavu rozhoduje volajici. */
  checked?: boolean; onChange?: (hodnota: boolean) => void;
}) {
  const rizene = checked !== undefined;
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" name={name}
        {...(rizene ? { checked, onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange?.(e.target.checked) } : { defaultChecked })}
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

export function Hlaska({ state }: { state: { error?: string; success?: string; warning?: string } }) {
  if (!state.error && !state.success && !state.warning) return null;
  return (
    <div className="mb-3 space-y-2">
      {(state.error || state.success) && (
        <p className={`rounded-lg px-3 py-2 text-sm ${state.error ? "bg-bad/10 text-bad" : "bg-good/10 text-good"}`}>
          {state.error ?? state.success}
        </p>
      )}
      {/* Ulozeno, ale neco nesedi: jina barva nez chyba, protoze nic se nestalo spatne */}
      {state.warning && (
        <p className="flex items-start gap-2 rounded-lg bg-warn/15 px-3 py-2 text-sm text-ink-primary" role="status">
          <Ikona nazev="pozor" trida="mt-0.5 h-4 w-4 text-warn" />
          <span>{state.warning}</span>
        </p>
      )}
    </div>
  );
}

/**
 * Ikona misto slova: v tabulce zabira misto jedno tlacitko misto peti pismen
 * a poznava se driv. Popisek je v title a aria-label, ne jen ve tvaru ikony.
 */
const IKONOVE_TLACITKO =
  "inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";

export function SmazatTlacitko({ action, id, potvrzeni, popisek = "Smazat" }: {
  action: (payload: FormData) => void; id: string; potvrzeni: string; popisek?: string;
}) {
  return (
    <form action={action} onSubmit={(e) => { if (!confirm(potvrzeni)) e.preventDefault(); }} className="inline-flex">
      <input type="hidden" name="id" value={id} />
      <button type="submit" title={popisek} aria-label={popisek}
        className={`${IKONOVE_TLACITKO} hover:bg-bad/10 hover:text-bad`}>
        <Ikona nazev="kos" />
      </button>
    </form>
  );
}

/** Tlacitko pro zahajeni upravy radku. Aktivni (rozeditovany) radek je zvyraznen. */
export function UpravitTlacitko({ onClick, aktivni }: { onClick: () => void; aktivni?: boolean }) {
  const popisek = aktivni ? "Zrušit úpravu" : "Upravit";
  return (
    <button type="button" onClick={onClick} title={popisek} aria-label={popisek} aria-pressed={aktivni}
      className={`${IKONOVE_TLACITKO} ${
        aktivni ? "bg-accent-soft text-accent" : "hover:bg-accent-soft hover:text-accent"
      }`}>
      <Ikona nazev="pero" />
    </button>
  );
}

/**
 * Obal pro rozepsanou upravu radku. Formular se otevira pod tabulkou, ne
 * v radku — v uzke tabulce na telefonu by se pole nevesla.
 */
export function UpravaPanel({ nadpis, onZavrit, children }: {
  nadpis: string; onZavrit: () => void; children: ReactNode;
}) {
  return (
    <div className="mt-3 rounded-card border border-accent/40 bg-accent/5 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{nadpis}</h3>
        <button type="button" onClick={onZavrit} className="text-xs text-ink-muted hover:text-ink-primary">
          Zavřít
        </button>
      </div>
      {children}
    </div>
  );
}

/** Datum pro <input type="date">; prazdne, kdyz neni zadane. */
export function isoDatum(d: Date | string | null | undefined): string | undefined {
  if (!d) return undefined;
  const dd = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(dd.getTime()) ? undefined : dd.toISOString().slice(0, 10);
}

/** Viceradkove pole pro poznamky. */
export function TextPole({ label, name, hint, sirka = "", ...rest }: {
  label: string; name: string; hint?: string; sirka?: string;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div className={sirka}>
      <label className="label mb-1.5 block" htmlFor={name}>{label}</label>
      <textarea id={name} name={name} rows={2} className="input resize-y" {...rest} />
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

/**
 * Oddil dlouheho formulare s nadpisem. Bez nej je dvacet poli pod sebou jeden
 * proud a clovek hleda, kam ktere patri.
 */
export function Sekce({ nadpis, popis, children }: { nadpis: string; popis?: string; children: ReactNode }) {
  return (
    <section className="space-y-3 sm:col-span-2">
      <div className="border-b border-line pb-1.5">
        <h4 className="text-sm font-semibold">{nadpis}</h4>
        {popis && <p className="text-xs text-ink-muted">{popis}</p>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}
