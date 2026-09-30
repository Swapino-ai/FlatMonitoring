"use client";

import { useEffect, useRef, useState } from "react";

export interface Navrh {
  ulice: string; mesto: string; cast: string; psc: string; kraj: string;
  latitude: number | null; longitude: number | null; popis: string;
}

/**
 * Pole "Ulice a cislo" s naseptavacem. Hleda se podle toho, co uzivatel pise
 * primo do pole — zadny dalsi vyhledavaci radek. Vyber doplni ulici a pres
 * `onVybrano` i mesto, PSC, cast a souradnice.
 *
 * Rucni psani zustava: naseptavac muze byt nedostupny a adresa nemusi v
 * registru byt.
 */
export function UliceNaseptavac({
  label = "Ulice a číslo", name, value, onChange, onVybrano, required, hint, error, placeholder, className = "",
}: {
  label?: string;
  name: string;
  value: string;
  onChange: (text: string) => void;
  onVybrano: (n: Navrh) => void;
  required?: boolean;
  hint?: string;
  error?: string;
  placeholder?: string;
  className?: string;
}) {
  const [navrhy, setNavrhy] = useState<Navrh[]>([]);
  const [hleda, setHleda] = useState(false);
  const [otevreno, setOtevreno] = useState(false);
  const [zvyrazneny, setZvyrazneny] = useState(-1);
  const obal = useRef<HTMLDivElement>(null);
  // Po vyberu se text pole zmeni; to nesmi spustit dalsi hledani
  const preskocit = useRef(false);

  useEffect(() => {
    if (preskocit.current) { preskocit.current = false; return; }
    if (value.trim().length < 3) { setNavrhy([]); return; }
    const prerus = new AbortController();
    const casovac = setTimeout(async () => {
      setHleda(true);
      try {
        const r = await fetch(`/api/adresy?q=${encodeURIComponent(value)}`, { signal: prerus.signal });
        const d = await r.json();
        setNavrhy(d.navrhy ?? []);
        setOtevreno(true);
        setZvyrazneny(-1);
      } catch {
        // Přerušený požadavek není chyba, jen jsme mezitím psali dál
      } finally {
        setHleda(false);
      }
    }, 300);
    return () => { clearTimeout(casovac); prerus.abort(); };
  }, [value]);

  useEffect(() => {
    const zavri = (e: MouseEvent) => {
      if (obal.current && !obal.current.contains(e.target as Node)) setOtevreno(false);
    };
    document.addEventListener("mousedown", zavri);
    return () => document.removeEventListener("mousedown", zavri);
  }, []);

  function vyber(n: Navrh) {
    preskocit.current = true;
    onVybrano(n);
    setNavrhy([]);
    setOtevreno(false);
  }

  function klavesa(e: React.KeyboardEvent) {
    if (!otevreno || navrhy.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setZvyrazneny((i) => (i + 1) % navrhy.length); }
    if (e.key === "ArrowUp") { e.preventDefault(); setZvyrazneny((i) => (i <= 0 ? navrhy.length - 1 : i - 1)); }
    if (e.key === "Enter" && zvyrazneny >= 0) { e.preventDefault(); vyber(navrhy[zvyrazneny]); }
    if (e.key === "Escape") setOtevreno(false);
  }

  return (
    <div ref={obal} className={`relative ${className}`}>
      <label className="label mb-1.5 block" htmlFor={name}>{label}</label>
      <input
        id={name}
        name={name}
        type="text"
        className="input"
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={klavesa}
        onFocus={() => navrhy.length > 0 && setOtevreno(true)}
        autoComplete="off"
        role="combobox"
        aria-expanded={otevreno && navrhy.length > 0}
        aria-autocomplete="list"
      />
      {error ? <p className="mt-1 text-xs text-bad">{error}</p>
        : <p className="mt-1 text-xs text-ink-muted">{hleda ? "Hledám…" : hint}</p>}

      {otevreno && navrhy.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-line bg-surface-card shadow-lg">
          {navrhy.map((n, i) => (
            <li key={`${n.ulice}-${n.psc}-${i}`}>
              <button
                type="button"
                onClick={() => vyber(n)}
                onMouseEnter={() => setZvyrazneny(i)}
                className={`block w-full px-3 py-2 text-left text-sm ${i === zvyrazneny ? "bg-surface-sunken" : ""}`}
              >
                <span className="font-medium">{n.ulice}</span>
                <span className="block text-xs text-ink-muted">
                  {[n.cast, n.mesto, n.psc].filter(Boolean).join(" · ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
