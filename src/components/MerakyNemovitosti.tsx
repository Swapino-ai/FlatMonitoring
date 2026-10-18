"use client";

import { useState, useTransition } from "react";
import { DRUHY_MERAKU, DRUH_MERAKU_MAP, type UdalostNajmu } from "@/lib/meraky";
import { pridejMerak, smazMerak, ulozStav, upravMerak, zmenDatumUdalosti } from "@/lib/merakyActions";
import { denISO } from "@/lib/format";
import { DatumPole } from "./DatumPole";
import { Ikona, type NazevIkony } from "./Ikony";
import { Badge, Card } from "./Stat";

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

  const ikona = (druh: string, trida = "h-9 w-9") => (
    <span className={`flex ${trida} shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent`}>
      <Ikona nazev={(DRUH_MERAKU_MAP.get(druh)?.ikona ?? "tri") as NazevIkony} />
    </span>
  );

  return (
    <div className="space-y-5">
      {chyba && <div className="rounded-lg border border-bad/40 bg-bad/5 px-3 py-2 text-sm text-bad">{chyba}</div>}

      <Card title="Měřáky">
        {aktivni.length === 0 ? (
          <p className="py-3 text-center text-sm text-ink-muted">Žádné evidované měřáky.</p>
        ) : (
          <div className="table-scroll">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Měřák</th>
                  <th>Upřesnění</th>
                  <th>Výrobní číslo</th>
                  {canEdit && <th className="w-12"><span className="sr-only">Akce</span></th>}
                </tr>
              </thead>
              <tbody>
                {aktivni.map((m) => {
                  const d = DRUH_MERAKU_MAP.get(m.druh);
                  return (
                    <tr key={m.id}>
                      <td>
                        <div className="flex items-center gap-3">
                          {ikona(m.druh)}
                          <div>
                            <div className="font-medium leading-tight">{d?.nazev ?? m.druh}</div>
                            <div className="text-xs text-ink-muted">{d?.jednotka}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <input className="input max-w-[14rem] py-1.5" placeholder="např. Kuchyň" defaultValue={m.nazev ?? ""} disabled={!canEdit}
                          onBlur={(e) => e.target.value !== (m.nazev ?? "") && spust(async () => { await upravMerak(m.id, { nazev: e.target.value }); })} />
                      </td>
                      <td>
                        <input className="input max-w-[14rem] py-1.5" placeholder="nepovinné" defaultValue={m.cislo ?? ""} disabled={!canEdit}
                          onBlur={(e) => e.target.value !== (m.cislo ?? "") && spust(async () => { await upravMerak(m.id, { cislo: e.target.value }); })} />
                      </td>
                      {canEdit && (
                        <td className="text-right">
                          <button type="button" className="text-ink-muted hover:text-bad" aria-label="Odebrat měřák"
                            title="Odebrat měřák (se zapsanými stavy zůstane v historii)"
                            onClick={() => { if (confirm(`Odebrat měřák ${d?.nazev ?? ""}?`)) spust(async () => { await smazMerak(m.id); }); }}>
                            <Ikona nazev="kos" trida="h-4 w-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {canEdit && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <span className="label mr-1">Přidat měřák</span>
            {aktivni.length === 0 && (
              <button type="button" className="btn btn-primary" onClick={() => pridej(BEZNE)}>Elektřina, plyn a voda najednou</button>
            )}
            {DRUHY_MERAKU.map((d) => (
              <button key={d.klic} type="button" className="btn inline-flex items-center gap-1.5" onClick={() => pridej([d.klic])}>
                <Ikona nazev={d.ikona as NazevIkony} trida="h-4 w-4" />{d.nazev}
              </button>
            ))}
          </div>
        )}
      </Card>

      {zobrazene.length > 0 && (
        <Card title="Stavy při předání a vrácení" action={canEdit ? (
          <button type="button" className="btn" onClick={() => setNoveOdecty((o) => [denISO(new Date()), ...o.filter((d) => d !== denISO(new Date()))])}>Jiný odečet</button>
        ) : undefined}>
          <p className="-mt-2 mb-3 text-xs text-ink-muted">
            Řádky vznikají z nájemních smluv. Hodnota se uloží po opuštění políčka; stav při vrácení se ve stejný den doplní i k předání dalšímu nájemci.
            Prodloužení smlouvy téhož nájemníka se nepředává, takže řádek nemá.
          </p>
          {radky.length === 0 ? (
            <p className="py-3 text-center text-sm text-ink-muted">Nemovitost zatím nemá nájemní smlouvu.</p>
          ) : (
            <div className="table-scroll">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Událost</th>
                    {zobrazene.map((m) => {
                      const d = DRUH_MERAKU_MAP.get(m.druh);
                      return (
                        <th key={m.id} className={`num ${m.aktivni ? "" : "opacity-60"}`}>
                          <span className="inline-flex items-center gap-1.5"><Ikona nazev={(d?.ikona ?? "tri") as NazevIkony} trida="h-3.5 w-3.5" />{d?.nazev}{m.nazev ? ` · ${m.nazev}` : ""}</span>
                          <div className="font-normal normal-case tracking-normal">{d?.jednotka}{m.cislo ? ` · č. ${m.cislo}` : ""}{m.aktivni ? "" : " · vyřazený"}</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {radky.map((r) => {
                    const chybi = !r.budouci && zobrazene.some((m) => m.aktivni && hodnota(r, m.id) == null);
                    return (
                      <tr key={r.klic} className={r.budouci ? "opacity-60" : ""}>
                        <td className="align-top">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{r.udalost === "ZACATEK" ? "Předání" : r.udalost === "KONEC" ? "Vrácení" : "Jiný odečet"}</span>
                            {r.budouci && <Badge>plánováno</Badge>}
                            {chybi && <Badge tone="warn">chybí stavy</Badge>}
                          </div>
                          {r.udalost !== "ODECET" && <div className="text-xs text-ink-muted">{r.popis.split(" · ").slice(1).join(" · ")}</div>}
                          <div className="mt-1.5 w-36">
                            <DatumPole label="Datum" skrytLabel name={`datum-${r.klic}`} defaultValue={datumRadku(r)}
                              onChange={(iso) => { if (iso && canEdit) zmenDatum(r, iso); }} />
                          </div>
                        </td>
                        {zobrazene.map((m) => {
                          const k = `${r.klic}|${m.id}`;
                          const h = hodnota(r, m.id);
                          const sp = spotreba(r, m.id);
                          const b = bunky[k];
                          return (
                            <td key={m.id} className="num align-top">
                              <input key={`${k}|${h ?? ""}`} inputMode="decimal" defaultValue={h != null ? fmt(h) : ""} disabled={!canEdit || (!m.aktivni && h == null)}
                                aria-label={`${DRUH_MERAKU_MAP.get(m.druh)?.nazev ?? ""} — ${r.popis}`}
                                className={`input ml-auto w-32 py-1.5 text-right tabular-nums ${b === "chyba" ? "!border-bad" : ""}`}
                                onBlur={(e) => uloz(r, m.id, e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
                              <div className="mt-1 h-4 text-xs text-ink-muted">
                                {b === "uklada" ? "ukládám…" : b === "chyba" ? <span className="text-bad">neuloženo</span> : sp != null ? `spotřeba ${fmt(sp)} ${DRUH_MERAKU_MAP.get(m.druh)?.jednotka ?? ""}` : b === "ok" ? <span className="text-good">uloženo</span> : ""}
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
        </Card>
      )}
    </div>
  );
}
