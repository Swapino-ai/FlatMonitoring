"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { zauctujPlatby, type PlatbyState } from "@/lib/pravidelnePlatbyActions";
import type { NavrzenaPlatba } from "@/lib/pravidelnePlatby";
import { czk, dateCz } from "@/lib/format";
import { nazevMesice } from "@/lib/zalohy";
import { Hlaska } from "./form";
import { Badge } from "./Stat";

const POCET_MESICU = 6;

/**
 * Pravidelne platby: navrh mesicnich plateb (najem, zalohy od najemce, platby sluzeb) od zacatku
 * smlouvy. Zaskrtnete, co ma byt zauctovano, pripadne upravite castku, a jednim klikem to zapisete.
 * Zauctovane mesice zustavaji zamcene, takze nic nevznikne dvakrat.
 */
export function PravidelnePlatby({ propertyId, navrh }: { propertyId: string; navrh: NavrzenaPlatba[] }) {
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

  if (navrh.length === 0) {
    return (
      <p className="py-2 text-center text-sm text-ink-muted">
        Není z čeho navrhovat. Přidej nájemní smlouvu (nájemné a zálohy) nebo službu s datem „platí od“.
      </p>
    );
  }

  if (cekajici.length === 0) {
    return (
      <p className="flex items-center justify-center gap-2 py-3 text-sm text-good">
        Všechny pravidelné platby do dneška jsou zaúčtované ({hotovych}).
      </p>
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
              <label className="flex cursor-pointer items-center gap-3 bg-surface-sunken/60 px-3.5 py-2 text-sm font-semibold">
                <input type="checkbox" checked={vse} onChange={(e) => prepni(klice, e.target.checked)} aria-label={`Vybrat celý měsíc ${mesic}`} />
                <span className="capitalize">{nazevMesice(Number(m))} {rok}</span>
              </label>
              <ul className="divide-y divide-line/60">
                {radky.map((p) => (
                  <li key={p.klic} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2">
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
              </ul>
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
    </div>
  );
}
