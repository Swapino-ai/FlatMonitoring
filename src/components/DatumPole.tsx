"use client";

import { useEffect, useRef, useState } from "react";

const MESICE = ["Leden", "Únor", "Březen", "Duben", "Květen", "Červen", "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec"];
const DNY = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];

const dvou = (n: number) => String(n).padStart(2, "0");
const naISO = (r: number, m: number, d: number) => `${r}-${dvou(m + 1)}-${dvou(d)}`;

/** ISO (yyyy-mm-dd) -> dd/mm/yyyy */
function zobraz(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** dd/mm/yyyy (i s teckami ci pomlckami) -> ISO, nebo null pri neplatnem datu */
function naIso(text: string): string | null {
  const m = /^(\d{1,2})[/.\-\s]+(\d{1,2})[/.\-\s]+(\d{4})$/.exec(text.trim());
  if (!m) return null;
  const d = Number(m[1]), mes = Number(m[2]) - 1, r = Number(m[3]);
  const dt = new Date(Date.UTC(r, mes, d));
  if (dt.getUTCFullYear() !== r || dt.getUTCMonth() !== mes || dt.getUTCDate() !== d) return null;
  return naISO(r, mes, d);
}

/** Pri psani cislic doplnuje lomitka: 15032026 -> 15/03/2026 */
function maskuj(text: string): string {
  if (/[^\d]/.test(text.replace(/[/.\-\s]/g, ""))) return text;
  const c = text.replace(/\D/g, "").slice(0, 8);
  if (c.length <= 2) return text.endsWith("/") ? text : c;
  if (c.length <= 4) return `${c.slice(0, 2)}/${c.slice(2)}`;
  return `${c.slice(0, 2)}/${c.slice(2, 4)}/${c.slice(4)}`;
}

/**
 * Datum ve formatu dd/mm/yyyy s ceskym kalendarem. Prohlizecovy
 * <input type="date"> formatuje podle jazyka prohlizece a vzhled nejde
 * ovlivnit; tady je format i kalendar vzdy stejny. Formular dostane ISO
 * datum v skrytem poli, takze server se nemeni.
 */
export function DatumPole({ label, name, hint, sirka = "", defaultValue = "", required, min, max }: {
  label: string; name: string; hint?: string; sirka?: string;
  defaultValue?: string; required?: boolean; min?: string; max?: string;
}) {
  const [text, setText] = useState(zobraz(defaultValue));
  const [otevreno, setOtevreno] = useState(false);
  const iso = naIso(text);
  const vstup = useRef<HTMLInputElement>(null);
  const obal = useRef<HTMLDivElement>(null);

  const start = iso ?? (defaultValue ? defaultValue.slice(0, 10) : naISO(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()));
  const [zobrazeny, setZobrazeny] = useState({ r: Number(start.slice(0, 4)), m: Number(start.slice(5, 7)) - 1 });

  const mimoRozsah = iso != null && ((min && iso < min) || (max && iso > max));

  // Chybu hlasi samo pole, takze "required" a rozsah funguji jako u nativniho
  useEffect(() => {
    const el = vstup.current;
    if (!el) return;
    if (text && !iso) el.setCustomValidity("Zadej datum ve tvaru dd/mm/rrrr");
    else if (mimoRozsah) el.setCustomValidity(max && iso! > max ? `Datum nesmí být po ${zobraz(max)}` : `Datum nesmí být před ${zobraz(min!)}`);
    else el.setCustomValidity("");
  }, [text, iso, mimoRozsah, min, max]);

  useEffect(() => {
    const zavri = (e: MouseEvent) => {
      if (obal.current && !obal.current.contains(e.target as Node)) setOtevreno(false);
    };
    document.addEventListener("mousedown", zavri);
    return () => document.removeEventListener("mousedown", zavri);
  }, []);

  function posun(o: number) {
    setZobrazeny(({ r, m }) => {
      const n = r * 12 + m + o;
      return { r: Math.floor(n / 12), m: ((n % 12) + 12) % 12 };
    });
  }

  function vyber(d: number) {
    setText(zobraz(naISO(zobrazeny.r, zobrazeny.m, d)));
    setOtevreno(false);
  }

  // Mrizka: pondeli prvni
  const prvni = (new Date(Date.UTC(zobrazeny.r, zobrazeny.m, 1)).getUTCDay() + 6) % 7;
  const pocet = new Date(Date.UTC(zobrazeny.r, zobrazeny.m + 1, 0)).getUTCDate();
  const bunky: (number | null)[] = [...Array(prvni).fill(null), ...Array.from({ length: pocet }, (_, i) => i + 1)];
  const dnes = new Date();
  const dnesISO = naISO(dnes.getFullYear(), dnes.getMonth(), dnes.getDate());

  return (
    <div className={sirka}>
      <label className="label mb-1.5 block" htmlFor={name}>{label}</label>
      <div ref={obal} className="relative">
        <input type="hidden" name={name} value={iso ?? ""} />
        <input
          ref={vstup}
          id={name}
          type="text"
          inputMode="numeric"
          className="input pr-10"
          placeholder="dd/mm/rrrr"
          value={text}
          required={required}
          autoComplete="off"
          onChange={(e) => {
            const t = maskuj(e.target.value);
            setText(t);
            const i = naIso(t);
            if (i) setZobrazeny({ r: Number(i.slice(0, 4)), m: Number(i.slice(5, 7)) - 1 });
          }}
          onKeyDown={(e) => { if (e.key === "Escape") setOtevreno(false); }}
        />
        <button
          type="button"
          aria-label="Otevřít kalendář"
          onClick={() => setOtevreno((o) => !o)}
          className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-ink-muted hover:bg-surface-sunken hover:text-ink"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="3" y="4.5" width="14" height="12" rx="2" /><path d="M3 8.5h14M7 3v3M13 3v3" />
          </svg>
        </button>

        {otevreno && (
          <div className="absolute left-0 z-30 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-surface-card p-3 shadow-lg">
            <div className="mb-2 flex items-center justify-between">
              <button type="button" aria-label="Předchozí měsíc" onClick={() => posun(-1)} className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-surface-sunken">‹</button>
              <span className="text-sm font-semibold">{MESICE[zobrazeny.m]} {zobrazeny.r}</span>
              <button type="button" aria-label="Další měsíc" onClick={() => posun(1)} className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-surface-sunken">›</button>
            </div>
            <div className="grid grid-cols-7 gap-0.5 text-center text-xs">
              {DNY.map((d) => <div key={d} className="py-1 font-medium text-ink-muted">{d}</div>)}
              {bunky.map((d, i) => {
                if (d == null) return <div key={i} />;
                const v = naISO(zobrazeny.r, zobrazeny.m, d);
                const zakazano = (min && v < min) || (max && v > max);
                const vybrano = v === iso;
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={!!zakazano}
                    onClick={() => vyber(d)}
                    className={`h-8 rounded-md text-sm ${vybrano ? "bg-accent font-semibold text-white" : v === dnesISO ? "font-semibold text-accent ring-1 ring-accent/40" : "hover:bg-surface-sunken"} ${zakazano ? "cursor-not-allowed opacity-30" : ""}`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex justify-between border-t border-line pt-2 text-xs">
              <button type="button" className="text-accent hover:underline" onClick={() => { setText(zobraz(dnesISO)); setZobrazeny({ r: dnes.getFullYear(), m: dnes.getMonth() }); setOtevreno(false); }}>Dnes</button>
              {!required && <button type="button" className="text-ink-muted hover:underline" onClick={() => { setText(""); setOtevreno(false); }}>Smazat</button>}
            </div>
          </div>
        )}
      </div>
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}
