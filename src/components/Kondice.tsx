import type { ReactNode } from "react";

export interface Kontrola {
  nazev: string;
  stav: "dobra" | "pozor" | "spatna";
  detail: string;
}

/**
 * Souhrn financni kondice nemovitosti.
 *
 * Cilem je odpoved na prvni pohled: je to v poradku, nebo neco skripe?
 * Stav nese vzdy i ikonu a slovo, ne jen barvu — jinak by ho nepoznal nikdo
 * s poruchou barvocitu a v tisku by zmizel uplne.
 */
const ZNAKY: Record<Kontrola["stav"], { ikona: string; trida: string; slovo: string }> = {
  dobra: { ikona: "✓", trida: "text-good", slovo: "v pořádku" },
  pozor: { ikona: "!", trida: "text-warn", slovo: "hlídej" },
  spatna: { ikona: "✕", trida: "text-bad", slovo: "problém" },
};

export function Kondice({ kontroly }: { kontroly: Kontrola[] }) {
  if (kontroly.length === 0) return null;

  const spatne = kontroly.filter((k) => k.stav === "spatna").length;
  const pozor = kontroly.filter((k) => k.stav === "pozor").length;

  const celkem: Kontrola["stav"] = spatne > 0 ? "spatna" : pozor > 0 ? "pozor" : "dobra";
  const nadpis = spatne > 0
    ? `${spatne} ${spatne === 1 ? "věc vyžaduje" : "věci vyžadují"} pozornost`
    : pozor > 0
      ? `${pozor} ${pozor === 1 ? "věc na pohlídání" : "věci na pohlídání"}`
      : "Vše v pořádku";

  const z = ZNAKY[celkem];

  return (
    <div className="card">
      <div className="flex items-center gap-2.5">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
          celkem === "dobra" ? "bg-good/15 text-good"
            : celkem === "pozor" ? "bg-warn/15 text-warn"
              : "bg-bad/15 text-bad"
        }`} aria-hidden>
          {z.ikona}
        </span>
        <div className="min-w-0">
          <div className="label">Kondice</div>
          <div className={`text-lg font-semibold leading-tight ${z.trida}`}>{nadpis}</div>
        </div>
      </div>

      <ul className="mt-3 space-y-1.5">
        {kontroly.map((k) => {
          const zn = ZNAKY[k.stav];
          return (
            <li key={k.nazev} className="flex items-start gap-2 text-sm">
              <span className={`mt-0.5 shrink-0 font-bold ${zn.trida}`} aria-hidden>{zn.ikona}</span>
              <span className="sr-only">{zn.slovo}:</span>
              <span className="min-w-0">
                <span className="font-medium">{k.nazev}</span>
                <span className="text-ink-secondary"> — {k.detail}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Velke cislo, kterym stranka zacina. Jedno na obrazovku — dve uz spolu
 * soupeři a ani jedno pak nevynikne.
 *
 * Zamerne bez tabular-nums: ty davaji kazde cislici sirku nuly, coz je spravne
 * ve sloupcich tabulky, ale ve velkem cisle pusobi rozvolnene.
 */
export function Hero({ label, hodnota, doplnek, tone = "neutral", vedle }: {
  label: string;
  hodnota: string;
  doplnek?: ReactNode;
  tone?: "neutral" | "good" | "bad";
  vedle?: ReactNode;
}) {
  const barva = tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : "text-ink-primary";
  return (
    <div className="card">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="label">{label}</div>
          <div className={`mt-1 text-[2.75rem] font-semibold leading-none tracking-tight sm:text-5xl ${barva}`}>
            {hodnota}
          </div>
          {doplnek && <div className="mt-2 text-sm text-ink-secondary">{doplnek}</div>}
        </div>
        {vedle && <div className="shrink-0">{vedle}</div>}
      </div>
    </div>
  );
}
