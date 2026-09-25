"use client";

import { useState, useTransition } from "react";
import { uklidTrznichDat, type RozsahUklidu, type VysledekUklidu } from "@/lib/actions";

/**
 * Mazani dat z trhu.
 *
 * Nevratny zasah do ostrych dat, proto se potvrzuje opsanim slova — jedno
 * nechtene kliknuti nesmi zahodit historii odhadu. Ruční a znalecka oceneni
 * se nemazou nikdy; ta aplikace nevyrobila.
 */
export function UklidDat({ pocty }: {
  pocty: { oceneni: number; najmy: number; nabidky: number; skeny: number; rucni: number };
}) {
  const [rezim, setRezim] = useState<RozsahUklidu | null>(null);
  const [potvrzeni, setPotvrzeni] = useState("");
  const [vysledek, setVysledek] = useState<VysledekUklidu | null>(null);
  const [chyba, setChyba] = useState("");
  const [ceka, startTransition] = useTransition();

  const SLOVO = "SMAZAT";

  function spust() {
    if (!rezim || potvrzeni.trim().toUpperCase() !== SLOVO) return;
    setChyba("");
    startTransition(async () => {
      try {
        setVysledek(await uklidTrznichDat(rezim));
        setRezim(null);
        setPotvrzeni("");
      } catch (e) {
        setChyba(e instanceof Error ? e.message : "Úklid selhal");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="table-scroll">
        <table className="table-base">
          <tbody>
            <tr><td>Ocenění ze skenu</td><td className="num tabular-nums">{pocty.oceneni}</td></tr>
            <tr><td>Odhady nájmu ze skenu</td><td className="num tabular-nums">{pocty.najmy}</td></tr>
            <tr><td>Stažené nabídky</td><td className="num tabular-nums">{pocty.nabidky}</td></tr>
            <tr><td>Záznamy o skenech</td><td className="num tabular-nums">{pocty.skeny}</td></tr>
            <tr>
              <td className="text-ink-secondary">Ruční a znalecká ocenění</td>
              <td className="num tabular-nums text-ink-secondary">{pocty.rucni} — nemažou se</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <button type="button" onClick={() => { setRezim("nesouvisejici"); setVysledek(null); }}
          className={`btn ${rezim === "nesouvisejici" ? "border-accent text-accent" : ""}`}>
          Smazat nesouvisející
        </button>
        <button type="button" onClick={() => { setRezim("vse"); setVysledek(null); }}
          className={`btn ${rezim === "vse" ? "border-bad text-bad" : ""}`}>
          Smazat všechna data z trhu
        </button>
      </div>

      <p className="text-xs text-ink-muted">
        <strong>Nesouvisející</strong> nechá, co k něčemu patří: smaže nabídky z obcí, které sis
        u nemovitostí zakázal, nabídky v kategoriích, které už žádná nemovitost nemá, skeny
        bez nabídek a provozní deník starší 30 dnů.
        <br />
        <strong>Všechna data z trhu</strong> smažou i ocenění a odhady nájmu ze skenu. Hodí se,
        když se změnila pravidla srovnávání a stará čísla už jen matou — nové vzniknou při
        nejbližším skenu.
      </p>

      {rezim && (
        <div className={`rounded-card border p-4 ${rezim === "vse" ? "border-bad/40 bg-bad/5" : "border-accent/40 bg-accent/5"}`}>
          <p className="text-sm">
            {rezim === "vse"
              ? `Smaže se ${pocty.oceneni} ocenění, ${pocty.najmy} odhadů nájmu, ${pocty.nabidky} nabídek a ${pocty.skeny} skenů.`
              : "Smažou se jen nabídky a záznamy, které už do žádného odhadu nevstupují."}
            {" "}Vrátit to nejde — zálohu si stáhneš v Reportech.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="text-sm" htmlFor="potvrzeni">Napiš <strong>{SLOVO}</strong>:</label>
            <input id="potvrzeni" value={potvrzeni} onChange={(e) => setPotvrzeni(e.target.value)}
              className="input max-w-[10rem]" autoComplete="off" />
            <button type="button" onClick={spust}
              disabled={ceka || potvrzeni.trim().toUpperCase() !== SLOVO}
              className="btn btn-primary disabled:opacity-50">
              {ceka ? "Mažu…" : "Potvrdit smazání"}
            </button>
            <button type="button" onClick={() => { setRezim(null); setPotvrzeni(""); }} className="btn">
              Zrušit
            </button>
          </div>
        </div>
      )}

      {chyba && <p className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">{chyba}</p>}

      {vysledek && (
        <p className="rounded-lg bg-good/10 px-3 py-2.5 text-sm text-good">
          Smazáno: {vysledek.oceneni} ocenění, {vysledek.najmy} odhadů nájmu, {vysledek.nabidky} nabídek,
          {" "}{vysledek.skeny} skenů{vysledek.denik > 0 ? `, ${vysledek.denik} záznamů deníku` : ""}.
        </p>
      )}
    </div>
  );
}
