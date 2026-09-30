"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { smazDokument, type DokumentyFormState } from "@/lib/dokumentyActions";
import { chybaSouboru, formatVelikosti, KATEGORIE, type KategorieKlic } from "@/lib/dokumenty";
import { dateCz } from "@/lib/format";
import { Hlaska, SmazatTlacitko } from "./form";
import { Ikona } from "./Ikony";

/** Kam soubor patri. Popisky (nazvy slozek) si server dohleda sam, sem patri jen identifikatory. */
export interface KontextNahrani {
  kategorie: KategorieKlic;
  propertyId?: string | null;
  tenantId?: string | null;
  leaseId?: string | null;
  sluzbaId?: string | null;
  settlementId?: string | null;
  rok?: number | null;
}

export interface DokumentRadek {
  id: string;
  name: string;
  mime: string;
  size: number;
  kategorie: string;
  rok: number | null;
  note: string | null;
  createdAt: Date | string;
}

type Stav = "ceka" | "nahrava" | "hotovo" | "chyba" | "zruseno";

interface PolozkaFronty {
  id: number;
  soubor: File;
  stav: Stav;
  procent: number;
  chyba?: string;
}

let pocitadlo = 0;

/**
 * Nahravani jednim zpusobem vsude: pretahni soubory do plochy, nebo na ni klikni.
 * Soubor jde z prohlizece primo na Google Disk (server jen schvali a zaeviduje),
 * takze velikost neomezuje server a je videt prubeh.
 *
 * Pouziti: <Nahravac kontext={{ kategorie: "NAJEMNI_SMLOUVA", leaseId }} />
 */
export function Nahravac({ kontext, nadpis, popis, vicesouboru = true, onHotovo }: {
  kontext: KontextNahrani;
  nadpis?: string;
  popis?: string;
  vicesouboru?: boolean;
  onHotovo?: () => void;
}) {
  const router = useRouter();
  const [fronta, setFronta] = useState<PolozkaFronty[]>([]);
  const [nadPlochou, setNadPlochou] = useState(false);
  const vstup = useRef<HTMLInputElement>(null);
  const zrusit = useRef(new Map<number, () => void>());
  const kat = KATEGORIE[kontext.kategorie];

  const zmen = useCallback((id: number, zmena: Partial<PolozkaFronty>) =>
    setFronta((f) => f.map((p) => (p.id === id ? { ...p, ...zmena } : p))), []);

  const nahraj = useCallback(async (p: PolozkaFronty) => {
    zmen(p.id, { stav: "nahrava", procent: 0, chyba: undefined });
    try {
      // 1) server schvali soubor a zalozi slozky
      const z = await fetch("/api/soubory/zahaj", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kontext, name: p.soubor.name, size: p.soubor.size, type: p.soubor.type }),
      });
      const zd = await z.json().catch(() => ({}));
      if (!z.ok) throw new Error(zd.error ?? "Nahrávání se nepodařilo zahájit.");

      // 2) soubor jde primo do Googlu, s prubehem
      const driveId = await new Promise<string>((ok, ne) => {
        const xhr = new XMLHttpRequest();
        zrusit.current.set(p.id, () => { xhr.abort(); });
        xhr.open("PUT", zd.uploadUrl);
        if (p.soubor.type) xhr.setRequestHeader("Content-Type", p.soubor.type);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) zmen(p.id, { procent: Math.round((e.loaded / e.total) * 100) });
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try { ok(JSON.parse(xhr.responseText).id); } catch { ne(new Error("Google nevrátil id souboru.")); }
          } else ne(new Error(`Google odmítl soubor (${xhr.status}).`));
        };
        xhr.onerror = () => ne(new Error("Přenos se přerušil. Zkontroluj připojení."));
        xhr.onabort = () => ne(new Error("__zruseno"));
        xhr.send(p.soubor);
      });

      // 3) server soubor overi a zapise do evidence
      const d = await fetch("/api/soubory/dokonci", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listek: zd.listek, driveId }),
      });
      const dd = await d.json().catch(() => ({}));
      if (!d.ok) throw new Error(dd.error ?? "Soubor se nepodařilo zaevidovat.");
      zmen(p.id, { stav: "hotovo", procent: 100 });
    } catch (e) {
      const zprava = e instanceof Error ? e.message : "Nahrávání selhalo.";
      if (zprava === "__zruseno") zmen(p.id, { stav: "zruseno" });
      else zmen(p.id, { stav: "chyba", chyba: zprava });
    } finally {
      zrusit.current.delete(p.id);
    }
  }, [kontext, zmen]);

  const pridej = useCallback((soubory: FileList | File[]) => {
    const seznam = Array.from(soubory).slice(0, vicesouboru ? 50 : 1);
    const nove: PolozkaFronty[] = seznam.map((soubor) => {
      const chyba = chybaSouboru(soubor.name, soubor.size);
      return { id: ++pocitadlo, soubor, stav: chyba ? "chyba" : "ceka", procent: 0, chyba: chyba ?? undefined };
    });
    setFronta((f) => [...f, ...nove]);
    // Nahravani bezi po dvou, at se neposlou desitky pozadavku najednou
    (async () => {
      const cekajici = nove.filter((n) => n.stav === "ceka");
      const fronta2 = [...cekajici];
      await Promise.all(Array.from({ length: Math.min(2, fronta2.length) }, async () => {
        for (let p = fronta2.shift(); p; p = fronta2.shift()) await nahraj(p);
      }));
      if (cekajici.length) { router.refresh(); onHotovo?.(); }
    })();
  }, [nahraj, router, onHotovo, vicesouboru]);

  // Po dokonceni se hotove polozky po chvili uklidi, chybne zustavaji
  useEffect(() => {
    if (!fronta.some((p) => p.stav === "hotovo")) return;
    const t = setTimeout(() => setFronta((f) => f.filter((p) => p.stav !== "hotovo")), 4000);
    return () => clearTimeout(t);
  }, [fronta]);

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-label={`${nadpis ?? "Nahrát soubory"} — přetáhni sem soubory nebo stiskni Enter`}
        onClick={() => vstup.current?.click()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); vstup.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setNadPlochou(true); }}
        onDragLeave={() => setNadPlochou(false)}
        onDrop={(e) => {
          e.preventDefault();
          setNadPlochou(false);
          if (e.dataTransfer.files.length) pridej(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
          nadPlochou ? "border-accent bg-accent-soft" : "border-line hover:border-accent/60 hover:bg-surface-sunken"
        }`}
      >
        <span className={`flex h-10 w-10 items-center justify-center rounded-full ${nadPlochou ? "bg-accent text-white" : "bg-accent-soft text-accent"}`}>
          <Ikona nazev="dokument" />
        </span>
        <div className="text-sm font-medium">{nadPlochou ? "Pusť soubory sem" : (nadpis ?? `Nahrát: ${kat.nazev}`)}</div>
        <div className="text-xs text-ink-muted">
          {popis ?? "Přetáhni soubory sem, nebo klikni a vyber je. Uloží se na Google Disk."}
        </div>
        <input ref={vstup} type="file" multiple={vicesouboru} className="sr-only" tabIndex={-1}
          onChange={(e) => { if (e.target.files?.length) pridej(e.target.files); e.target.value = ""; }} />
      </div>

      {fronta.length > 0 && (
        <ul className="mt-3 space-y-1.5" aria-live="polite">
          {fronta.map((p) => (
            <li key={p.id} className="rounded-lg border border-line px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-medium">{p.soubor.name}</span>
                <span className="shrink-0 text-xs text-ink-muted tabular-nums">{formatVelikosti(p.soubor.size)}</span>
                {p.stav === "hotovo" && <Ikona nazev="ok" trida="h-4 w-4 text-good" />}
                {p.stav === "nahrava" && (
                  <button type="button" className="text-xs text-ink-muted hover:text-bad"
                    onClick={() => zrusit.current.get(p.id)?.()}>Zrušit</button>
                )}
                {(p.stav === "chyba" || p.stav === "zruseno") && (
                  <>
                    {!chybaSouboru(p.soubor.name, p.soubor.size) && (
                      <button type="button" className="text-xs text-accent hover:underline" onClick={() => nahraj(p).then(() => router.refresh())}>Znovu</button>
                    )}
                    <button type="button" className="text-xs text-ink-muted hover:text-ink-primary"
                      onClick={() => setFronta((f) => f.filter((x) => x.id !== p.id))}>Skrýt</button>
                  </>
                )}
              </div>
              {(p.stav === "nahrava" || p.stav === "ceka") && (
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-sunken" role="progressbar"
                  aria-valuenow={p.procent} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${Math.max(p.procent, p.stav === "ceka" ? 0 : 3)}%` }} />
                </div>
              )}
              {p.stav === "chyba" && <p className="mt-1 text-xs text-bad">{p.chyba}</p>}
              {p.stav === "zruseno" && <p className="mt-1 text-xs text-ink-muted">Zrušeno.</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const ikonaSouboru = (mime: string) => (mime.startsWith("image/") ? "🖼" : mime === "application/pdf" ? "📄" : "📎");

/** Seznam nahranych dokumentu s otevrenim, stazenim a smazanim. */
export function SeznamDokumentu({ dokumenty, canEdit, prazdne = "Zatím žádné dokumenty." }: {
  dokumenty: DokumentRadek[]; canEdit: boolean; prazdne?: string;
}) {
  const [stav, smaz] = useActionState<DokumentyFormState, FormData>(smazDokument, {});

  if (dokumenty.length === 0 && !stav.success && !stav.error) {
    return <p className="py-2 text-center text-sm text-ink-muted">{prazdne}</p>;
  }

  return (
    <div>
      <Hlaska state={stav} />
      <ul className="divide-y divide-line/70 rounded-xl border border-line">
        {dokumenty.map((d) => (
          <li key={d.id} className="flex items-center gap-3 px-3 py-2">
            <span className="text-lg" aria-hidden>{ikonaSouboru(d.mime)}</span>
            <div className="min-w-0 flex-1">
              <a href={`/api/soubory/${d.id}`} target="_blank" rel="noopener noreferrer"
                className="block truncate text-sm font-medium text-accent hover:underline">{d.name}</a>
              <div className="text-xs text-ink-muted">
                {KATEGORIE[d.kategorie as KategorieKlic]?.nazev ?? d.kategorie}
                {d.rok ? ` · ${d.rok}` : ""} · {formatVelikosti(d.size)} · {dateCz(d.createdAt)}
              </div>
              {d.note && <div className="mt-0.5 text-xs text-ink-secondary">{d.note}</div>}
            </div>
            <a href={`/api/soubory/${d.id}?stahnout=1`} title="Stáhnout" aria-label={`Stáhnout ${d.name}`}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-accent-soft hover:text-accent">
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M10 3v10m0 0l-4-4m4 4l4-4M4 16h12" />
              </svg>
            </a>
            {canEdit && (
              <SmazatTlacitko action={smaz} id={d.id} potvrzeni={`Smazat dokument „${d.name}“? Na Disku půjde do koše.`} />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Nahravani i seznam dohromady — vetsina mist pouzije jen tohle. */
export function Dokumenty({ kontext, dokumenty, canEdit, nadpis, popis, prazdne }: {
  kontext: KontextNahrani; dokumenty: DokumentRadek[]; canEdit: boolean;
  nadpis?: string; popis?: string; prazdne?: string;
}) {
  return (
    <div className="space-y-3">
      {canEdit && <Nahravac kontext={kontext} nadpis={nadpis} popis={popis} />}
      <SeznamDokumentu dokumenty={dokumenty} canEdit={canEdit} prazdne={prazdne} />
    </div>
  );
}
