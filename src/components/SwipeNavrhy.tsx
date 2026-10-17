"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { rozhodniInzeraty, rozhodniShodu } from "@/lib/trhActions";
import { CenyAShody } from "./CenyAShody";
import { czk, dateCz } from "@/lib/format";
import type { RadekTrhu } from "./TrhNemovitosti";
import { AiInfo } from "./AiInfo";
import type { Profil } from "@/lib/market/profily";

/**
 * Prochazeni navrhu jeden po druhem: tahnout doprava = zaradit, doleva = vyradit,
 * dolu / "Pozdeji" = nechat na pak. Funguje mysi, prstem i sipkami.
 */
export function SwipeNavrhy({ propertyId, navrhy, najem, vzdalenost, onKonec, profil }: {
  propertyId: string;
  navrhy: RadekTrhu[];
  najem: boolean;
  vzdalenost: (r: RadekTrhu) => number | null;
  onKonec: (zmeneno: boolean) => void;
  profil: Profil;
}) {
  const [index, setIndex] = useState(0);
  const [posun, setPosun] = useState(0);
  const [odlet, setOdlet] = useState<"vlevo" | "vpravo" | null>(null);
  const [pocty, setPocty] = useState({ zarazeno: 0, vyrazeno: 0, pozdeji: 0 });
  const start = useRef<number | null>(null);
  const r = navrhy[index];
  // Sreality zakazuji vlozeni do iframe (frame-ancestors), proto nahled v samostatnem okne,
  // ktere se pri dalsi karte samo prepne na dalsi inzerat
  const okno = useRef<Window | null>(null);
  const [nahled, setNahled] = useState(false);
  const platnyOdkaz = (u: string | null | undefined) => !!u && !u.includes("/x/x/");
  const otevriNahled = () => {
    if (!r || !platnyOdkaz(r.url)) return;
    const sirka = Math.round(window.screen.availWidth / 2);
    okno.current = window.open(r.url!, "fm-nahled-inzeratu", `width=${sirka},height=${window.screen.availHeight},left=${window.screen.availWidth - sirka},top=0`);
    setNahled(!!okno.current);
  };
  useEffect(() => {
    if (!nahled || !r || !platnyOdkaz(r.url)) return;
    if (okno.current && !okno.current.closed) okno.current.location.href = r.url!;
    else setNahled(false);
  }, [r, nahled]);
  useEffect(() => () => { okno.current?.close(); }, []);
  const cena = (n: number) => (najem ? `${czk(n)}/měs.` : czk(n));

  const rozhodni = useCallback((volba: "ZARAZENO" | "VYRAZENO" | "POZDEJI") => {
    if (!r || odlet) return;
    if (volba !== "POZDEJI") void rozhodniInzeraty(propertyId, [r.id], volba);
    setPocty((p) => ({
      zarazeno: p.zarazeno + (volba === "ZARAZENO" ? 1 : 0),
      vyrazeno: p.vyrazeno + (volba === "VYRAZENO" ? 1 : 0),
      pozdeji: p.pozdeji + (volba === "POZDEJI" ? 1 : 0),
    }));
    setOdlet(volba === "ZARAZENO" ? "vpravo" : volba === "VYRAZENO" ? "vlevo" : null);
    setTimeout(() => { setOdlet(null); setPosun(0); setIndex((i) => i + 1); }, volba === "POZDEJI" ? 0 : 220);
  }, [r, odlet, propertyId]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") rozhodni("ZARAZENO");
      else if (e.key === "ArrowLeft") rozhodni("VYRAZENO");
      else if (e.key === "ArrowDown") rozhodni("POZDEJI");
      else if (e.key === "Escape") onKonec(pocty.zarazeno + pocty.vyrazeno > 0);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [rozhodni, onKonec, pocty]);

  const hotovo = !r;
  const d = r ? vzdalenost(r) : null;
  const x = odlet === "vpravo" ? 600 : odlet === "vlevo" ? -600 : posun;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md">
        <div className="mb-3 flex items-center justify-between text-sm text-white">
          <span>{Math.min(index + 1, navrhy.length)} / {navrhy.length}</span>
          <span>✓ {pocty.zarazeno} · ✕ {pocty.vyrazeno} · později {pocty.pozdeji}</span>
          <button type="button" className="rounded-full bg-white/15 px-3 py-1 hover:bg-white/25" onClick={() => onKonec(pocty.zarazeno + pocty.vyrazeno > 0)}>Zavřít</button>
        </div>
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-white/20">
          <div className="h-full rounded-full bg-white transition-all" style={{ width: `${(index / Math.max(1, navrhy.length)) * 100}%` }} />
        </div>

        {hotovo ? (
          <div className="rounded-3xl bg-surface-card p-8 text-center shadow-pop">
            <div className="text-4xl">🎉</div>
            <h3 className="mt-2 text-lg font-semibold">Hotovo</h3>
            <p className="mt-1 text-sm text-ink-secondary">Zařazeno {pocty.zarazeno}, vyřazeno {pocty.vyrazeno}, na později {pocty.pozdeji}.</p>
            <button type="button" className="btn btn-primary mt-4" onClick={() => onKonec(pocty.zarazeno + pocty.vyrazeno > 0)}>Zpět na přehled</button>
          </div>
        ) : (
          <div
            className="relative select-none touch-none rounded-3xl bg-surface-card p-6 shadow-pop"
            style={{ transform: `translateX(${x}px) rotate(${x / 25}deg)`, transition: start.current == null ? "transform 0.22s ease-out" : "none", opacity: odlet ? 0 : 1 }}
            onPointerDown={(e) => { start.current = e.clientX; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); }}
            onPointerMove={(e) => { if (start.current != null) setPosun(e.clientX - start.current); }}
            onPointerUp={() => {
              const p = posun;
              start.current = null;
              if (p > 110) rozhodni("ZARAZENO");
              else if (p < -110) rozhodni("VYRAZENO");
              else setPosun(0);
            }}
          >
            {/* Stitky pri tazeni */}
            <span className="pointer-events-none absolute left-5 top-5 rounded-lg border-2 border-good px-2 py-0.5 text-lg font-bold text-good" style={{ opacity: Math.max(0, Math.min(1, posun / 110)) }}>ZAŘADIT</span>
            <span className="pointer-events-none absolute right-5 top-5 rounded-lg border-2 border-bad px-2 py-0.5 text-lg font-bold text-bad" style={{ opacity: Math.max(0, Math.min(1, -posun / 110)) }}>VYŘADIT</span>

            <div className="mt-8 flex items-center justify-between">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${r.doporuceno ? "bg-good/15 text-good" : "bg-surface-sunken text-ink-muted"}`}>
                podobnost {r.skore ?? "–"}{r.doporuceno ? " · doporučeno" : ""}
              </span>
              <span className="text-xs text-ink-muted">na trhu od {dateCz(r.firstSeen)}</span>
            </div>
            <div className="mt-4 text-3xl font-bold tabular-nums">{cena(r.price)}</div>
            {r.pricePerM2 != null && <div className="text-sm text-ink-secondary tabular-nums">{czk(r.pricePerM2)}/m²</div>}
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div><div className="label">Dispozice</div><div className="font-medium">{r.disposition ?? "—"}</div></div>
              <div><div className="label">Plocha</div><div className="font-medium">{r.areaM2 ? `${r.areaM2} m²` : "—"}</div></div>
              <div><div className="label">Lokalita</div><div className="font-medium">{r.district && r.district !== r.city ? `${r.city}, ${r.district}` : r.city}</div></div>
              <div><div className="label">Vzdálenost</div><div className="font-medium">{d != null ? `${d.toFixed(1).replace(".", ",")} km` : "neznámá"}</div></div>
            </div>
            {r.duvod && <p className="mt-3 text-xs text-ink-muted">{r.duvod}</p>}
            <div className="mt-3" onPointerDown={(e) => e.stopPropagation()}>
              <CenyAShody ceny={r.ceny} najem={najem} shody={r.shody} canEdit
                onRozhodni={(id, stejny) => { void rozhodniShodu(propertyId, id, stejny); }} />
            </div>
            {r.ai && <div className="mt-3"><AiInfo ai={r.ai} profil={profil} /></div>}
            {(r.fotkyUrl?.length ?? 0) > 0 && (
              <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1" onPointerDown={(e) => e.stopPropagation()}>
                {r.fotkyUrl!.map((src, k) => (
                  <a key={src} href={src} target="_blank" rel="noreferrer" className="shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`Fotka ${k + 1}`} loading="lazy" referrerPolicy="no-referrer" className="h-28 w-40 rounded-lg object-cover" />
                  </a>
                ))}
              </div>
            )}
            {r.url && !r.url.includes("/x/x/") && (
              <a href={r.url} target="_blank" rel="noreferrer noopener" onPointerDown={(e) => e.stopPropagation()}
                className="mt-4 inline-block text-sm font-medium text-accent hover:underline">Otevřít inzerát na Sreality ↗</a>
            )}
          </div>
        )}

        {!hotovo && (
          <div className="mt-5 flex items-center justify-center gap-5">
            <button type="button" aria-label="Vyřadit" onClick={() => rozhodni("VYRAZENO")}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-3xl text-bad shadow-pop transition-transform hover:scale-110">✕</button>
            <button type="button" aria-label="Později" onClick={() => rozhodni("POZDEJI")}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-sm text-ink-muted shadow-pop transition-transform hover:scale-110">↓</button>
            <button type="button" aria-label="Zařadit" onClick={() => rozhodni("ZARAZENO")}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-3xl text-good shadow-pop transition-transform hover:scale-110">✓</button>
          </div>
        )}
        {!hotovo && (
          <div className="mt-4 text-center">
            <button type="button" onClick={otevriNahled} disabled={!platnyOdkaz(r?.url)}
              className="rounded-full bg-white/15 px-4 py-1.5 text-sm text-white hover:bg-white/25 disabled:opacity-40">
              {nahled ? "Náhled je otevřený vedle a přepíná se s kartou" : "Otevřít náhled inzerátu vedle"}
            </button>
          </div>
        )}
        <p className="mt-3 text-center text-xs text-white/70">Táhni doprava = zařadit, doleva = vyřadit · klávesy ← → ↓</p>
      </div>
    </div>
  );
}
