"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { narovnej, velikostVysledku, type Bod } from "@/lib/perspektiva";

/**
 * Zdroj se pred upravou zmensi (delsi strana) — telefonni fotky maji 12+ Mpx. Mene pameti
 * = mensi sance, ze Android pri dalsim foceni prohlizec "pro nedostatek pameti" ukonci.
 */
const MAX_ZDROJ = 1800;

/** Uvolni pamet canvasu hned (prohlizec ji jinak drzi do uklidu pameti). */
export const uvolni = (c: HTMLCanvasElement | null | undefined) => { if (c) { c.width = 0; c.height = 0; } };
const VYCHOZI: Bod[] = [{ x: 0.08, y: 0.08 }, { x: 0.92, y: 0.08 }, { x: 0.92, y: 0.92 }, { x: 0.08, y: 0.92 }];

async function nactiCanvas(f: File): Promise<HTMLCanvasElement> {
  // createImageBitmap dekoduje mimo hlavni vlakno a bitmapa jde hned uvolnit (close)
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(f, { imageOrientation: "from-image" } as ImageBitmapOptions);
      try {
        const k = Math.min(1, MAX_ZDROJ / Math.max(bmp.width, bmp.height));
        const c = document.createElement("canvas");
        c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
        c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
        return c;
      } finally { bmp.close(); }
    } catch { /* starsi prohlizec — pres Image */ }
  }
  const url = URL.createObjectURL(f);
  try {
    const img = await new Promise<HTMLImageElement>((ok, chyba) => { const i = new Image(); i.onload = () => ok(i); i.onerror = chyba; i.src = url; });
    const k = Math.min(1, MAX_ZDROJ / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    img.src = "";
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function otoc(c: HTMLCanvasElement): HTMLCanvasElement {
  const o = document.createElement("canvas");
  o.width = c.height; o.height = c.width;
  const g = o.getContext("2d")!;
  g.translate(o.width, 0); g.rotate(Math.PI / 2); g.drawImage(c, 0, 0);
  uvolni(c);
  return o;
}

const doSouboru = (c: HTMLCanvasElement, nazev: string) => new Promise<File>((ok, chyba) =>
  c.toBlob((b) => (b ? ok(new File([b], nazev.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" })) : chyba(new Error("toBlob"))), "image/jpeg", 0.9));

/**
 * Orez fotky dokladu podle 4 rohu: rohy se tahnou prstem nebo mysi, vysledek se narovna
 * (jako skener). PDF a jine soubory projdou beze zmeny.
 *
 * Pouziti: `const { orizni, dialog } = useOrezFotky();` — `await orizni(soubory)` vrati
 * upravene soubory (po jednom otevira okno), `dialog` se vlozi do stranky.
 */
export function useOrezFotky(): { orizni: (soubory: File[]) => Promise<File[]>; dialog: ReactNode } {
  const [prace, setPrace] = useState<{ soubor: File; poradi: string; hotovo: (f: File | null) => void } | null>(null);

  const orizni = useCallback(async (soubory: File[]) => {
    const vysledek: File[] = [];
    const fotky = soubory.filter((f) => f.type.startsWith("image/")).length;
    let n = 0;
    for (const s of soubory) {
      if (!s.type.startsWith("image/")) { vysledek.push(s); continue; }
      n++;
      const f = await new Promise<File | null>((hotovo) => setPrace({ soubor: s, poradi: fotky > 1 ? `${n} z ${fotky}` : "", hotovo }));
      if (f) vysledek.push(f);
    }
    setPrace(null);
    return vysledek;
  }, []);

  const dialog = prace ? <OknoOrezu key={`${prace.soubor.name}-${prace.poradi}`} soubor={prace.soubor} poradi={prace.poradi} onHotovo={prace.hotovo} /> : null;
  return { orizni, dialog };
}

function OknoOrezu({ soubor, poradi, onHotovo }: { soubor: File; poradi: string; onHotovo: (f: File | null) => void }) {
  const [zdroj, setZdroj] = useState<HTMLCanvasElement | null>(null);
  const [nahled, setNahled] = useState<string | null>(null);
  const [rohy, setRohy] = useState<Bod[]>(VYCHOZI);
  const [pracuji, setPracuji] = useState(false);
  const obr = useRef<HTMLDivElement>(null);
  const tazeny = useRef<number | null>(null);

  // Nahled jako blob URL (ne base64 retezec) — mene pameti
  const nastavZdroj = useCallback((c: HTMLCanvasElement) => {
    setZdroj(c); setRohy(VYCHOZI);
    c.toBlob((b) => { if (b) setNahled((stary) => { if (stary) URL.revokeObjectURL(stary); return URL.createObjectURL(b); }); }, "image/jpeg", 0.8);
  }, []);
  useEffect(() => { nactiCanvas(soubor).then(nastavZdroj).catch(() => onHotovo(soubor)); }, [soubor, nastavZdroj, onHotovo]);
  // Po zavreni okna uvolnit nahled i zdrojovy canvas
  const zdrojRef = useRef<HTMLCanvasElement | null>(null);
  zdrojRef.current = zdroj;
  const nahledRef = useRef<string | null>(null);
  nahledRef.current = nahled;
  useEffect(() => () => { if (nahledRef.current) URL.revokeObjectURL(nahledRef.current); uvolni(zdrojRef.current); }, []);
  // Pozadi se behem orezu neposouva
  useEffect(() => { const p = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = p; }; }, []);

  const posun = (e: React.PointerEvent) => {
    if (tazeny.current == null || !obr.current) return;
    const r = obr.current.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    const i = tazeny.current;
    setRohy((s) => s.map((b, j) => (j === i ? { x, y } : b)));
  };

  const hotovo = async () => {
    if (!zdroj) return;
    setPracuji(true);
    // Narovnani muze na telefonu chvili trvat — necha se vykreslit "Upravuji…"
    await new Promise((r) => setTimeout(r, 30));
    try {
      const px = rohy.map((b) => ({ x: b.x * zdroj.width, y: b.y * zdroj.height }));
      const { w, h } = velikostVysledku(px, 1600);
      const src = zdroj.getContext("2d")!.getImageData(0, 0, zdroj.width, zdroj.height);
      const out = document.createElement("canvas");
      out.width = w; out.height = h;
      out.getContext("2d")!.putImageData(new ImageData(narovnej(src, px, w, h), w, h), 0, 0);
      const vysledek = await doSouboru(out, soubor.name);
      uvolni(out);
      onHotovo(vysledek);
    } catch {
      onHotovo(soubor);
    }
  };

  const body = rohy.map((b) => `${b.x * 100},${b.y * 100}`).join(" ");
  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-black/95 text-white" role="dialog" aria-modal="true" aria-label="Oříznout doklad">
      <div className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
        <span className="font-semibold">Oříznout doklad{poradi && <span className="ml-1 font-normal text-white/60">({poradi})</span>}</span>
        <button type="button" className="rounded-lg px-2 py-1 text-white/80 hover:bg-white/10" onClick={() => zdroj && nastavZdroj(otoc(zdroj))} disabled={!zdroj || pracuji}>↻ Otočit</button>
      </div>
      <p className="px-4 pb-2 text-xs text-white/70">Přetáhni 4 rohy na rohy účtenky — fotka se ořízne a narovná.</p>
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        {nahled ? (
          <div ref={obr} className="relative max-h-full max-w-full touch-none select-none"
            onPointerMove={posun} onPointerUp={() => { tazeny.current = null; }} onPointerCancel={() => { tazeny.current = null; }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={nahled} alt="" draggable={false} className="block max-h-[calc(100dvh-12rem)] max-w-full object-contain" />
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
              <defs><mask id="orez-maska"><rect width="100" height="100" fill="white" /><polygon points={body} fill="black" /></mask></defs>
              <rect width="100" height="100" fill="rgba(0,0,0,0.55)" mask="url(#orez-maska)" />
              <polygon points={body} fill="none" stroke="#fbbf24" strokeWidth="0.6" vectorEffect="non-scaling-stroke" style={{ strokeWidth: 2 }} />
            </svg>
            {rohy.map((b, i) => (
              <button key={i} type="button" aria-label={["Levý horní roh", "Pravý horní roh", "Pravý dolní roh", "Levý dolní roh"][i]}
                className="absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center active:cursor-grabbing"
                style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%` }}
                onPointerDown={(e) => { tazeny.current = i; (e.currentTarget.parentElement as HTMLElement).setPointerCapture(e.pointerId); e.preventDefault(); }}>
                <span className="h-5 w-5 rounded-full border-2 border-white bg-amber-400 shadow" />
              </button>
            ))}
          </div>
        ) : <p className="text-sm text-white/70">Načítám fotku…</p>}
      </div>
      <div className="flex gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
        <button type="button" className="flex-1 rounded-xl border border-white/30 py-3 text-sm" disabled={pracuji} onClick={() => onHotovo(soubor)}>Celá fotka</button>
        <button type="button" className="flex-1 rounded-xl border border-white/30 py-3 text-sm" disabled={pracuji} onClick={() => onHotovo(null)}>Vynechat</button>
        <button type="button" className="flex-[1.4] rounded-xl bg-amber-400 py-3 text-sm font-semibold text-slate-900" disabled={!zdroj || pracuji} onClick={hotovo}>
          {pracuji ? "Upravuji…" : "Oříznout"}
        </button>
      </div>
    </div>
  );
}
