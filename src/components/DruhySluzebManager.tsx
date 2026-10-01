"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { deleteServiceType, priradIkony, saveServiceType, type TypyFormState } from "@/lib/typySluzebActions";
import { navrhniIkonu, type TypySluzeb } from "@/lib/categories";
import { Hlaska, SmazatTlacitko } from "./form";
import { Ikona, type NazevIkony } from "./Ikony";

const IKONY: [NazevIkony, string][] = [
  ["blesk", "Blesk"], ["plamen", "Plamen"], ["kapka", "Kapka"], ["teplomer", "Teploměr"], ["wifi", "Wi‑Fi"],
  ["stit", "Štít"], ["budova", "Budova"], ["kufr", "Kufřík"], ["odpad", "Odpad"], ["kalendar", "Kalendář"],
  ["penize", "Peníze"], ["dokument", "Dokument"], ["najemce", "Lidé"], ["tri", "Tři tečky"],
  ["uklid", "Koště (úklid)"], ["zelen", "Strom (zeleň)"], ["vytah", "Výtah"], ["schody", "Schody"],
  ["zarovka", "Žárovka (osvětlení)"], ["klic", "Klíč (domovník)"], ["naradi", "Nářadí (opravy)"],
  ["televize", "Televize"], ["kamera", "Kamera (ostraha)"], ["parkovani", "Parkování"],
];

/** Mrizka ikon v bublině: zobrazí se aktuální ikona, klik otevře výběr a vybraná se hned použije. */
function VyberIkony({ hodnota, onZmena, nazev }: { hodnota: string; onZmena: (ikona: string) => void; nazev: string }) {
  const [otevreno, setOtevreno] = useState(false);
  const obal = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!otevreno) return;
    const zavri = (e: MouseEvent) => { if (obal.current && !obal.current.contains(e.target as Node)) setOtevreno(false); };
    const klavesa = (e: KeyboardEvent) => { if (e.key === "Escape") setOtevreno(false); };
    document.addEventListener("mousedown", zavri);
    document.addEventListener("keydown", klavesa);
    return () => { document.removeEventListener("mousedown", zavri); document.removeEventListener("keydown", klavesa); };
  }, [otevreno]);

  return (
    <div ref={obal} className="relative">
      <button type="button" onClick={() => setOtevreno((o) => !o)} aria-haspopup="listbox" aria-expanded={otevreno}
        title="Změnit ikonu" aria-label={`Změnit ikonu: ${nazev}`}
        className="flex h-8 items-center gap-1 rounded-xl bg-accent-soft pl-2 pr-1.5 text-accent transition-colors hover:bg-accent/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
        <Ikona nazev={hodnota as NazevIkony} trida="h-4 w-4" />
        <svg viewBox="0 0 20 20" className="h-3 w-3 opacity-70" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 8l5 5 5-5" /></svg>
      </button>
      {otevreno && (
        <div role="listbox" aria-label="Ikony" className="absolute left-0 z-30 mt-1 grid w-[17rem] grid-cols-6 gap-1 rounded-xl border border-line bg-surface-card p-2 shadow-lg">
          {IKONY.map(([k, n]) => (
            <button key={k} type="button" role="option" aria-selected={k === hodnota} title={n} aria-label={n}
              onClick={() => { onZmena(k); setOtevreno(false); }}
              className={`flex h-9 items-center justify-center rounded-lg transition-colors ${
                k === hodnota ? "bg-accent text-white" : "text-ink-secondary hover:bg-accent-soft hover:text-accent"}`}>
              <Ikona nazev={k} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Jeden existujici druh: zmena ikony se uloží hned, název a přeúčtování tlačítkem Uložit. */
function RadekDruhu({ klic, t, pouzito, action, pending, delAction }: {
  klic: string; t: TypySluzeb[string]; pouzito: number;
  action: (p: FormData) => void; pending: boolean; delAction: (p: FormData) => void;
}) {
  const [ikona, setIkona] = useState(t.icon);
  useEffect(() => setIkona(t.icon), [t.icon]);
  const formular = useRef<HTMLFormElement>(null);

  return (
    <li className="px-3 py-2.5">
      <form ref={formular} action={action} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="key" value={klic} />
        <input type="hidden" name="icon" value={ikona} />
        <VyberIkony hodnota={ikona} nazev={t.name}
          onZmena={(k) => { setIkona(k); setTimeout(() => formular.current?.requestSubmit(), 0); }} />
        <input name="name" defaultValue={t.name} required aria-label="Název druhu" className="input min-w-[10rem] flex-1 py-1.5" />
        <label className="flex items-center gap-1.5 text-xs text-ink-secondary" title="Nová služba tohoto druhu se předvyplní jako přeúčtovaná nájemci">
          <input type="checkbox" name="chargedByDefault" defaultChecked={t.chargedByDefault} />
          přeúčtovat
        </label>
        <button type="submit" disabled={pending} className="btn px-2.5 py-1 text-xs">Uložit</button>
        <span className="text-xs text-ink-muted">{pouzito}×</span>
        {pouzito === 0 && <SmazatTlacitko action={delAction} id={klic} potvrzeni={`Smazat druh „${t.name}“?`} />}
      </form>
    </li>
  );
}

/** Druhy sluzeb: prejmenovani, ikona, vychozi prepinac "preuctuje se najemci", pridani vlastniho. */
export function DruhySluzebManager({ typy, pouziti }: { typy: TypySluzeb; pouziti: Record<string, number> }) {
  const [state, action, pending] = useActionState<TypyFormState, FormData>(saveServiceType, {});
  const [delState, delAction] = useActionState<TypyFormState, FormData>(deleteServiceType, {});
  const [ikonyStav, setIkonyStav] = useState<TypyFormState>({});
  const [bezi, spust] = useTransition();

  // Novy druh: ikona se navrhne podle nazvu, dokud ji clovek sam nezmeni
  const [novyNazev, setNovyNazev] = useState("");
  const [novaIkona, setNovaIkona] = useState("tri");
  const [ikonaRucne, setIkonaRucne] = useState(false);

  return (
    <div>
      <Hlaska state={ikonyStav.error || ikonyStav.success ? ikonyStav : state.error || state.success ? state : delState} />
      <div className="mb-3 flex justify-end">
        <button type="button" className="btn text-xs" disabled={bezi} onClick={() => spust(async () => setIkonyStav(await priradIkony()))}>
          {bezi ? "Přiřazuji…" : "Přiřadit ikony podle názvu"}
        </button>
      </div>
      <ul className="divide-y divide-line/70 rounded-xl border border-line">
        {Object.entries(typy).map(([key, t]) => (
          <RadekDruhu key={key} klic={key} t={t} pouzito={pouziti[key] ?? 0} action={action} pending={pending} delAction={delAction} />
        ))}
      </ul>

      <form action={action} className="mt-4 flex flex-wrap items-end gap-2 rounded-xl bg-surface-sunken p-3">
        <div className="min-w-[12rem] flex-1">
          <label className="label mb-1.5 block" htmlFor="novy-druh">Nový druh služby</label>
          <input id="novy-druh" name="name" required placeholder="např. Úklid společných prostor" className="input"
            value={novyNazev}
            onChange={(e) => {
              setNovyNazev(e.target.value);
              if (!ikonaRucne) setNovaIkona(navrhniIkonu(e.target.value) ?? "tri");
            }} />
        </div>
        <input type="hidden" name="icon" value={novaIkona} />
        <div>
          <span className="label mb-1.5 block">Ikona</span>
          <VyberIkony hodnota={novaIkona} nazev="nový druh" onZmena={(k) => { setNovaIkona(k); setIkonaRucne(true); }} />
        </div>
        <label className="flex items-center gap-1.5 pb-2 text-xs text-ink-secondary">
          <input type="checkbox" name="chargedByDefault" /> přeúčtovat
        </label>
        <button type="submit" disabled={pending} className="btn btn-primary">Přidat druh</button>
      </form>
    </div>
  );
}
