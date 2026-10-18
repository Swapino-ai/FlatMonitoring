"use client";

import { useState, useTransition } from "react";
import { DRUHY_MERAKU, DRUH_MERAKU_MAP, type UdalostNajmu } from "@/lib/meraky";
import { pridejMerak, smazMerak, ulozStav, upravMerak, zmenDatumUdalosti } from "@/lib/merakyActions";
import { denISO } from "@/lib/format";

export interface MerakRadek { id: string; druh: string; nazev: string | null; cislo: string | null; aktivni: boolean }
export interface StavRadek { id: string; merakId: string; leaseId: string | null; udalost: string; datum: string; hodnota: number }

/** Radek protokolu: udalost najmu, nebo jiny odecet (dany dnem). */
interface Radek {
  klic: string;
  leaseId: string | null;
  udalost: "ZACATEK" | "KONEC" | "ODECET";
  datum: string | null;
  popis: string;
  budouci: boolean;
}

const BEZNE = ["ELEKTRINA", "PLYN", "VODA_STUDENA", "VODA_TEPLA"];
const cislo = (s: string) => {
  const t = s.replace(/[\s ]/g, "").replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};
const fmt = (n: number) => n.toLocaleString("cs-CZ", { maximumFractionDigits: 3 });

/**
 * Meraky nemovitosti a jejich stavy pri predani a vraceni bytu. Meraky se pridavaji
 * jednim kliknutim, stavy se pisou primo do tabulky a ukladaji se samy po opusteni policka.
 */
export function MerakyNemovitosti({ propertyId, canEdit, meraky, udalosti, stavy }: {
  propertyId: string;
  canEdit: boolean;
  meraky: MerakRadek[];
  udalosti: UdalostNajmu[];
  stavy: StavRadek[];
}) {
  const [, spust] = useTransition();
  const [chyba, setChyba] = useState<string | null>(null);
  // Stav bunky: ukladam / ulozeno / chyba (klic = radek|merak)
  const [bunky, setBunky] = useState<Record<string, "uklada" | "ok" | "chyba">>({});
  // Lokalni hodnoty (at je hned videt spotreba, nez se stranka obnovi)
  const [hodnoty, setHodnoty] = useState<Record<string, number | null>>({});
  const [datumy, setDatumy] = useState<Record<string, string>>({});
  const [noveOdecty, setNoveOdecty] = useState<string[]>([]);

  const zobrazene = meraky.filter((m) => m.aktivni || stavy.some((s) => s.merakId === m.id));
  const aktivni = meraky.filter((m) => m.aktivni);

  // Radky: udalosti najmu + jine odecty (po dnech) + nove pridane
  const odecty = [...new Set(stavy.filter((s) => s.udalost === "ODECET").map((s) => s.datum))];
  const radky: Radek[] = [
    ...noveOdecty.map((d) => ({ klic: `ODECET|${d}`, leaseId: null, udalost: "ODECET" as const, datum: d, popis: "Jiný odečet", budouci: false })),
    ...udalosti.map((u) => ({
      klic: `${u.udalost}|${u.leaseId}`, leaseId: u.leaseId, udalost: u.udalost,
      // Datum z ulozenych stavu (kdyz se predavalo jindy nez v den smlouvy), jinak ze smlouvy
      datum: stavy.find((s) => s.leaseId === u.leaseId && s.udalost === u.udalost)?.datum ?? u.datum,
      popis: `${u.udalost === "ZACATEK" ? "Předání" : "Vrácení"} · ${u.najemce}`, budouci: u.budouci,
    })),
    ...odecty.filter((d) => !noveOdecty.includes(d)).map((d) => ({ klic: `ODECET|${d}`, leaseId: null, udalost: "ODECET" as const, datum: d, popis: "Jiný odečet", budouci: false })),
  ].sort((a, b) => (b.datum ?? "9999").localeCompare(a.datum ?? "9999"));

  const stav = (r: Radek, merakId: string) => stavy.find((s) => s.merakId === merakId && s.udalost === r.udalost
    && (r.leaseId ? s.leaseId === r.leaseId : s.leaseId == null && s.datum === r.datum));
  const hodnota = (r: Radek, merakId: string): number | null => {
    const k = `${r.klic}|${merakId}`;
    return k in hodnoty ? hodnoty[k] : stav(r, merakId)?.hodnota ?? null;
  };
  const datumRadku = (r: Radek) => datumy[r.klic] ?? r.datum ?? "";

  const uloz = (r: Radek, merakId: string, text: string) => {
    const k = `${r.klic}|${merakId}`;
    const n = cislo(text);
    if (Number.isNaN(n)) { setBunky((b) => ({ ...b, [k]: "chyba" })); return; }
    if (n === hodnota(r, merakId)) return;
    const datum = datumRadku(r);
    if (!datum) { setChyba("Nejdřív vyplň datum v řádku."); return; }
    setHodnoty((h) => ({ ...h, [k]: n }));
    setBunky((b) => ({ ...b, [k]: "uklada" }));
    spust(async () => {
      const v = await ulozStav(propertyId, { merakId, leaseId: r.leaseId, udalost: r.udalost, datum, hodnota: n });
      setBunky((b) => ({ ...b, [k]: v.error ? "chyba" : "ok" }));
      setChyba(v.error ?? null);
    });
  };

  const zmenDatum = (r: Radek, datum: string) => {
    const puvodni = datumRadku(r);
    setDatumy((d) => ({ ...d, [r.klic]: datum }));
    if (!datum || datum === puvodni) return;
    const maStavy = zobrazene.some((m) => hodnota(r, m.id) != null);
    if (!maStavy) return;
    spust(async () => {
      const v = await zmenDatumUdalosti(propertyId, { leaseId: r.leaseId, udalost: r.udalost, puvodni, datum });
      setChyba(v.error ?? null);
    });
  };

  // Spotreba za najem: vraceni minus predani teze smlouvy
  const spotreba = (r: Radek, merakId: string) => {
    if (r.udalost !== "KONEC" || !r.leaseId) return null;
    const konec = hodnota(r, merakId);
    const zacatek = radky.find((x) => x.udalost === "ZACATEK" && x.leaseId === r.leaseId);
    const z = zacatek ? hodnota(zacatek, merakId) : null;
    return konec != null && z != null ? konec - z : null;
  };

  const pridej = (druhy: string[]) => spust(async () => {
    for (const d of druhy) {
      const v = await pridejMerak(propertyId, d);
      if (v.error) { setChyba(v.error); return; }
    }
  });

  return (
    <div className="space-y-5">
      {chyba && <div className="rounded-lg border border-bad/40 bg-bad/5 px-3 py-2 text-sm text-bad">{chyba}</div>}

      {/* Meraky */}
      <section className="card p-5">
        <h2 className="text-base font-semibold">Měřáky v bytě</h2>
        {aktivni.length === 0 && <p className="mt-1 text-sm text-ink-secondary">Zatím žádné. Přidej je kliknutím níž, potom zapisuj stavy do tabulky.</p>}
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {aktivni.map((m) => {
            const d = DRUH_MERAKU_MAP.get(m.druh);
            return (
              <div key={m.id} className="rounded-xl border border-line p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{d?.ikona} {d?.nazev ?? m.druh} <span className="text-xs font-normal text-ink-muted">({d?.jednotka})</span></span>
                  {canEdit && (
                    <button type="button" className="text-xs text-ink-muted hover:text-bad" title="Odebrat měřák (se zapsanými stavy zůstane v historii)"
                      onClick={() => { if (confirm(`Odebrat měřák ${d?.nazev ?? ""}?`)) spust(async () => { await smazMerak(m.id); }); }}>✕</button>
                  )}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <input className="input py-1 text-sm" placeholder="Upřesnění (Kuchyň…)" defaultValue={m.nazev ?? ""} disabled={!canEdit}
                    onBlur={(e) => e.target.value !== (m.nazev ?? "") && spust(async () => { await upravMerak(m.id, { nazev: e.target.value }); })} />
                  <input className="input py-1 text-sm" placeholder="Výrobní číslo" defaultValue={m.cislo ?? ""} disabled={!canEdit}
                    onBlur={(e) => e.target.value !== (m.cislo ?? "") && spust(async () => { await upravMerak(m.id, { cislo: e.target.value }); })} />
                </div>
              </div>
            );
          })}
        </div>
        {canEdit && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-sm text-ink-muted">Přidat:</span>
            {aktivni.length === 0 && (
              <button type="button" className="btn btn-primary py-1.5 text-sm" onClick={() => pridej(BEZNE)}>
                + Běžné (elektřina, plyn, studená a teplá voda)
              </button>
            )}
            {DRUHY_MERAKU.map((d) => (
              <button key={d.klic} type="button" className="btn py-1.5 text-sm" onClick={() => pridej([d.klic])}>+ {d.ikona} {d.nazev}</button>
            ))}
          </div>
        )}
      </section>

      {/* Stavy */}
      {zobrazene.length > 0 && (
        <section className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold">Stavy při předání a vrácení</h2>
              <p className="text-xs text-ink-muted">Řádky vznikají samy z nájemních smluv. Napiš číslo a klikni jinam — uloží se samo. Stav při vrácení se ve stejný den propíše i k předání dalšímu nájemci.</p>
            </div>
            {canEdit && (
              <button type="button" className="btn py-1.5 text-sm" onClick={() => setNoveOdecty((o) => [denISO(new Date()), ...o.filter((d) => d !== denISO(new Date()))])}>+ Jiný odečet</button>
            )}
          </div>
          {radky.length === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">Nemovitost zatím nemá nájemní smlouvu. Až ji přidáš, objeví se tu řádek pro předání bytu.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-max text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
                    <th className="py-2 pr-3 font-medium">Událost</th>
                    {zobrazene.map((m) => {
                      const d = DRUH_MERAKU_MAP.get(m.druh);
                      return (
                        <th key={m.id} className={`px-2 py-2 font-medium ${m.aktivni ? "" : "opacity-60"}`}>
                          {d?.ikona} {d?.nazev}{m.nazev ? ` · ${m.nazev}` : ""}
                          <div className="font-normal normal-case">{d?.jednotka}{m.cislo ? ` · č. ${m.cislo}` : ""}{m.aktivni ? "" : " · vyřazený"}</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {radky.map((r) => {
                    const chybi = !r.budouci && zobrazene.some((m) => m.aktivni && hodnota(r, m.id) == null);
                    return (
                      <tr key={r.klic} className={`border-b border-line/60 align-top ${r.budouci ? "opacity-60" : ""} ${chybi ? "bg-warn/5" : ""}`}>
                        <td className="py-2 pr-3">
                          <div className={`font-medium ${r.udalost === "ZACATEK" ? "text-good" : r.udalost === "KONEC" ? "text-bad" : ""}`}>{r.popis}</div>
                          <input type="date" className="input mt-1 w-36 py-0.5 text-xs" value={datumRadku(r)} disabled={!canEdit}
                            onChange={(e) => zmenDatum(r, e.target.value)} />
                          {r.budouci && <div className="text-xs text-ink-muted">plánováno</div>}
                          {chybi && <div className="text-xs text-warn">chybí stavy</div>}
                        </td>
                        {zobrazene.map((m) => {
                          const k = `${r.klic}|${m.id}`;
                          const h = hodnota(r, m.id);
                          const sp = spotreba(r, m.id);
                          const b = bunky[k];
                          return (
                            <td key={m.id} className="px-2 py-2">
                              <input key={`${k}|${h ?? ""}`} inputMode="decimal" defaultValue={h != null ? fmt(h) : ""} disabled={!canEdit || (!m.aktivni && h == null)}
                                placeholder="—"
                                className={`input w-28 py-1 text-right tabular-nums ${b === "chyba" ? "border-bad" : b === "ok" ? "border-good" : ""}`}
                                onBlur={(e) => uloz(r, m.id, e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
                              <div className="h-4 text-[11px] text-ink-muted">
                                {b === "uklada" ? "ukládám…" : b === "chyba" ? <span className="text-bad">neuloženo</span> : sp != null ? `spotřeba ${fmt(sp)} ${DRUH_MERAKU_MAP.get(m.druh)?.jednotka ?? ""}` : b === "ok" ? "✓ uloženo" : ""}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {radky.some((r) => r.udalost !== "ODECET") && (
            <p className="mt-2 text-xs text-ink-muted">Navazující smlouvy téhož nájemníka (prodloužení) se nepředávají, takže u nich řádek není.</p>
          )}
        </section>
      )}
    </div>
  );
}
