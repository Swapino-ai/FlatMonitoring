"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { smazPlatby, zauctujPlatby, type PlatbyState } from "@/lib/pravidelnePlatbyActions";
import type { ZauctovanaPlatba } from "@/lib/pravidelnePlatbyData";
import type { NavrzenaPlatba } from "@/lib/pravidelnePlatby";
import { czk, dateCz } from "@/lib/format";
import { nazevMesice } from "@/lib/zalohy";
import { Hlaska } from "./form";
import { Badge } from "./Stat";

const POCET_MESICU = 6;

/** Sipka pro sbaleni a rozbaleni oddilu. */
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

/**
 * Pravidelne platby: navrh mesicnich plateb (najem, zalohy od najemce, platby sluzeb) od zacatku
 * smlouvy. Zaskrtnete, co ma byt zauctovano, pripadne upravite castku, a jednim klikem to zapisete.
 * Zauctovane mesice zustavaji zamcene, takze nic nevznikne dvakrat.
 */
export function PravidelnePlatby({ propertyId, navrh, zauctovane, canDelete }: {
  propertyId: string; navrh: NavrzenaPlatba[];
  /** Uz zauctovane pravidelne platby (k prehledu a smazani). */
  zauctovane: ZauctovanaPlatba[]; canDelete: boolean;
}) {
  const [stav, akce, bezi] = useActionState<PlatbyState, FormData>(zauctujPlatby.bind(null, propertyId), {});

  const cekajici = useMemo(() => navrh.filter((p) => p.stav !== "zauctovano"), [navrh]);
  const hotovych = navrh.length - cekajici.length;

  // Vychozi: zaskrtnute vsechno navrzene; "mozna uz zauctovano" ne
  const [vybrano, setVybrano] = useState<Set<string>>(() => new Set(cekajici.filter((p) => p.stav === "navrzeno").map((p) => p.klic)));
  const [castky, setCastky] = useState<Record<string, string>>({});
  const [vsechnyMesice, setVsechnyMesice] = useState(false);

  // Po zauctovani pribyla data ze serveru: vyber se prepocte
  useEffect(() => {
    setVybrano(new Set(cekajici.filter((p) => p.stav === "navrzeno").map((p) => p.klic)));
    setCastky({});
  }, [cekajici]);

  const mesice = useMemo(() => {
    const m = new Map<string, NavrzenaPlatba[]>();
    for (const p of cekajici) m.set(p.mesic, [...(m.get(p.mesic) ?? []), p]);
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [cekajici]);
  const zobrazene = vsechnyMesice ? mesice : mesice.slice(0, POCET_MESICU);

  // Rozbalene mesice (vychozi: jen nejnovejsi) a sbalene skupiny (najemce / dodavatel) uvnitr nich
  const mesiceOtevrene = useMnozina(() => (mesice[0] ? [mesice[0][0]] : []));
  // Vychozi: skupiny dodavatelu jsou sbalene (nejdriv najemce), rozbalit jde jednotlive i tlacitkem "Rozbalit vše"
  const skupinyDodavatelu = () => cekajici.filter((p) => p.skupina.typ === "DODAVATEL").map((p) => `${p.mesic}|DODAVATEL|${p.skupina.nazev}`);
  const skupinyZavrene = useMnozina(skupinyDodavatelu);
  const vsechnyKlice = () => zobrazene.map(([k]) => k);
  const klicSkupiny = (mesic: string, sk: { typ: string; nazev: string }) => `${mesic}|${sk.typ}|${sk.nazev}`;

  const hodnota = (p: NavrzenaPlatba) => {
    const t = castky[p.klic];
    if (t === undefined) return p.castka;
    const n = Number(t.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) && n !== 0 ? (p.castka < 0 ? -Math.abs(n) : Math.abs(n)) : p.castka;
  };

  const vybrane = cekajici.filter((p) => vybrano.has(p.klic));
  const prijmy = vybrane.filter((p) => p.castka > 0).reduce((a, p) => a + hodnota(p), 0);
  const vydaje = vybrane.filter((p) => p.castka < 0).reduce((a, p) => a + hodnota(p), 0);

  const prepni = (klice: string[], zapnout: boolean) =>
    setVybrano((s) => { const n = new Set(s); for (const k of klice) (zapnout ? n.add(k) : n.delete(k)); return n; });

  const zauctovaneSekce = <ZauctovanePlatby propertyId={propertyId} platby={zauctovane} canDelete={canDelete} />;

  if (navrh.length === 0) {
    return (
      <div>
        <p className="py-2 text-center text-sm text-ink-muted">
          Není z čeho navrhovat. Přidej nájemní smlouvu (nájemné a zálohy) nebo službu s datem „platí od“.
        </p>
        {zauctovaneSekce}
      </div>
    );
  }

  if (cekajici.length === 0) {
    return (
      <div>
        <p className="flex items-center justify-center gap-2 py-3 text-sm text-good">
          Všechny pravidelné platby do dneška jsou zaúčtované ({hotovych}).
        </p>
        {zauctovaneSekce}
      </div>
    );
  }

  return (
    <div>
      <Hlaska state={stav} />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="text-ink-secondary">
          K zaúčtování je <strong>{cekajici.length}</strong> plateb{hotovych > 0 ? `, ${hotovych} už zaúčtováno` : ""}.
          Nájemce zaplatil vše podle smlouvy, částku jde u řádku upravit.
        </p>
        <div className="flex gap-1.5">
          <button type="button" className="btn text-xs" onClick={() => { mesiceOtevrene.nastav(vsechnyKlice()); skupinyZavrene.nastav([]); }}>Rozbalit vše</button>
          <button type="button" className="btn text-xs" onClick={() => { mesiceOtevrene.nastav([]); skupinyZavrene.nastav(skupinyDodavatelu()); }}>Sbalit vše</button>
          <button type="button" className="btn text-xs" onClick={() => prepni(cekajici.map((p) => p.klic), true)}>Vybrat vše</button>
          <button type="button" className="btn text-xs" onClick={() => setVybrano(new Set())}>Zrušit výběr</button>
        </div>
      </div>

      <div className="space-y-3">
        {zobrazene.map(([mesic, radky]) => {
          const klice = radky.map((p) => p.klic);
          const vse = klice.every((k) => vybrano.has(k));
          const [rok, m] = mesic.split("-");
          return (
            <section key={mesic} className="overflow-hidden rounded-xl border border-line">
              <div className="flex items-center gap-2 bg-surface-sunken/60 px-3 py-2 text-sm font-semibold">
                <Sipka otevreno={mesiceOtevrene.m.has(mesic)} onClick={() => mesiceOtevrene.prepni(mesic)} popisek={`Rozbalit nebo sbalit měsíc ${mesic}`} />
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                  <input type="checkbox" checked={vse} onChange={(e) => prepni(klice, e.target.checked)} aria-label={`Vybrat celý měsíc ${mesic}`} />
                  <span className="capitalize">{nazevMesice(Number(m))} {rok}</span>
                </label>
                <span className="text-xs font-normal text-ink-muted">
                  {radky.filter((p) => vybrano.has(p.klic)).length}/{radky.length}
                </span>
                <span className="w-24 text-right text-xs font-medium tabular-nums">
                  {czk(radky.filter((p) => vybrano.has(p.klic)).reduce((a, p) => a + hodnota(p), 0))}
                </span>
              </div>
              {mesiceOtevrene.m.has(mesic) && skupiny(radky).map((sk) => {
                const kl = sk.platby.map((p) => p.klic);
                const soucet = sk.platby.filter((p) => vybrano.has(p.klic)).reduce((a, p) => a + hodnota(p), 0);
                return (
                  <div key={`${sk.typ}:${sk.nazev}`} className="border-t border-line/60">
                    <div className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                      <Sipka otevreno={!skupinyZavrene.m.has(klicSkupiny(mesic, sk))} onClick={() => skupinyZavrene.prepni(klicSkupiny(mesic, sk))}
                        popisek={`Rozbalit nebo sbalit skupinu ${sk.nazev}`} />
                      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                        <input type="checkbox" checked={kl.every((k) => vybrano.has(k))} onChange={(e) => prepni(kl, e.target.checked)}
                          aria-label={`Vybrat skupinu ${sk.nazev}`} />
                        <span className="min-w-0 flex-1 truncate">{sk.typ === "DODAVATEL" ? "Dodavatel" : "Nájemce"}: <span className="normal-case tracking-normal text-ink-primary">{sk.nazev}</span></span>
                      </label>
                      <span className="normal-case tracking-normal">{sk.platby.length}×</span>
                      <span className={`w-24 text-right tabular-nums normal-case tracking-normal ${soucet < 0 ? "text-bad" : soucet > 0 ? "text-good" : ""}`}>{soucet ? czk(soucet) : ""}</span>
                    </div>
                    {!skupinyZavrene.m.has(klicSkupiny(mesic, sk)) && <ul className="divide-y divide-line/60">
                      {sk.platby.map((p) => (
                        <li key={p.klic} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 pl-9 pr-3.5">
                          <input type="checkbox" checked={vybrano.has(p.klic)} onChange={(e) => prepni([p.klic], e.target.checked)}
                            aria-label={p.popis} />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm">{p.popis}</div>
                            <div className="text-xs text-ink-muted">
                              {dateCz(p.datum)}
                              {p.castecny && <span className="ml-2"><Badge tone="warn">částečný měsíc</Badge></span>}
                              {p.stav === "mozna" && <span className="ml-2"><Badge tone="warn">možná už zaúčtováno</Badge></span>}
                            </div>
                            {p.poznamka && <div className="text-xs text-warn">{p.poznamka}</div>}
                          </div>
                          <input
                            type="text" inputMode="decimal" aria-label={`Částka: ${p.popis}`}
                            className={`input w-28 py-1 text-right tabular-nums ${p.castka < 0 ? "text-bad" : ""}`}
                            value={castky[p.klic] ?? String(Math.abs(p.castka))}
                            onChange={(e) => setCastky((c) => ({ ...c, [p.klic]: e.target.value }))}
                          />
                          <span className="w-6 text-xs text-ink-muted">Kč</span>
                        </li>
                      ))}
                    </ul>}
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

      <form action={akce} className="sticky bottom-3 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface-card px-4 py-3 shadow-pop">
        <input type="hidden" name="platby" value={JSON.stringify(vybrane.map((p) => ({ klic: p.klic, castka: hodnota(p) })))} />
        <div className="text-sm">
          <strong>{vybrane.length}</strong> vybráno
          {vybrane.length > 0 && (
            <span className="ml-2 text-ink-secondary tabular-nums">
              příjmy <span className="text-good">{czk(prijmy)}</span> · výdaje <span className="text-bad">{czk(-vydaje)}</span>
            </span>
          )}
        </div>
        <button type="submit" disabled={bezi || vybrane.length === 0} className="btn btn-primary">
          {bezi ? "Účtuji…" : `Zaúčtovat vybrané (${vybrane.length})`}
        </button>
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
        <span>Zaúčtované pravidelné platby ({platby.length})</span>
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
