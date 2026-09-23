"use client";

import { useEffect, useRef, useState } from "react";

export interface Navrh {
  ulice: string; mesto: string; cast: string; psc: string; kraj: string;
  latitude: number | null; longitude: number | null; popis: string;
}

/**
 * Jeden radek misto ctyr poli. Napis "Korunni 15 Praha" a ulice, mesto, PSC
 * i mestska cast se doplni samy — vcetne souradnic, podle kterych se pak
 * hledaji srovnatelne nabidky v okruhu.
 *
 * Rucni vyplneni zustava: naseptavac muze byt nedostupny a bez adresy by
 * nesla nemovitost zalozit.
 */
export function AdresaNaseptavac({ onVybrano }: { onVybrano: (n: Navrh) => void }) {
  const [dotaz, setDotaz] = useState("");
  const [navrhy, setNavrhy] = useState<Navrh[]>([]);
  const [poznamka, setPoznamka] = useState("");
  const [hleda, setHleda] = useState(false);
  const [otevreno, setOtevreno] = useState(false);
  const [zvyrazneny, setZvyrazneny] = useState(-1);
  const obal = useRef<HTMLDivElement>(null);

  // Na kazde pismeno se neptame — uzivatel pise rychleji, nez sit odpovida
  useEffect(() => {
    if (dotaz.trim().length < 3) { setNavrhy([]); setPoznamka(""); return; }
    const prerus = new AbortController();
    const casovac = setTimeout(async () => {
      setHleda(true);
      try {
        const r = await fetch(`/api/adresy?q=${encodeURIComponent(dotaz)}`, { signal: prerus.signal });
        const d = await r.json();
        setNavrhy(d.navrhy ?? []);
        setPoznamka(d.poznamka ?? "");
        setOtevreno(true);
        setZvyrazneny(-1);
      } catch {
        // Přerušený požadavek není chyba, jen jsme mezitím psali dál
      } finally {
        setHleda(false);
      }
    }, 300);
    return () => { clearTimeout(casovac); prerus.abort(); };
  }, [dotaz]);

  // Klik mimo zavre nabídku
  useEffect(() => {
    const zavri = (e: MouseEvent) => {
      if (obal.current && !obal.current.contains(e.target as Node)) setOtevreno(false);
    };
    document.addEventListener("mousedown", zavri);
    return () => document.removeEventListener("mousedown", zavri);
  }, []);

  function vyber(n: Navrh) {
    onVybrano(n);
    setDotaz("");
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
    <div ref={obal} className="relative sm:col-span-2">
      <label className="label mb-1.5 block" htmlFor="adresa-hledani">Najít adresu</label>
      <input
        id="adresa-hledani"
        type="text"
        className="input"
        placeholder="Začni psát, např. Korunní 15 Praha"
        value={dotaz}
        onChange={(e) => setDotaz(e.target.value)}
        onKeyDown={klavesa}
        onFocus={() => navrhy.length > 0 && setOtevreno(true)}
        autoComplete="off"
      />
      <p className="mt-1 text-xs text-ink-muted">
        {hleda ? "Hledám…" : poznamka || "Vyplní ulici, město, PSČ i čtvrť. Pole níž jde kdykoli přepsat ručně."}
      </p>

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
