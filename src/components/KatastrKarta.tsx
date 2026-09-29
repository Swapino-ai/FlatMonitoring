"use client";

import { useState, useTransition } from "react";
import { dohledejKatastr, vyberJednotku, zjistiKvotu, type KatastrStav } from "@/lib/katastrActions";
import { Hlaska } from "./form";

export interface JednotkaVolba {
  id: number;
  cislo: number;
  popis: string;
}

export interface KatastrData {
  obecNazev: string | null;
  castObceNazev: string | null;
  katastralniUzemiKod: number | null;
  katastralniUzemiNazev: string | null;
  lvCislo: number | null;
  typStavby: string | null;
  cisloDomovni: number | null;
  zpusobVyuziti: string | null;
  zpusobyOchrany: string | null;
  parcely: string | null;
  jednotky: JednotkaVolba[];
  cisloJednotky: string | null;
  nactenoKdy: Date;
}

/**
 * Udaje z katastru k jedne nemovitosti.
 *
 * Nacita se na tlacitko, ne samo: API ma kvotu 500 dotazu za obdobi a katastr
 * se meni zridka, takze se drzi ulozene a obnovuje, kdyz clovek chce.
 */
export function KatastrKarta({ propertyId, data, canEdit, adresa }: {
  propertyId: string;
  data: KatastrData | null;
  canEdit: boolean;
  adresa: string;
}) {
  const [stav, setStav] = useState<KatastrStav>({});
  const [kvota, setKvota] = useState<{ text: string; varovat: boolean } | null>(null);
  const [bezi, start] = useTransition();

  function nacti() {
    start(async () => {
      setStav(await dohledejKatastr(propertyId));
      setKvota(await zjistiKvotu());
    });
  }

  function zmenJednotku(cislo: string) {
    start(async () => setStav(await vyberJednotku(propertyId, cislo)));
  }

  return (
    <div>
      <Hlaska state={stav} />

      {data ? (
        <>
          <table className="table-base">
            <tbody>
              <Radek label="List vlastnictví" value={data.lvCislo != null ? `LV ${data.lvCislo}` : "—"} zvyraznit />
              <Radek label="Katastrální území"
                value={data.katastralniUzemiNazev
                  ? `${data.katastralniUzemiNazev}${data.katastralniUzemiKod ? ` (${data.katastralniUzemiKod})` : ""}`
                  : "—"} />
              <Radek label="Parcela" value={data.parcely ?? "—"} />
              <Radek label="Stavba" value={[
                data.typStavby,
                data.cisloDomovni != null ? `č. p. ${data.cisloDomovni}` : null,
              ].filter(Boolean).join(" · ") || "—"} />
              <Radek label="Způsob využití" value={data.zpusobVyuziti ?? "—"} />
              <Radek label="Obec a část" value={[data.obecNazev, data.castObceNazev].filter(Boolean).join(" · ") || "—"} />
              {data.zpusobyOchrany && <Radek label="Ochrana" value={data.zpusobyOchrany} />}
            </tbody>
          </table>

          {data.jednotky.length > 0 && (
            <div className="mt-4 border-t border-line pt-3">
              <label className="label mb-1.5 block" htmlFor="jednotka">Moje jednotka</label>
              <select
                id="jednotka"
                className="input"
                value={data.cisloJednotky ?? ""}
                disabled={!canEdit || bezi}
                onChange={(e) => zmenJednotku(e.target.value)}
              >
                <option value="">— nevybráno —</option>
                {data.jednotky.map((j) => (
                  <option key={j.id} value={j.popis}>{j.popis}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-ink-muted">
                V domě je {data.jednotky.length} jednotek. Která je tvoje, katastr z adresy nepozná —
                vyber ji a bude u nemovitosti uložená.
              </p>
            </div>
          )}

          <p className="mt-3 text-xs text-ink-muted">
            Načteno {new Date(data.nactenoKdy).toLocaleString("cs-CZ")}.
            {" "}Vlastníci a nabývací tituly v bezplatném API nejsou — ty jsou jen v placeném dálkovém přístupu.
          </p>
        </>
      ) : (
        <p className="rounded-lg bg-surface-sunken px-3 py-2.5 text-sm text-ink-secondary">
          Údaje z katastru zatím nejsou načtené. Hledá se podle adresy {adresa} —
          číslo popisné z ní musí sedět, jinak katastr nic nenajde.
        </p>
      )}

      {canEdit && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" className="btn" disabled={bezi} onClick={nacti}>
            {bezi ? "Dohledávám…" : data ? "Načíst znovu" : "Dohledat v katastru"}
          </button>
          {kvota && (
            <span className={`text-xs ${kvota.varovat ? "text-warn" : "text-ink-muted"}`}>{kvota.text}</span>
          )}
        </div>
      )}
    </div>
  );
}

function Radek({ label, value, zvyraznit }: { label: string; value: string; zvyraznit?: boolean }) {
  return (
    <tr>
      <td className="text-ink-secondary">{label}</td>
      <td className={zvyraznit ? "font-medium" : ""}>{value}</td>
    </tr>
  );
}
