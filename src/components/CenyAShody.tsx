"use client";

import { useState } from "react";
import { czk, dateCz } from "@/lib/format";

export interface ShodaRadku {
  id: string;
  /** NAVRH | POTVRZENO */
  stav: string;
  skore: number;
  duvod: string;
  /** Jiny inzerat je starsi (true), nebo novejsi (false) */
  drivejsi: boolean;
  jiny: { url: string | null; najem: boolean; price: number; od: string; do: string; zmizel: boolean; ceny: { at: string; price: number }[] };
}

const platnyOdkaz = (u: string | null) => !!u && !u.includes("/x/x/");

/**
 * Historie ceny inzeratu (vyrazne, kdyz se cena zmenila) a stejny byt v jinych inzeratech:
 * navrhy ke schvaleni a potvrzene drivejsi nabidky.
 */
export function CenyAShody({ ceny, najem, shody = [], canEdit, onRozhodni }: {
  ceny: { at: string; price: number }[];
  najem: boolean;
  shody?: ShodaRadku[];
  canEdit: boolean;
  onRozhodni: (shodaId: string, stejny: boolean) => void;
}) {
  const [historie, setHistorie] = useState(false);
  // Rozhodnuti se ukaze hned (server pak stranku obnovi)
  const [rozhodnute, setRozhodnute] = useState<Record<string, boolean>>({});
  const rozhodni = (id: string, stejny: boolean) => { setRozhodnute((r) => ({ ...r, [id]: stejny })); onRozhodni(id, stejny); };
  const viditelne = shody.filter((s) => rozhodnute[s.id] !== false).map((s) => (rozhodnute[s.id] ? { ...s, stav: "POTVRZENO" } : s));
  const cena = (n: number) => (najem ? `${czk(n)}/měs.` : czk(n));
  const posledni = ceny[ceny.length - 1];
  const predchozi = ceny.length > 1 ? ceny[ceny.length - 2] : null;
  const zmena = posledni && predchozi ? posledni.price - predchozi.price : 0;
  const celkem = posledni && ceny.length > 1 ? ((posledni.price - ceny[0].price) / ceny[0].price) * 100 : 0;

  return (
    <div className="space-y-1.5">
      {predchozi && posledni && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button type="button" onClick={() => setHistorie((x) => !x)}
            className={`rounded-full px-2.5 py-0.5 font-semibold ${zmena < 0 ? "bg-good/15 text-good" : "bg-bad/15 text-bad"}`}
            title="Zobrazit historii ceny">
            {zmena < 0 ? "▼ Zlevněno" : "▲ Zdraženo"} {dateCz(posledni.at)}: {zmena > 0 ? "+" : ""}{czk(zmena)}
            {ceny.length > 2 && <> · celkem {celkem > 0 ? "+" : ""}{celkem.toFixed(1).replace(".", ",")} %</>}
          </button>
          <button type="button" onClick={() => setHistorie((x) => !x)} className="text-accent hover:underline">
            {historie ? "skrýt historii" : `historie ceny (${ceny.length})`}
          </button>
        </div>
      )}
      {historie && (
        <ol className="ml-1 border-l-2 border-line pl-3 text-xs tabular-nums text-ink-secondary">
          {ceny.map((c, k) => (
            <li key={k}>{dateCz(c.at)} — <strong className="text-ink-primary">{cena(c.price)}</strong>
              {k > 0 && <span className={c.price < ceny[k - 1].price ? "text-good" : "text-bad"}> ({c.price > ceny[k - 1].price ? "+" : ""}{czk(c.price - ceny[k - 1].price)})</span>}
            </li>
          ))}
        </ol>
      )}

      {viditelne.map((s) => {
        const j = s.jiny;
        const popis = <>{s.drivejsi ? "dřívější smazaný inzerát, který byl v odhadu," : "novější inzerát"} {j.najem ? "(pronájem)" : ""} {dateCz(j.od)}–{j.zmizel ? dateCz(j.do) : "dosud"}: <strong>{j.najem ? `${czk(j.price)}/měs.` : czk(j.price)}</strong>
          {j.ceny.length > 1 && <> (začínal na {j.najem ? `${czk(j.ceny[0].price)}/měs.` : czk(j.ceny[0].price)})</>}</>;
        return s.stav === "NAVRH" ? (
          <div key={s.id} className="rounded-lg border border-warn/40 bg-warn/10 px-2.5 py-1.5 text-xs">
            <div>
              <strong>Možná stejný byt</strong> — {popis}
              {platnyOdkaz(j.url) && <> · <a href={j.url!} target="_blank" rel="noreferrer noopener" className="text-accent hover:underline">inzerát ↗</a></>}
            </div>
            <div className="mt-0.5 text-ink-muted">Shoda {s.skore} %: {s.duvod}</div>
            {canEdit && (
              <div className="mt-1 flex gap-1.5">
                <button type="button" className="btn px-2 py-0.5 text-xs" onClick={() => rozhodni(s.id, true)}>Ano, stejný byt</button>
                <button type="button" className="btn px-2 py-0.5 text-xs" onClick={() => rozhodni(s.id, false)}>Ne, jiný</button>
              </div>
            )}
          </div>
        ) : (
          <div key={s.id} className="rounded-lg bg-surface-sunken px-2.5 py-1.5 text-xs">
            <strong>Stejný byt</strong> — {popis}
            {platnyOdkaz(j.url) && <> · <a href={j.url!} target="_blank" rel="noreferrer noopener" className="text-accent hover:underline">inzerát ↗</a></>}
            {canEdit && <button type="button" className="ml-2 text-ink-muted hover:text-bad" onClick={() => rozhodni(s.id, false)} title="Zrušit propojení">zrušit</button>}
          </div>
        );
      })}
    </div>
  );
}
