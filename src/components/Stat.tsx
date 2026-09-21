import type { ReactNode } from "react";
import { Napoveda } from "./Napoveda";

/**
 * Statisticka dlazdice. Cislo je hrdina — popis je sekundarni.
 * `tone` se nikdy nepouziva samostatne: vzdy doprovazi textovy popis.
 */
export function Stat({
  label,
  value,
  sub,
  tone = "neutral",
  hint,
  term,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad";
  hint?: string;
  /** Klic do slovniku vysvetlivek — popisek pak nabidne napovedu. */
  term?: string;
}) {
  const toneClass = {
    neutral: "text-ink-primary",
    good: "text-good",
    warn: "text-warn",
    bad: "text-bad",
  }[tone];

  return (
    <div className="card">
      <div className="label" title={hint}>
        {term ? <Napoveda term={term}>{label}</Napoveda> : label}
      </div>
      <div className={`mt-2 text-2xl font-semibold tabular-nums tracking-tight ${toneClass}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-ink-secondary">{sub}</div>}
    </div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>;
}

export function Card({ title, action, children, className = "" }: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="card-title">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm text-ink-muted">{children}</p>;
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "good" | "warn" | "bad"; children: ReactNode }) {
  const cls = {
    neutral: "bg-surface-sunken text-ink-secondary",
    good: "bg-good/12 text-good",
    warn: "bg-warn/15 text-warn",
    bad: "bg-bad/12 text-bad",
  }[tone];
  return <span className={`inline-flex rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}
