"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { smazPlatby, zapisZaplaceno, type PlatbyState } from "@/lib/pravidelnePlatbyActions";
import type { ZauctovanaPlatba } from "@/lib/pravidelnePlatbyData";
import { prehledPlateb, type NavrzenaPlatba } from "@/lib/pravidelnePlatby";
import { czk, dateCz } from "@/lib/format";
import { nazevMesice } from "@/lib/zalohy";
import { DatumPole } from "./DatumPole";
import { Hlaska } from "./form";
import { Ikona } from "./Ikony";
import { Badge } from "./Stat";

const POCET_MESICU = 6;

/** Sipka pro sbaleni a rozbaleni oddilu. */
/** Okno pro zadani data zaplaceni (kalendar nebo rucne) a u jedne platby i zaplacene castky. */
function ZaplacenoOkno({ nadpis, datum: d0, castka: c0, max, onPotvrdit, onZavrit }: {
  nadpis: string; datum: string; castka?: string; max: string;
  onPotvrdit: (iso: string, castka?: string) => void; onZavrit: () => void;
}) {
  const [datum, setDatum] = useState<string | null>(d0);
  const [castka, setCastka] = useState(c0 ?? "");
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onZavrit(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onZavrit]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onZavrit}>
      <div role="dialog" aria-modal="true" aria-label={nadpis} onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-card border border-line bg-surface-card p-5 shadow-pop">
        <h3 className="mb-3 text-sm font-semibold">{nadpis}</h3>
        <DatumPole label="Zaplaceno dne" name="okno-zaplaceno" max={max} hodnota={datum} defaultValue={d0} onChange={setDatum} />
        {c0 !== undefined && (
          <div className="mt-3">
            <label className="label mb-1.5 block" htmlFor="okno-castka">Zaplacená částka (Kč)</label>
            <input id="okno-castka" type="text" inputMode="decimal" className="input text-right tabular-nums" value={castka} onChange={(e) => setCastka(e.target.value)} />
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn" onClick={onZavrit}>Zrušit</button>
          <button type="button" className="btn btn-primary" disabled={!datum} onClick={() => datum && onPotvrdit(datum, c0 !== undefined ? castka : undefined)}>Zaplaceno</button>
        </div>
      </div>
    </div>
  );
}

function Sipka({ otevreno, onClick, popisek }: { otevreno: boolean; onClick: () => void; popisek: string }) {
  return (
    <button type="button" onClick={onClick} aria-expanded={otevreno} aria-label={popisek} title={otevreno ? "Sbalit" : "Rozbalit"}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-surface-sunken hover:text-ink-primary">
      <svg viewBox="0 0 20 20" className={`h-3.5 w-3.5 transition-transform ${otevreno ? "rotate-90" : ""}`} fill="none" stroke="currentColor"
        strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M7 4l6 6-6 6" /></svg>
    </button>
  );
}

/** Mnozina klicu s prepinanim: stav sbaleni jednotlivych oddilu. */
function useMnozina(vychozi: () => string[]) {
  const [m, setM] = useState<Set<string>>(() => new Set(vychozi()));
  const prepni = (k: string) => setM((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  return { m, prepni, nastav: (klice: string[]) => setM(new Set(klice)) };
}

const dnesISO = () => new Date().toISOString().slice(0, 10);
const dniPo = (datum: string) => Math.round((Date.parse(`${dnesISO()}T00:00:00Z`) - Date.parse(`${datum}T00:00:00Z`)) / 86400000);

interface Radek { datum: string | null; castka: string }

/**
 * Pravidelne platby: predpis mesicnich plateb (najem a zalohy od najemce, platby sluzeb dodavatelum)
 * od zacatku smlouvy. U kazde platby se zapise, kdy byla zaplacena, a z toho vznikne prehled,
 * kolik kde chybi: kolik dluzi najemce a kolik dluzim ja dodavatelum. Nezapisuje do Pohybu.
 */
export function PravidelnePlatby({ propertyId, navrh, zauctovane, canDelete }: {
  propertyId: string; navrh: NavrzenaPlatba[];
  /** Starsi platby zauctovane jako pohyby (jen ke cteni a smazani). */
  zauctovane: ZauctovanaPlatba[]; canDelete: boolean;
}) {
  const [stav, akce, bezi] = useActionState<PlatbyState, FormData>(zapisZaplaceno.bind(null, propertyId), {});

  // Ulozeny stav: datum a castka zaplaceni z databaze
  const ulozene = useMemo(() => {
    const m: Record<string, Radek> = {};
    for (const p of navrh) m[p.klic] = { datum: p.zaplaceno?.datum ?? null, castka: String(p.zaplaceno?.castka ?? Math.abs(p.castka)) };
    return m;
  }, [navrh]);
  const [upravy, setUpravy] = useState<Record<string, Radek>>({});
  useEffect(() => { setUpravy({}); }, [navrh]);
  const radek = (k: string): Radek => upravy[k] ?? ulozene[k];
  const nastav = (k: string, zmena: Partial<Radek>) => setUpravy((u) => ({ ...u, [k]: { ...(u[k] ?? ulozene[k]), ...zmena } }));

  const [okno, setOkno] = useState<{ nadpis: string; platby: NavrzenaPlatba[]; datum: string; castka?: string } | null>(null);
  const zmeneno = navrh.filter((p) => {
    if (p.zaplaceno?.zdroj === "POHYB") return false;
    const r = radek(p.klic), u = ulozene[p.klic];
    return r.datum !== u.datum || (r.datum && Number(r.castka.replace(",", ".")) !== Number(u.castka));
  });

  const prehled = useMemo(() => prehledPlateb(navrh), [navrh]);

  const mesice = useMemo(() => {
    const m = new Map<string, NavrzenaPlatba[]>();
    for (const p of navrh) m.set(p.mesic, [...(m.get(p.mesic) ?? []), p]);
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [navrh]);
  const [vsechnyMesice, setVsechnyMesice] = useState(false);
  const zobrazene = vsechnyMesice ? mesice : mesice.slice(0, POCET_MESICU);

  // Vsechno je vychozi sbalene krome nejnovejsiho mesice; skupiny (najemce, dodavatel) jsou sbalene vzdy
  const mesiceOtevrene = useMnozina(() => (mesice[0] ? [mesice[0][0]] : []));
  const skupinyOtevrene = useMnozina(() => []);
  const rozpisOtevreny = useMnozina(() => ["najemci"]);
  const klicSkupiny = (mesic: string, sk: { typ: string; nazev: string }) => `${mesic}|${sk.typ}|${sk.nazev}`;

  const zauctovaneSekce = <ZauctovanePlatby propertyId={propertyId} platby={zauctovane} canDelete={canDelete} />;

  if (navrh.length === 0) {
    return (
      <div>
        <p className="py-2 text-center text-sm text-ink-muted">
          Není z čeho vycházet. Přidej nájemní smlouvu (nájemné a zálohy) nebo službu s datem „platí od“.
        </p>
        {zauctovaneSekce}
      </div>
    );
  }

  const dnes = dnesISO();
  const otevriHromadne = (nadpis: string, platby: NavrzenaPlatba[]) => setOkno({ nadpis, platby, datum: dnes });
  const nastavDatum = (platby: NavrzenaPlatba[], datum: string) => {
    setUpravy((u) => {
      const n = { ...u };
      for (const p of platby) {
        if (p.zaplaceno?.zdroj === "POHYB") continue;
        const r = n[p.klic] ?? ulozene[p.klic];
        if (!r.datum) n[p.klic] = { ...r, datum };
      }
      return n;
    });
  };

  const tile = (nazev: string, hodnota: number, popis: string, zle: boolean) => (
    <div className={`rounded-xl border px-4 py-3 ${zle && hodnota > 0 ? "border-bad/40 bg-bad/5" : "border-line"}`}>
      <div className="text-xs font-medium text-ink-muted">{nazev}</div>
      <div className={`mt-0.5 text-xl font-bold tabular-nums ${zle && hodnota > 0 ? "text-bad" : "text-good"}`}>{czk(hodnota)}</div>
      <div className="text-xs text-ink-muted">{popis}</div>
    </div>
  );

  const rozpis = (klic: string, nadpis: string, radky: typeof prehled.najemci, prazdne: string) => (
    <div className="rounded-xl border border-line">
      <button type="button" onClick={() => rozpisOtevreny.prepni(klic)} aria-expanded={rozpisOtevreny.m.has(klic)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold">
        <Sipka otevreno={rozpisOtevreny.m.has(klic)} onClick={() => undefined} popisek="" />
        <span className="flex-1">{nadpis}</span>
        <span className="text-xs font-normal text-ink-muted">{radky.filter((r) => r.dluh > 0).length} s dluhem</span>
      </button>
      {rozpisOtevreny.m.has(klic) && (
        <ul className="divide-y divide-line/60 border-t border-line/60">
          {radky.length === 0 && <li className="px-3.5 py-2 text-xs text-ink-muted">{prazdne}</li>}
          {radky.map((r) => (
            <li key={r.nazev} className="flex flex-wrap items-center gap-x-3 px-3.5 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{r.nazev}</span>
              <span className="text-xs text-ink-muted">
                {r.nezaplacenych > 0 && `${r.nezaplacenych} nezaplacených`}
                {r.nezaplacenych > 0 && r.nedoplaceno > 0 && " · "}
                {r.nedoplaceno > 0 && `${r.nedoplaceno} nedoplaceno`}
                {r.nejstarsi && r.dluh > 0 && ` · nejstarší ${dateCz(r.nejstarsi)}`}
                {r.preplaceno > 0 && ` · zaplaceno navíc ${czk(r.preplaceno)}`}
              </span>
              <span className={`w-28 text-right font-semibold tabular-nums ${r.dluh > 0 ? "text-bad" : "text-good"}`}>{r.dluh > 0 ? czk(r.dluh) : "vše zaplaceno"}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div>
      <Hlaska state={stav} />

      {/* Prehled: kolik kde chybi */}
      <div className="grid gap-3 sm:grid-cols-2">
        {tile("Nájemci dluží", prehled.najemciDluzi, `nájemné a zálohy, které nejsou zaplacené (zaplaceno ${czk(prehled.zaplacenoCelkem.prijmy)})`, true)}
        {tile("Dlužím dodavatelům", prehled.dluzimDodavatelum, `platby za služby, které jsem nezaplatil (zaplaceno ${czk(prehled.zaplacenoCelkem.vydaje)})`, true)}
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {rozpis("najemci", "Po nájemcích", prehled.najemci, "Žádný nájemce.")}
        {rozpis("dodavatele", "Po dodavatelích", prehled.dodavatele, "Žádný dodavatel.")}
      </div>

      <div className="mb-3 mt-5 flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="text-ink-secondary">
          U každé platby zapiš, <strong>kdy byla zaplacena</strong>. Bez data je nezaplacená a počítá se do dluhu.
        </p>
        <div className="flex gap-1.5">
          <button type="button" className="btn text-xs" onClick={() => { mesiceOtevrene.nastav(zobrazene.map(([k]) => k)); }}>Rozbalit měsíce</button>
          <button type="button" className="btn text-xs" onClick={() => { mesiceOtevrene.nastav([]); skupinyOtevrene.nastav([]); }}>Sbalit vše</button>
        </div>
      </div>

      <div className="space-y-3">
        {zobrazene.map(([mesic, radky]) => {
          const [rok, m] = mesic.split("-");
          const dluhMesice = prehledPlateb(radky);
          const dluh = dluhMesice.najemciDluzi + dluhMesice.dluzimDodavatelum;
          const nezapl = radky.filter((p) => !p.zaplaceno).length;
          return (
            <section key={mesic} className="overflow-hidden rounded-xl border border-line">
              <div className="flex items-center gap-2 bg-surface-sunken/60 px-3 py-2 text-sm font-semibold">
                <Sipka otevreno={mesiceOtevrene.m.has(mesic)} onClick={() => mesiceOtevrene.prepni(mesic)} popisek={`Rozbalit nebo sbalit měsíc ${mesic}`} />
                <span className="flex-1 capitalize">{nazevMesice(Number(m))} {rok}</span>
                {dluh > 0
                  ? <Badge tone="bad">{nezapl > 0 ? `${nezapl} nezaplaceno` : "nedoplaceno"} · {czk(dluh)}</Badge>
                  : <Badge tone="good">vše zaplaceno</Badge>}
                {radky.some((p) => !radek(p.klic).datum) && <button type="button" className="btn px-2 py-0.5 text-xs font-normal" onClick={() => otevriHromadne(`Vše zaplaceno: ${nazevMesice(Number(m))} ${rok}`, radky)}>Vše zaplaceno</button>}
              </div>
              {mesiceOtevrene.m.has(mesic) && skupiny(radky).map((sk) => {
                const k = klicSkupiny(mesic, sk);
                const otevrena = skupinyOtevrene.m.has(k);
                const dl = prehledPlateb(sk.platby);
                const dluhSk = dl.najemciDluzi + dl.dluzimDodavatelum;
                return (
                  <div key={k} className="border-t border-line/60">
                    <div className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                      <Sipka otevreno={otevrena} onClick={() => skupinyOtevrene.prepni(k)} popisek={`Rozbalit nebo sbalit ${sk.nazev}`} />
                      <span className="min-w-0 flex-1 truncate">{sk.typ === "DODAVATEL" ? "Dodavatel" : "Nájemce"}: <span className="normal-case tracking-normal text-ink-primary">{sk.nazev}</span></span>
                      <span className="normal-case tracking-normal">{sk.platby.length}×</span>
                      <span className={`w-24 text-right normal-case tracking-normal tabular-nums ${dluhSk > 0 ? "text-bad" : "text-good"}`}>{dluhSk > 0 ? czk(dluhSk) : "zaplaceno"}</span>
                      {sk.platby.some((p) => !radek(p.klic).datum) && <button type="button" className="btn px-2 py-0.5 text-[11px] normal-case tracking-normal font-normal" onClick={() => otevriHromadne(`Zaplaceno: ${sk.nazev}`, sk.platby)}>Zaplaceno</button>}
                    </div>
                    {otevrena && (
                      <ul className="divide-y divide-line/60">
                        {sk.platby.map((p) => {
                          const r = radek(p.klic);
                          const pohyb = p.zaplaceno?.zdroj === "POHYB";
                          const predpis = Math.abs(p.castka);
                          const zaplacenoCastka = Number(r.castka.replace(",", ".")) || 0;
                          const mene = r.datum && zaplacenoCastka > 0 && predpis - zaplacenoCastka > 0.005;
                          return (
                            <li key={p.klic} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2 pl-9 pr-3.5">
                              <div className="min-w-0 flex-1 basis-48">
                                <div className="text-sm">{p.popis}</div>
                                <div className="text-xs text-ink-muted">
                                  splatnost {dateCz(p.datum)} · předpis {czk(predpis)}
                                  {p.castecny && <span className="ml-2"><Badge tone="warn">částečný měsíc</Badge></span>}
                                  {!r.datum && dniPo(p.datum) > 0 && <span className="ml-2 text-bad">po splatnosti {dniPo(p.datum)} dní</span>}
                                  {mene && <span className="ml-2 text-warn">nedoplaceno {czk(predpis - zaplacenoCastka)}</span>}
                                </div>
                              </div>
                              {pohyb ? (
                                <span className="text-xs text-ink-secondary">
                                  zaplaceno {dateCz(p.zaplaceno!.datum)} · {czk(p.zaplaceno!.castka)} <Badge tone="neutral">zaúčtováno jako pohyb</Badge>
                                </span>
                              ) : (
                                r.datum ? (
                                  <div className="flex items-center gap-2">
                                    <div className="text-right leading-tight">
                                      <span className="inline-flex items-center gap-1 rounded-full bg-good/10 px-2 py-0.5 text-xs font-medium text-good">
                                        <Ikona nazev="ok" trida="h-3 w-3" />zaplaceno {dateCz(r.datum)}
                                      </span>
                                      <div className={`mt-0.5 text-sm font-semibold tabular-nums ${mene ? "text-warn" : ""}`}>{czk(zaplacenoCastka)}</div>
                                    </div>
                                    <button type="button" title="Změnit datum nebo částku" aria-label="Změnit zaplacení"
                                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-accent-soft hover:text-accent"
                                      onClick={() => setOkno({ nadpis: p.popis, platby: [p], datum: r.datum!, castka: r.castka })}>
                                      <Ikona nazev="pero" />
                                    </button>
                                    <button type="button" title="Zrušit zaplacení" aria-label="Zrušit zaplacení"
                                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-bad/10 hover:text-bad"
                                      onClick={() => nastav(p.klic, { datum: null })}>
                                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
                                    </button>
                                  </div>
                                ) : (
                                  <button type="button" className="btn px-3 py-1 text-xs" onClick={() => setOkno({ nadpis: p.popis, platby: [p], datum: dnes, castka: r.castka })}>Zaplaceno</button>
                                )
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>

      {mesice.length > POCET_MESICU && (
        <button type="button" className="btn mt-3 w-full text-xs" onClick={() => setVsechnyMesice((v) => !v)}>
          {vsechnyMesice ? "Zobrazit jen nejnovější měsíce" : `Zobrazit starší měsíce (${mesice.length - POCET_MESICU})`}
        </button>
      )}

      {okno && (
        <ZaplacenoOkno nadpis={okno.nadpis} datum={okno.datum} castka={okno.castka} max={dnes} onZavrit={() => setOkno(null)}
          onPotvrdit={(iso, castka) => {
            if (okno.castka !== undefined) nastav(okno.platby[0].klic, { datum: iso, castka: castka ?? okno.castka });
            else nastavDatum(okno.platby, iso);
            setOkno(null);
          }} />
      )}

      <form action={akce} className="sticky bottom-3 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface-card px-4 py-3 shadow-pop">
        <input type="hidden" name="platby" value={JSON.stringify(zmeneno.map((p) => {
          const r = radek(p.klic);
          return { klic: p.klic, datum: r.datum, castka: Number(r.castka.replace(",", ".")) || Math.abs(p.castka) };
        }))} />
        <div className="text-sm">
          {zmeneno.length === 0 ? <span className="text-ink-muted">Žádná neuložená změna</span> : <><strong>{zmeneno.length}</strong> neuložených změn</>}
        </div>
        <div className="flex gap-2">
          {zmeneno.length > 0 && <button type="button" className="btn" onClick={() => setUpravy({})}>Zahodit změny</button>}
          <button type="submit" disabled={bezi || zmeneno.length === 0} className="btn btn-primary">
            {bezi ? "Ukládám…" : "Uložit zaplacené"}
          </button>
        </div>
      </form>

      {zauctovaneSekce}
    </div>
  );
}

/** Skupiny v mesici: nejdriv najemce (najem a zalohy), potom dodavatele podle abecedy. */
function skupiny(radky: NavrzenaPlatba[]) {
  const m = new Map<string, { typ: "NAJEMCE" | "DODAVATEL"; nazev: string; platby: NavrzenaPlatba[] }>();
  for (const p of radky) {
    const k = `${p.skupina.typ}:${p.skupina.nazev}`;
    const g = m.get(k) ?? { typ: p.skupina.typ, nazev: p.skupina.nazev, platby: [] };
    g.platby.push(p);
    m.set(k, g);
  }
  return [...m.values()].sort((a, b) => (a.typ === b.typ ? a.nazev.localeCompare(b.nazev, "cs") : a.typ === "NAJEMCE" ? -1 : 1));
}

/**
 * Uz zauctovane pravidelne platby po mesicich. Smazani (jen majitel) platbu vrati do navrhu,
 * takze jde opravit chybne zaúčtovanou castku: smazat a zauctovat znovu.
 */
function ZauctovanePlatby({ propertyId, platby, canDelete }: { propertyId: string; platby: ZauctovanaPlatba[]; canDelete: boolean }) {
  const [stav, akce, bezi] = useActionState<PlatbyState, FormData>(smazPlatby.bind(null, propertyId), {});
  const [otevreno, setOtevreno] = useState(false);
  const [vybrano, setVybrano] = useState<Set<string>>(new Set());
  const [otevreneMesice, setOtevreneMesice] = useState<Set<string>>(new Set());
  const prepniMesic = (k: string) => setOtevreneMesice((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const mesice = useMemo(() => {
    const m = new Map<string, ZauctovanaPlatba[]>();
    for (const p of platby) m.set(p.mesic, [...(m.get(p.mesic) ?? []), p]);
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [platby]);

  useEffect(() => { setVybrano(new Set()); }, [platby]);
  if (platby.length === 0 && !stav.success && !stav.error) return null;

  const prepni = (ids: string[], zapnout: boolean) =>
    setVybrano((s) => { const n = new Set(s); for (const i of ids) (zapnout ? n.add(i) : n.delete(i)); return n; });

  return (
    <div className="mt-5 border-t border-line pt-4">
      <button type="button" onClick={() => setOtevreno((o) => !o)} aria-expanded={otevreno}
        className="flex w-full items-center justify-between text-sm font-semibold">
        <span>Starší platby zaúčtované jako pohyby ({platby.length})</span>
        <span className="text-ink-muted" aria-hidden>{otevreno ? "▾" : "▸"}</span>
      </button>
      <Hlaska state={stav} />

      {otevreno && (
        <form action={akce} className="mt-3 space-y-3">
          {mesice.map(([mesic, radky]) => {
            const [rok, m] = mesic.split("-");
            const ids = radky.map((p) => p.id);
            return (
              <section key={mesic} className="overflow-hidden rounded-xl border border-line">
                <div className="flex items-center gap-2 bg-surface-sunken/60 px-3 py-2 text-sm font-semibold">
                  <Sipka otevreno={otevreneMesice.has(mesic)} onClick={() => prepniMesic(mesic)} popisek={`Rozbalit nebo sbalit měsíc ${mesic}`} />
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                    {canDelete && <input type="checkbox" checked={ids.every((i) => vybrano.has(i))} onChange={(e) => prepni(ids, e.target.checked)} aria-label={`Vybrat celý měsíc ${mesic}`} />}
                    <span className="capitalize">{nazevMesice(Number(m))} {rok}</span>
                  </label>
                  <span className="text-xs font-normal text-ink-muted">{radky.length}×</span>
                  <span className="w-24 text-right text-xs font-medium tabular-nums">{czk(radky.reduce((a, p) => a + p.castka, 0))}</span>
                </div>
                {otevreneMesice.has(mesic) && <ul className="divide-y divide-line/60">
                  {radky.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 px-3.5 py-1.5 text-sm">
                      {canDelete && <input type="checkbox" checked={vybrano.has(p.id)} onChange={(e) => prepni([p.id], e.target.checked)} aria-label={p.popis} />}
                      <span className="min-w-0 flex-1 truncate">{p.popis}</span>
                      <span className="text-xs text-ink-muted">{dateCz(p.datum)}</span>
                      <span className={`w-24 text-right tabular-nums ${p.castka < 0 ? "text-bad" : "text-good"}`}>{czk(p.castka)}</span>
                    </li>
                  ))}
                </ul>}
              </section>
            );
          })}
          {canDelete ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-ink-muted">Smazaná platba se znovu objeví v návrhu výše. Ručně zadané pohyby se tady nemažou.</p>
              {vybrano.size > 0 && [...vybrano].map((id) => <input key={id} type="hidden" name="id" value={id} />)}
              <button type="submit" disabled={bezi || vybrano.size === 0} className="btn text-bad"
                onClick={(e) => { if (!confirm(`Smazat ${vybrano.size} zaúčtovaných plateb?`)) e.preventDefault(); }}>
                {bezi ? "Mažu…" : `Smazat vybrané (${vybrano.size})`}
              </button>
            </div>
          ) : (
            <p className="text-xs text-ink-muted">Mazat zaúčtované platby může jen majitel.</p>
          )}
        </form>
      )}
    </div>
  );
}
