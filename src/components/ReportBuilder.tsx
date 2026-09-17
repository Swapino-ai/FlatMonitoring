"use client";

import { useState } from "react";
import { Card } from "./Stat";

const SECTIONS = [
  { key: "prehled", label: "Souhrn portfolia", desc: "Klíčové ukazatele, vývoj hodnoty, výnosy" },
  { key: "nemovitosti", label: "Nemovitosti", desc: "Pořizovací ceny, dluhy, nájmy, IRR" },
  { key: "cashflow", label: "Cash flow", desc: "Měsíční toky za posledních 12 měsíců" },
  { key: "uspory", label: "Úspory", desc: "Příležitosti hromadného vyjednávání" },
  { key: "dane", label: "Daňový podklad", desc: "Rozpis dle § 9 ZDP, porovnání paušálu a skutečných výdajů" },
];

export function ReportBuilder({ currentYear }: { currentYear: number }) {
  const [selected, setSelected] = useState<string[]>(SECTIONS.map((s) => s.key));
  const [year, setYear] = useState(currentYear);
  const [state, setState] = useState<"idle" | "working" | "error">("idle");
  const [error, setError] = useState("");

  const query = `rok=${year}&sekce=${selected.join(",")}`;

  function toggle(key: string) {
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  async function download() {
    setState("working");
    setError("");
    try {
      const res = await fetch(`/api/report?${query}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(data.error);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `portfolio-report-${year}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setState("idle");
    } catch (e) {
      setState("error");
      setError(e instanceof Error ? e.message : "Generování selhalo");
    }
  }

  return (
    <Card title="Sestavit report">
      <div className="space-y-5">
        <div>
          <label className="label mb-2 block">Daňový rok</label>
          <div className="flex gap-1">
            {Array.from({ length: 5 }, (_, i) => currentYear - i).map((y) => (
              <button key={y} onClick={() => setYear(y)}
                className={`rounded-lg px-3 py-1.5 text-sm ${y === year ? "bg-accent text-white" : "border border-line text-ink-secondary hover:bg-surface-sunken"}`}>
                {y}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label mb-2 block">Sekce</label>
          <div className="grid gap-2 sm:grid-cols-2">
            {SECTIONS.map((s) => {
              const on = selected.includes(s.key);
              return (
                <button key={s.key} onClick={() => toggle(s.key)}
                  aria-pressed={on}
                  className={`rounded-card border p-3 text-left transition-colors ${on ? "border-accent bg-accent/5" : "border-line hover:bg-surface-sunken"}`}>
                  <div className="flex items-center gap-2">
                    <span className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] ${on ? "border-accent bg-accent text-white" : "border-line"}`}>
                      {on ? "✓" : ""}
                    </span>
                    <span className="text-sm font-medium">{s.label}</span>
                  </div>
                  <p className="mt-1 pl-6 text-xs text-ink-secondary">{s.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <button onClick={download} disabled={state === "working" || selected.length === 0} className="btn btn-primary">
            {state === "working" ? "Generuji PDF…" : "Stáhnout PDF"}
          </button>
          <a href={`/report?${query}`} target="_blank" rel="noreferrer" className="btn">Náhled v prohlížeči</a>
          {state === "error" && <span className="text-sm text-bad">{error}</span>}
        </div>
      </div>
    </Card>
  );
}
