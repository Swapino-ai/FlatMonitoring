"use client";

import { useState, useTransition } from "react";
import {
  dohledejKatastr, ulozOdkazNahlizeni, vyberJednotku, zjistiKvotu, type KatastrStav,
} from "@/lib/katastrActions";
import { Hlaska } from "./form";

/** Zkopiruje hodnotu, at se do Nahlizeni neprepisuje rucne. */
function Zkopirovat({ hodnota }: { hodnota: string }) {
  const [hotovo, setHotovo] = useState(false);
  return (
    <button
      type="button"
      className="ml-2 text-xs text-accent hover:underline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(hodnota);
          setHotovo(true);
          setTimeout(() => setHotovo(false), 1500);
        } catch {
          // Bez pristupu do schranky (starsi prohlizec, http) zbyva oznacit rucne
          setHotovo(false);
        }
      }}
    >
      {hotovo ? "zkopírováno" : "kopírovat"}
    </button>
  );
}

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
  nahlizeniOdkaz: string | null;
  nactenoKdy: Date;
}

/**
 * Primy odkaz do Nahlizeni do KN.
 *
 * Nova aplikace (cesty /VyberBudovu/…) prime odkazy neumi — vyhledavani je
 * POST s tokeny vazanymi na relaci. Stara adresa ZobrazObjekt.aspx ale funguje
 * dodnes a bere identifikator primo z API katastru. Overeno merenim.
 */
function odkazNaJednotku(id: number) {
  return `https://nahlizenidokn.cuzk.gov.cz/ZobrazObjekt.aspx?typ=jednotka&id=${id}`;
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
  // Vybrana jednotka nese id z katastru, pres ktere jde otevrit primo v Nahlizeni
  const mojeJednotka = data?.jednotky.find((j) => j.popis === data.cisloJednotky) ?? null;
  // U jednotky si odkaz slozime, u stavby ho musel uzivatel jednou vlozit
  const odkaz = mojeJednotka ? odkazNaJednotku(mojeJednotka.id) : data?.nahlizeniOdkaz ?? null;
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
              <Radek label="List vlastnictví" value={data.lvCislo != null ? `LV ${data.lvCislo}` : "—"} zvyraznit
                kopie={data.lvCislo != null ? String(data.lvCislo) : undefined} />
              <Radek label="Katastrální území"
                value={data.katastralniUzemiNazev
                  ? `${data.katastralniUzemiNazev}${data.katastralniUzemiKod ? ` (${data.katastralniUzemiKod})` : ""}`
                  : "—"}
                kopie={data.katastralniUzemiKod != null ? String(data.katastralniUzemiKod) : undefined} />
              <Radek label="Parcela" value={data.parcely ?? "—"} kopie={data.parcely ?? undefined} />
              <Radek label="Stavba" value={[
                data.typStavby,
                data.cisloDomovni != null ? `č. p. ${data.cisloDomovni}` : null,
              ].filter(Boolean).join(" · ") || "—"} />
              <Radek label="Způsob využití" value={data.zpusobVyuziti ?? "—"} />
              <Radek label="Obec a část" value={[data.obecNazev, data.castObceNazev].filter(Boolean).join(" · ") || "—"} />
              {data.zpusobyOchrany && <Radek label="Ochrana" value={data.zpusobyOchrany} />}
            </tbody>
          </table>

          {odkaz && (
            <a href={odkaz} target="_blank" rel="noreferrer noopener"
              className="btn btn-primary mt-4 w-full justify-center sm:w-auto">
              {mojeJednotka
                ? `Otevřít jednotku ${mojeJednotka.popis} v Nahlížení do KN →`
                : "Otevřít v Nahlížení do KN →"}
            </a>
          )}

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
                vyber ji a bude u nemovitosti uložená. Pak se nad výběrem objeví odkaz,
                který ji v Nahlížení otevře rovnou.
              </p>
            </div>
          )}

          <div className="mt-3 space-y-1.5 text-xs text-ink-muted">
            <p>Načteno {new Date(data.nactenoKdy).toLocaleString("cs-CZ")}.</p>
            <p>
              Vlastníka Nahlížení ukáže po přihlášení Identitou občana — zdarma,
              rovnou na otevřené stránce jednotky. V bezplatném API katastru
              vlastníci nejsou, ti jsou jen v placeném dálkovém přístupu.
            </p>
            <p>
              Změny u svých nemovitostí si můžeš nechat hlídat zdarma službou{" "}
              <a href="https://portal.gov.cz/sluzby-vs/zrizeni-sluzby-sledovani-zmen-v-katastru-nemovitosti-S8171"
                target="_blank" rel="noreferrer noopener" className="text-accent">Sledování změn</a>.
            </p>
          </div>
        </>
      ) : (
        <p className="rounded-lg bg-surface-sunken px-3 py-2.5 text-sm text-ink-secondary">
          Údaje z katastru zatím nejsou načtené. Hledá se podle adresy {adresa} —
          číslo popisné z ní musí sedět, jinak katastr nic nenajde.
        </p>
      )}

      {canEdit && data && !mojeJednotka && <RucniOdkaz propertyId={propertyId} odkaz={data.nahlizeniOdkaz} />}

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

function Radek({ label, value, zvyraznit, kopie }: {
  label: string; value: string; zvyraznit?: boolean; kopie?: string;
}) {
  return (
    <tr>
      <td className="text-ink-secondary">{label}</td>
      <td className={zvyraznit ? "font-medium" : ""}>
        {value}
        {kopie && value !== "—" && <Zkopirovat hodnota={kopie} />}
      </td>
    </tr>
  );
}

/**
 * Rucne vlozeny odkaz do Nahlizeni.
 *
 * U bytu se odkaz sklada z identifikatoru jednotky. U stavby — garaze, domu —
 * pouziva Nahlizeni sifrovany token, ktery zvenku sestavit nejde. Vlozit ho
 * jednou je porad lepsi nez ho pokazde hledat znovu.
 */
function RucniOdkaz({ propertyId, odkaz }: { propertyId: string; odkaz: string | null }) {
  const [hodnota, setHodnota] = useState(odkaz ?? "");
  const [stav, setStav] = useState<KatastrStav>({});
  const [bezi, start] = useTransition();

  return (
    <div className="mt-4 border-t border-line pt-3">
      <label className="label mb-1.5 block" htmlFor="nahlizeni">Odkaz do Nahlížení</label>
      <div className="flex flex-wrap gap-2">
        <input
          id="nahlizeni"
          className="input min-w-0 flex-1"
          value={hodnota}
          placeholder="https://nahlizenidokn.cuzk.gov.cz/ZobrazObjekt.aspx?encrypted=…"
          onChange={(e) => setHodnota(e.target.value)}
        />
        <button type="button" className="btn" disabled={bezi}
          onClick={() => start(async () => setStav(await ulozOdkazNahlizeni(propertyId, hodnota)))}>
          {bezi ? "Ukládám…" : "Uložit"}
        </button>
      </div>
      <p className="mt-1 text-xs text-ink-muted">
        U staveb Nahlížení místo čísla používá zašifrovaný token, který zvenku sestavit nejde.
        Najdi stavbu jednou v Nahlížení, zkopíruj adresu z prohlížeče a vlož ji sem — pak už
        stačí klikat.
      </p>
      {(stav.error || stav.success) && (
        <p className={`mt-2 text-xs ${stav.error ? "text-bad" : "text-good"}`}>
          {stav.error ?? stav.success}
        </p>
      )}
    </div>
  );
}
