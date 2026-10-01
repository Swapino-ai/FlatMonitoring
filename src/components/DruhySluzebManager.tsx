"use client";

import { useActionState, useState, useTransition } from "react";
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
          <li key={key} className="px-3 py-2.5">
            <form action={action} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="key" value={key} />
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                <Ikona nazev={t.icon as NazevIkony} trida="h-4 w-4" />
              </span>
              <input name="name" defaultValue={t.name} required aria-label="Název druhu" className="input min-w-[10rem] flex-1 py-1.5" />
              <select name="icon" defaultValue={t.icon} aria-label="Ikona" className="input w-[9rem] py-1.5">
                {IKONY.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
              </select>
              <label className="flex items-center gap-1.5 text-xs text-ink-secondary" title="Nová služba tohoto druhu se předvyplní jako přeúčtovaná nájemci">
                <input type="checkbox" name="chargedByDefault" defaultChecked={t.chargedByDefault} />
                přeúčtovat
              </label>
              <button type="submit" disabled={pending} className="btn px-2.5 py-1 text-xs">Uložit</button>
              <span className="text-xs text-ink-muted">{pouziti[key] ?? 0}×</span>
              {(pouziti[key] ?? 0) === 0 && (
                <SmazatTlacitko action={delAction} id={key} potvrzeni={`Smazat druh „${t.name}“?`} />
              )}
            </form>
          </li>
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
        <select name="icon" value={novaIkona} onChange={(e) => { setNovaIkona(e.target.value); setIkonaRucne(true); }}
          aria-label="Ikona nového druhu" className="input w-[9rem]">
          {IKONY.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
        </select>
        <label className="flex items-center gap-1.5 pb-2 text-xs text-ink-secondary">
          <input type="checkbox" name="chargedByDefault" /> přeúčtovat
        </label>
        <button type="submit" disabled={pending} className="btn btn-primary">Přidat druh</button>
      </form>
    </div>
  );
}
