"use client";

import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import { DRUHY_MERAKU, DRUH_MERAKU_MAP, nulovaniMezi, nulovaniText, nulovaniZTextu, retezceMeraku, spotrebaVObdobi, type MerakSeStavy, type UdalostNajmu } from "@/lib/meraky";
import { nastavNulovaniRadiatoru, nastavSvjByt, synchronizujSvjTed, pridejMerak, smazMerak, ulozStav, upravMerak, vymenMerak, zmenDatumUdalosti } from "@/lib/merakyActions";
import { denISO } from "@/lib/format";
import { DatumPole } from "./DatumPole";
import { Ikona, type NazevIkony } from "./Ikony";
import { Badge } from "./Stat";
import { SbalitelnaKarta } from "./SbalitelnaKarta";

export interface MerakRadek {
  id: string; druh: string; nazev: string | null; cislo: string | null; aktivni: boolean; dvoutarif: boolean;
  /** Kazdorocni vynulovani "MM-DD" (radiatory) */
  nulovani?: string | null;
  /** Merak, ktery tento nahradil (vymena) */
  nahrazujeId: string | null;
  /** Den vymeny (u vymeneneho meraku) */
  vymenenAt: string | null;
}
export interface StavRadek { id: string; merakId: string; leaseId: string | null; udalost: string; datum: string; hodnota: number | null; hodnota2: number | null; zdroj?: string | null; vynulovanoPo?: boolean }

/** Stav napojeni meraku na Evidenci SVJ (z serveru). */
export interface SvjStav { posledni: { datum: string; t1: number | null; t2: number | null } | null; chyba: string | null; prevzato: number }

/** Ctene hodnoty meraku: dvoutarif T1 a T2, jinak jedna. */
const tarify = (m: MerakRadek): (1 | 2)[] => (m.dvoutarif ? [1, 2] : [1]);

/** Radek protokolu: udalost najmu, nebo prubezny odecet (dany dnem). */
interface Radek {
  klic: string;
  leaseId: string | null;
  udalost: "ZACATEK" | "KONEC" | "ODECET" | "VYMENA";
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
export function MerakyNemovitosti({ propertyId, canEdit, meraky, udalosti, stavy, svj = {}, svjNastaveno = false, svjByt = null, svjSyncAt = null }: {
  /** Kdy se naposledy prebiraly stavy ze SVJ (ISO) */
  svjSyncAt?: string | null;
  /** Cislo bytu v Evidenci SVJ (meraky se tam dohledaji podle vyrobniho cisla) */
  svjByt?: string | null;
  /** Vysledek prevzeti stavu z Evidence SVJ podle meraku */
  svj?: Record<string, SvjStav>;
  /** Je na serveru nastavena adresa a klic SVJ? */
  svjNastaveno?: boolean;
  propertyId: string;
  canEdit: boolean;
  meraky: MerakRadek[];
  udalosti: UdalostNajmu[];
  stavy: StavRadek[];
}) {
  const [, spust] = useTransition();
  const [chyba, setChyba] = useState<string | null>(null);
  const [synchronizuji, synchronizuj] = useTransition();
  const [svjHlaska, setSvjHlaska] = useState<string | null>(null);
  // Stav bunky: ukladam / ulozeno / chyba (klic = radek|merak)
  const [bunky, setBunky] = useState<Record<string, "uklada" | "ok" | "chyba">>({});
  // Lokalni hodnoty (at je hned videt spotreba, nez se stranka obnovi)
  const [hodnoty, setHodnoty] = useState<Record<string, number | null>>({});
  const [datumy, setDatumy] = useState<Record<string, string>>({});
  const [noveOdecty, setNoveOdecty] = useState<string[]>([]);
  // Radky otevrene k uprave tuzkou (radky s chybejicimi stavy jsou otevrene samy)
  // Radek otevreny k zapisu (formular nad historii); po otevreni na nej stranka sjede
  const [vybrany, setVybrany] = useState<string | null>(null);
  const [posun, setPosun] = useState(0);
  const formular = useRef<HTMLDivElement>(null);
  const otevri = (klic: string) => { setVybrany(klic); setPosun((n) => n + 1); };
  useEffect(() => {
    if (!posun || !formular.current) return;
    formular.current.scrollIntoView({ behavior: "smooth", block: "start" });
    // Kurzor do prvniho prazdneho policka (jinak do prvniho)
    const pole = Array.from(formular.current.querySelectorAll<HTMLInputElement>("input[inputmode=decimal]"));
    (pole.find((x) => !x.value) ?? pole[0])?.focus({ preventScroll: true });
  }, [posun]);

  const zobrazene = meraky.filter((m) => m.aktivni || stavy.some((s) => s.merakId === m.id));
  const aktivni = meraky.filter((m) => m.aktivni);

  // Radky: udalosti najmu + jine odecty (po dnech) + nove pridane
  const odecty = [...new Set(stavy.filter((s) => s.udalost === "ODECET").map((s) => s.datum))];
  const vymeny = [...new Set(stavy.filter((s) => s.udalost === "VYMENA").map((s) => s.datum))];
  const radky: Radek[] = [
    ...noveOdecty.map((d) => ({ klic: `ODECET|${d}`, leaseId: null, udalost: "ODECET" as const, datum: d, popis: "Průběžný odečet", budouci: false })),
    ...udalosti.map((u) => ({
      klic: `${u.udalost}|${u.leaseId}`, leaseId: u.leaseId, udalost: u.udalost,
      // Datum z ulozenych stavu (kdyz se predavalo jindy nez v den smlouvy), jinak ze smlouvy
      datum: stavy.find((s) => s.leaseId === u.leaseId && s.udalost === u.udalost)?.datum ?? u.datum,
      popis: `${u.udalost === "ZACATEK" ? "Předání" : "Vrácení"} · ${u.najemce}`, budouci: u.budouci,
    })),
    ...odecty.filter((d) => !noveOdecty.includes(d)).map((d) => ({ klic: `ODECET|${d}`, leaseId: null, udalost: "ODECET" as const, datum: d, popis: "Průběžný odečet", budouci: false })),
    ...vymeny.map((d) => ({ klic: `VYMENA|${d}`, leaseId: null, udalost: "VYMENA" as const, datum: d, popis: "Výměna měřáku", budouci: false })),
  ].sort((a, b) => (b.datum ?? "9999").localeCompare(a.datum ?? "9999"));
  const nazevRadku = (r: Radek) => ({ ZACATEK: "Předání", KONEC: "Vrácení", ODECET: "Průběžný odečet", VYMENA: "Výměna měřáku" })[r.udalost];
  // Sloupce historie: misto = aktualni merak + meraky, ktere nahradil
  const retezce = retezceMeraku(zobrazene);
  const sMerakem = (m: MerakRadek): MerakSeStavy => ({
    ...m, stavy: stavy.filter((x) => x.merakId === m.id).map((x) => ({ datum: x.datum, hodnota: x.hodnota, hodnota2: x.hodnota2, vynulovanoPo: x.vynulovanoPo })),
  });
  const [vymenaId, setVymenaId] = useState<string | null>(null);
  /** Posledni zapsany stav meraku (navrh pro konecny stav pri vymene). */
  const posledniStav = (merakId: string) => {
    const s = stavy.filter((x) => x.merakId === merakId && x.hodnota != null).sort((a, b) => b.datum.localeCompare(a.datum))[0];
    return s ? { hodnota: s.hodnota!, hodnota2: s.hodnota2, datum: s.datum } : null;
  };
  const archiv = meraky.filter((m) => !m.aktivni);
  const smaz = (m: MerakRadek) => {
    const n = stavy.filter((x) => x.merakId === m.id).length;
    const nazev = DRUH_MERAKU_MAP.get(m.druh)?.nazev ?? "";
    if (!confirm(`Smazat měřák ${nazev}${m.cislo ? ` č. ${m.cislo}` : ""}${n ? ` i s ${n} ${n === 1 ? "zapsaným stavem" : "zapsanými stavy"}` : ""}? Nejde to vrátit.`)) return;
    spust(async () => { const v = await smazMerak(m.id); setChyba(v.error ?? null); });
  };

  const stav = (r: Radek, merakId: string) => stavy.find((s) => s.merakId === merakId && s.udalost === r.udalost
    && (r.leaseId ? s.leaseId === r.leaseId : s.leaseId == null && s.datum === r.datum));
  const hodnota = (r: Radek, merakId: string, tarif: 1 | 2 = 1): number | null => {
    const k = `${r.klic}|${merakId}|${tarif}`;
    const s = stav(r, merakId);
    return k in hodnoty ? hodnoty[k] : (tarif === 2 ? s?.hodnota2 : s?.hodnota) ?? null;
  };
  const chybiHodnota = (r: Radek, m: MerakRadek) => tarify(m).some((t) => hodnota(r, m.id, t) == null);
  const datumRadku = (r: Radek) => datumy[r.klic] ?? r.datum ?? "";

  const uloz = (r: Radek, merakId: string, tarif: 1 | 2, text: string) => {
    const k = `${r.klic}|${merakId}|${tarif}`;
    const n = cislo(text);
    if (Number.isNaN(n)) { setBunky((b) => ({ ...b, [k]: "chyba" })); return; }
    if (n === hodnota(r, merakId, tarif)) return;
    const datum = datumRadku(r);
    if (!datum) { setChyba("Nejdřív vyplň datum v řádku."); return; }
    setHodnoty((h) => ({ ...h, [k]: n }));
    setBunky((b) => ({ ...b, [k]: "uklada" }));
    spust(async () => {
      const v = await ulozStav(propertyId, { merakId, leaseId: r.leaseId, udalost: r.udalost, datum, hodnota: n, tarif });
      setBunky((b) => ({ ...b, [k]: v.error ? "chyba" : "ok" }));
      setChyba(v.error ?? null);
    });
  };

  const zmenDatum = (r: Radek, datum: string) => {
    const puvodni = datumRadku(r);
    if (!datum || datum === puvodni || r.udalost === "VYMENA") return;
    const maStavy = zobrazene.some((m) => tarify(m).some((t) => hodnota(r, m.id, t) != null));
    if (r.udalost === "ODECET") {
      // Jiny odecet je dany dnem: radek se presune pod nove datum (i s ulozenymi stavy)
      setNoveOdecty((o) => [datum, ...o.filter((d) => d !== puvodni && d !== datum)]);
      otevri(`ODECET|${datum}`);
    } else {
      setDatumy((d) => ({ ...d, [r.klic]: datum }));
    }
    if (!maStavy) return;
    spust(async () => {
      const v = await zmenDatumUdalosti(propertyId, { leaseId: r.leaseId, udalost: r.udalost, puvodni, datum });
      setChyba(v.error ?? null);
    });
  };

  // Spotreba za najem: vraceni minus predani teze smlouvy
  const spotreba = (r: Radek, ret: MerakRadek[], tarif: 1 | 2) => {
    if (r.udalost !== "KONEC" || !r.leaseId || !ret.some((m) => maHodnotu(r, m))) return null;
    const zacatek = radky.find((x) => x.udalost === "ZACATEK" && x.leaseId === r.leaseId);
    const od = zacatek ? datumRadku(zacatek) : "";
    const doDne = datumRadku(r);
    if (!od || !doDne) return null;
    return spotrebaVObdobi(ret.map(sMerakem), od, doDne, tarif);
  };

  // Predani a vraceni potrebuji stav vsech meraku; prubezny odecet muze byt jen nektery
  const maHodnotu = (r: Radek, m: MerakRadek) => tarify(m).some((t) => hodnota(r, m.id, t) != null);
  /**
   * Meraky mista platne v danem radku: ty, ktere v nem maji stav, jinak ten, ktery tehdy
   * visel (pred vymenou stary, po ni novy). U vymeny jen meraky, kterych se tyka.
   */
  const merakyRadku = (ret: MerakRadek[], r: Radek): MerakRadek[] => {
    const se = ret.filter((m) => maHodnotu(r, m));
    if (se.length || r.udalost === "VYMENA") return se;
    const datum = datumRadku(r);
    const tehdy = [...ret].reverse().find((m) => !m.vymenenAt || !datum || m.vymenenAt > datum);
    return tehdy && (tehdy.aktivni || tehdy.vymenenAt) ? [tehdy] : [];
  };
  // Predani a vraceni potrebuji stav kazdeho mista; prubezny odecet a vymena jen nektere
  const jeNeuplny = (r: Radek) => (r.udalost === "ZACATEK" || r.udalost === "KONEC") && !r.budouci
    && retezce.some((ret) => merakyRadku(ret, r).some((m) => chybiHodnota(r, m)));
  const otevreny = vybrany ? radky.find((r) => r.klic === vybrany) ?? null : null;
  // Zavreni formulare: novy prubezny odecet, do ktereho se nic nezapsalo, zmizi
  const zavri = () => {
    setVybrany(null);
    setNoveOdecty((o) => o.filter((d) => stavy.some((x) => x.udalost === "ODECET" && x.datum === d)
      || Object.entries(hodnoty).some(([k, v]) => k.startsWith(`ODECET|${d}|`) && v != null)));
  };
  /** Posledni starsi zapsany stav meraku (pro kontrolu a spotrebu od minule). */
  const predchozi = (r: Radek, merakId: string, tarif: 1 | 2) => {
    const i = radky.indexOf(r);
    for (const x of radky.slice(i + 1)) {
      const h = hodnota(x, merakId, tarif);
      if (h != null) return { hodnota: h, datum: datumRadku(x) };
    }
    return null;
  };
  const prubeznyOdecet = () => {
    const dnes = denISO(new Date());
    setNoveOdecty((o) => [dnes, ...o.filter((d) => d !== dnes)]);
    otevri(`ODECET|${dnes}`);
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

      <SbalitelnaKarta klic={`meraky-seznam:${propertyId}`} title="Měřáky" vychoziSbalena={aktivni.length > 0}
        shrnuti={aktivni.length ? `${aktivni.length} ${aktivni.length === 1 ? "měřák" : aktivni.length < 5 ? "měřáky" : "měřáků"}${archiv.length ? ` · ${archiv.length} v archivu` : ""}` : undefined}>
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
                  {canEdit && <th className="w-36"><span className="sr-only">Akce</span></th>}
                </tr>
              </thead>
              <tbody>
                {aktivni.map((m) => {
                  const d = DRUH_MERAKU_MAP.get(m.druh);
                  return (
                    <Fragment key={m.id}>
                    <tr className={vymenaId === m.id ? "!bg-accent-soft/60" : ""}>
                      <td>
                        <div className="flex items-center gap-3">
                          {ikona(m.druh)}
                          <div>
                            <div className="font-medium leading-tight">{d?.nazev ?? m.druh}</div>
                            {m.druh === "ELEKTRINA" ? (
                              <select className="mt-0.5 bg-transparent text-xs text-ink-muted hover:text-ink-primary" value={m.dvoutarif ? "2" : "1"} disabled={!canEdit}
                                aria-label="Tarif elektroměru"
                                onChange={(e) => spust(async () => { await upravMerak(m.id, { dvoutarif: e.target.value === "2" }); })}>
                                <option value="1">jednotarif · kWh</option>
                                <option value="2">dvoutarif T1 + T2 · kWh</option>
                              </select>
                            ) : <div className="text-xs text-ink-muted">{d?.jednotka}</div>}
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
                        {svjByt && (() => {
                          const x = svj[m.id];
                          if (!m.cislo) return <div className="mt-1 text-xs text-ink-muted">bez čísla se v SVJ nedohledá</div>;
                          if (!svjNastaveno) return <div className="mt-1 text-xs text-warn">napojení na SVJ není nastavené</div>;
                          if (!x) return null;
                          if (x.chyba) return <div className="mt-1 text-xs text-warn">{x.chyba}</div>;
                          return (
                            <div className="mt-1 text-xs text-ink-muted">
                              SVJ: {x.posledni ? <>poslední {fmt(x.posledni.t1 ?? 0)}{x.posledni.t2 != null ? ` / ${fmt(x.posledni.t2)}` : ""} {d?.jednotka} ({x.posledni.datum.split("-").reverse().join("/")})</> : "zatím bez odečtu"}
                              {x.prevzato > 0 && <span className="text-good"> · převzato {x.prevzato}</span>}
                            </div>
                          );
                        })()}
                      </td>
                      {canEdit && (
                        <td className="whitespace-nowrap text-right">
                          <button type="button" className="mr-3 text-sm font-medium text-accent hover:underline" onClick={() => setVymenaId(vymenaId === m.id ? null : m.id)}>Vyměnit</button>
                          <button type="button" className="align-middle text-ink-muted hover:text-bad" aria-label="Smazat měřák"
                            title="Smazat měřák i se zapsanými stavy (výměna ho místo toho archivuje)"
                            onClick={() => smaz(m)}>
                            <Ikona nazev="kos" trida="h-4 w-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                    {vymenaId === m.id && (
                      <tr className="!bg-accent-soft/30">
                        <td colSpan={canEdit ? 4 : 3}>
                          <VymenaFormular merak={m} posledni={posledniStav(m.id)} onHotovo={(e) => { setChyba(e); if (!e) setVymenaId(null); }}
                            propertyId={propertyId} />
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {archiv.length > 0 && (
          <div className="mt-5">
            <h3 className="label mb-2">Archiv měřáků ({archiv.length})</h3>
            <div className="table-scroll">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Měřák</th>
                    <th>Výrobní číslo</th>
                    <th>Archivován</th>
                    <th className="num">Poslední stav</th>
                    {canEdit && <th className="w-24"><span className="sr-only">Akce</span></th>}
                  </tr>
                </thead>
                <tbody>
                  {archiv.map((m) => {
                    const d = DRUH_MERAKU_MAP.get(m.druh);
                    const nastupce = meraky.find((x) => x.nahrazujeId === m.id);
                    const p = posledniStav(m.id);
                    return (
                      <tr key={m.id} className="text-ink-secondary">
                        <td>
                          <div className="flex items-center gap-3">
                            {ikona(m.druh)}
                            <div className="font-medium text-ink-primary">{d?.nazev ?? m.druh}{m.nazev ? ` · ${m.nazev}` : ""}</div>
                          </div>
                        </td>
                        <td>{m.cislo ?? "—"}</td>
                        <td>
                          {m.vymenenAt ? `vyměněn ${m.vymenenAt.split("-").reverse().join("/")}` : "vyřazen"}
                          {nastupce && <div className="text-xs text-ink-muted">nahrazen měřákem{nastupce.cislo ? ` č. ${nastupce.cislo}` : ""}</div>}
                        </td>
                        <td className="num tabular-nums">
                          {p ? <>{fmt(p.hodnota)}{p.hodnota2 != null ? ` / ${fmt(p.hodnota2)}` : ""} {d?.jednotka}<div className="text-xs text-ink-muted">{p.datum.split("-").reverse().join("/")}</div></> : "—"}
                        </td>
                        {canEdit && (
                          <td className="whitespace-nowrap text-right">
                            {!nastupce && (
                              <button type="button" className="mr-3 text-sm font-medium text-accent hover:underline"
                                onClick={() => spust(async () => { const v = await upravMerak(m.id, { aktivni: true }); setChyba(v.error ?? null); })}>Obnovit</button>
                            )}
                            <button type="button" className="align-middle text-ink-muted hover:text-bad" aria-label="Smazat měřák"
                              title="Smazat měřák i se zapsanými stavy" onClick={() => smaz(m)}>
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
          </div>
        )}
        {aktivni.some((m) => m.druh === "RADIATOR") && (() => {
          const radiatory = aktivni.filter((m) => m.druh === "RADIATOR");
          const nulovani = radiatory.find((m) => m.nulovani)?.nulovani ?? null;
          return (
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4 text-sm">
              <label htmlFor="nulovani-radiatoru" className="label">Radiátory se nulují každý rok od</label>
              <input id="nulovani-radiatoru" className="input w-24 py-1.5" placeholder="dd/mm" defaultValue={nulovaniText(nulovani)} disabled={!canEdit}
                onBlur={(e) => {
                  const n = nulovaniZTextu(e.target.value);
                  if (n === undefined) { setChyba("Den vynulování zadej jako den/měsíc, např. 01/01."); return; }
                  if (n !== nulovani || radiatory.some((m) => (m.nulovani ?? null) !== n)) spust(async () => { const v = await nastavNulovaniRadiatoru(propertyId, n); setChyba(v.error ?? null); });
                }} />
              <span className="text-xs text-ink-muted">Platí pro všechny radiátory v bytě — od tohoto dne počítají znovu od nuly.</span>
            </div>
          );
        })()}
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4 text-sm">
          <label htmlFor="svj-byt" className="label">Evidence SVJ — číslo bytu</label>
          <input id="svj-byt" className="input w-28 py-1.5" placeholder="např. 5" defaultValue={svjByt ?? ""} disabled={!canEdit}
            onBlur={(e) => e.target.value.trim() !== (svjByt ?? "") && spust(async () => { const v = await nastavSvjByt(propertyId, e.target.value); setChyba(v.error ?? null); })} />
          {svjByt && canEdit && (
            <button type="button" className="btn py-1.5" disabled={synchronizuji}
              onClick={() => synchronizuj(async () => {
                const v = await synchronizujSvjTed(propertyId);
                setChyba(v.error ?? null);
                setSvjHlaska(v.error ? null : `Převzato ${v.prevzato ?? 0} ${v.prevzato === 1 ? "odečet" : (v.prevzato ?? 0) > 1 && (v.prevzato ?? 0) < 5 ? "odečty" : "odečtů"}${v.chyb ? `, ${v.chyb} ${v.chyb === 1 ? "měřák" : "měřáky"} se nepodařilo načíst` : ""}.`);
              })}>
              {synchronizuji ? "Synchronizuji…" : "Synchronizovat se SVJ"}
            </button>
          )}
          <span className="text-xs text-ink-muted">
            {svjHlaska ?? (svjByt
              ? `Měřáky se v SVJ dohledají podle výrobních čísel; stavy se převezmou samy jednou za měsíc${svjSyncAt ? ` (naposledy ${svjSyncAt.slice(0, 10).split("-").reverse().join("/")})` : ""}.`
              : "Vyplň, pokud byt eviduje odečty v aplikaci SVJ domu.")}
          </span>
        </div>
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
      </SbalitelnaKarta>

      {zobrazene.length > 0 && (
        <SbalitelnaKarta klic={`meraky-historie:${propertyId}`} title="Stavy měřáků"
          shrnuti={radky.filter(jeNeuplny).length ? `chybí stavy u ${radky.filter(jeNeuplny).length}` : `${radky.length} ${radky.length === 1 ? "záznam" : radky.length < 5 ? "záznamy" : "záznamů"}`}
          action={canEdit ? <button type="button" className="btn" onClick={prubeznyOdecet}>Průběžný odečet</button> : undefined}>
          {otevreny && canEdit && (
            <div ref={formular} className="mb-5 scroll-mt-24 rounded-xl border border-accent/40 bg-accent-soft/30 p-4">
              <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
                <div>
                  <div className="font-semibold">{nazevRadku(otevreny)}</div>
                  {(otevreny.udalost === "ZACATEK" || otevreny.udalost === "KONEC") && <div className="text-xs text-ink-muted">{otevreny.popis.split(" · ").slice(1).join(" · ")}</div>}
                </div>
                <div className="flex items-end gap-3">
                  {otevreny.udalost !== "VYMENA" && (
                    <div className="w-44">
                      <DatumPole key={otevreny.klic} label="Datum odečtu" name="datum-odectu" defaultValue={datumRadku(otevreny)}
                        onChange={(iso) => { if (iso) zmenDatum(otevreny, iso); }} />
                    </div>
                  )}
                  <button type="button" className="btn" onClick={zavri}>Hotovo</button>
                </div>
              </div>
              <div className="divide-y divide-line/70">
                {retezce.flatMap((ret) => merakyRadku(ret, otevreny)).map((m) => {
                  const d = DRUH_MERAKU_MAP.get(m.druh);
                  return (
                    <div key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                      <div className="flex min-w-[13rem] flex-1 items-center gap-3">
                        {ikona(m.druh)}
                        <div>
                          <div className="font-medium leading-tight">{d?.nazev ?? m.druh}{m.nazev ? ` · ${m.nazev}` : ""}{!m.aktivni && <span className="ml-1.5 align-middle"><Badge>{m.vymenenAt ? "starý, vyměněný" : "vyřazený"}</Badge></span>}</div>
                          <div className="text-xs text-ink-muted">{d?.jednotka}{m.cislo ? ` · č. ${m.cislo}` : ""}{otevreny.udalost === "VYMENA" ? (m.vymenenAt === datumRadku(otevreny) ? " · konečný stav" : " · počáteční stav nového") : ""}</div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-4">
                        {tarify(m).map((t) => {
                          const k = `${otevreny.klic}|${m.id}|${t}`;
                          const h = hodnota(otevreny, m.id, t);
                          const b = bunky[k];
                          const pred = predchozi(otevreny, m.id, t);
                          return (
                            <div key={t} className="flex items-center gap-3">
                              {m.dvoutarif && <span className="w-5 text-xs font-medium text-ink-muted">T{t}</span>}
                              <input key={`${k}|${h ?? ""}`} inputMode="decimal" defaultValue={h != null ? fmt(h) : ""}
                                aria-label={`${d?.nazev ?? ""}${m.dvoutarif ? ` T${t}` : ""}`} placeholder="stav"
                                className={`input w-36 text-right tabular-nums ${b === "chyba" ? "!border-bad" : b === "ok" ? "!border-good" : ""}`}
                                onBlur={(e) => uloz(otevreny, m.id, t, e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
                              <div className="w-44 text-xs leading-snug">
                                {b === "uklada" ? <span className="text-ink-muted">ukládám…</span>
                                  : b === "chyba" ? <span className="text-bad">neuloženo — zkontroluj číslo</span>
                                  : b === "ok" ? <span className="flex items-center gap-1 font-medium text-good"><Ikona nazev="ok" trida="h-3.5 w-3.5" />uloženo</span> : null}
                                {pred && (
                                  <div className="text-ink-muted">
                                    minule {fmt(pred.hodnota)} ({pred.datum.split("-").reverse().join("/")})
                                    {h != null && (() => {
                                      const nula = !!nulovaniMezi(m.nulovani, pred.datum, datumRadku(otevreny));
                                      if (nula) return <> · <span>od vynulování +{fmt(h)} {d?.jednotka ?? ""}</span></>;
                                      return <> · <span className={h < pred.hodnota ? "text-bad" : ""}>{h < pred.hodnota ? (m.nulovani ? "vynulováno?" : "menší než minule!") : `+${fmt(h - pred.hodnota)} ${d?.jednotka ?? ""}`}</span></>;
                                    })()}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {radky.length === 0 ? (
            <p className="py-3 text-center text-sm text-ink-muted">Nemovitost zatím nemá nájemní smlouvu. Stavy můžeš zapsat jako průběžný odečet.</p>
          ) : (
            <div className="table-scroll">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Událost</th>
                    <th>Datum</th>
                    {retezce.map((ret) => {
                      const m = ret[0];
                      const d = DRUH_MERAKU_MAP.get(m.druh);
                      return (
                        <th key={m.id} className={`num ${m.aktivni ? "" : "opacity-60"}`}>
                          <span className="inline-flex items-center gap-1.5"><Ikona nazev={(d?.ikona ?? "tri") as NazevIkony} trida="h-3.5 w-3.5" />{d?.nazev}{m.nazev ? ` · ${m.nazev}` : ""}</span>
                          <div className="font-normal normal-case tracking-normal">{m.dvoutarif ? "T1 / T2 · " : ""}{d?.jednotka}{m.aktivni ? "" : " · vyřazený"}</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {radky.map((r) => (
                    <tr key={r.klic} onClick={() => canEdit && otevri(r.klic)}
                      className={`${canEdit ? "cursor-pointer" : ""} ${r.klic === otevreny?.klic ? "!bg-accent-soft/60" : ""} ${r.budouci ? "opacity-60" : ""}`}>
                      <td>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{nazevRadku(r)}</span>
                          {r.budouci && <Badge>plánováno</Badge>}
                          {jeNeuplny(r) && <Badge tone="warn">chybí stavy</Badge>}
                          {zobrazene.some((m) => stav(r, m.id)?.zdroj === "SVJ") && <span title="Převzato z Evidence SVJ"><Badge>SVJ</Badge></span>}
                        </div>
                        {(r.udalost === "ZACATEK" || r.udalost === "KONEC") && <div className="text-xs text-ink-muted">{r.popis.split(" · ").slice(1).join(" · ")}</div>}
                      </td>
                      <td className="whitespace-nowrap tabular-nums">{datumRadku(r) ? datumRadku(r).split("-").reverse().join("/") : "—"}</td>
                      {retezce.map((ret) => (
                        <td key={ret[0].id} className="num whitespace-nowrap tabular-nums">
                          {tarify(ret[0]).map((t) => {
                            // Pri vymene ma stav stary i novy merak: "konecny → pocatecni"
                            const hodnotyRetezce = [...ret].reverse().map((m) => hodnota(r, m.id, t)).filter((h): h is number => h != null);
                            const sp = spotreba(r, ret, t);
                            return (
                              <div key={t}>
                                {ret[0].dvoutarif && <span className="mr-1 text-xs text-ink-muted">T{t}</span>}
                                {hodnotyRetezce.length ? hodnotyRetezce.map(fmt).join(" → ") : <span className="text-ink-muted">—</span>}
                                {sp != null && <div className="text-xs text-ink-muted" title={sp.neuplna ? "Mezi odečty se měřák vynuloval a chybí odečet těsně před vynulováním — část spotřeby není započtená" : undefined}>spotřeba {fmt(sp.spotreba)}{sp.neuplna ? " (neúplná)" : ""}</div>}
                              </div>
                            );
                          })}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-xs text-ink-muted">
            Kliknutím na řádek ho otevřeš k zápisu nebo úpravě. Hodnota se uloží sama po opuštění políčka (nebo Enter)
            a stav při vrácení se ve stejný den doplní i k předání dalšímu nájemci. Prodloužení smlouvy téhož nájemníka se nepředává.
          </p>
        </SbalitelnaKarta>
      )}
    </div>
  );
}

/** Formular vymeny meraku: datum, konecny stav stareho, pocatecni stav a cislo noveho. */
function VymenaFormular({ propertyId, merak, posledni, onHotovo }: {
  propertyId: string;
  merak: MerakRadek;
  posledni: { hodnota: number; hodnota2: number | null; datum: string } | null;
  onHotovo: (chyba: string | null) => void;
}) {
  const [datum, setDatum] = useState<string | null>(denISO(new Date()));
  const [pole, setPole] = useState({ konecny: "", konecny2: "", pocatecni: "0", pocatecni2: "0", cislo: "" });
  const [bezi, spust] = useTransition();
  const jednotka = DRUH_MERAKU_MAP.get(merak.druh)?.jednotka ?? "";
  const vstup = (klic: keyof typeof pole, label: string, hint?: string) => (
    <label className="block">
      <span className="label mb-1.5 block">{label}</span>
      <input className="input w-40 text-right tabular-nums" inputMode={klic === "cislo" ? "text" : "decimal"} value={pole[klic]}
        onChange={(e) => setPole((p) => ({ ...p, [klic]: e.target.value }))} placeholder={klic === "cislo" ? "nepovinné" : jednotka} />
      {hint && <span className="mt-1 block text-xs text-ink-muted">{hint}</span>}
    </label>
  );
  const odeslat = () => spust(async () => {
    const v = await vymenMerak(propertyId, {
      merakId: merak.id, datum: datum ?? "",
      konecny: cislo(pole.konecny), konecny2: merak.dvoutarif ? cislo(pole.konecny2) : null,
      pocatecni: cislo(pole.pocatecni), pocatecni2: merak.dvoutarif ? cislo(pole.pocatecni2) : null,
      cislo: pole.cislo,
    });
    onHotovo(v.error ?? null);
  });
  return (
    <div className="space-y-3 py-1">
      <div className="text-sm font-medium">Výměna měřáku — starý se archivuje i se stavy, spotřeba se dál počítá přes oba.</div>
      <div className="flex flex-wrap items-start gap-4">
        <div className="w-44"><DatumPole label="Datum výměny" name="datum-vymeny" defaultValue={datum ?? ""} onChange={setDatum} /></div>
        {vstup("konecny", merak.dvoutarif ? "Konečný stav starého T1" : "Konečný stav starého",
          posledni ? `naposledy ${fmt(posledni.hodnota)} (${posledni.datum.split("-").reverse().join("/")})` : undefined)}
        {merak.dvoutarif && vstup("konecny2", "Konečný stav starého T2", posledni?.hodnota2 != null ? `naposledy ${fmt(posledni.hodnota2)}` : undefined)}
        {vstup("pocatecni", merak.dvoutarif ? "Počáteční stav nového T1" : "Počáteční stav nového")}
        {merak.dvoutarif && vstup("pocatecni2", "Počáteční stav nového T2")}
        {vstup("cislo", "Výrobní číslo nového")}
      </div>
      <div className="flex gap-2">
        <button type="button" className="btn btn-primary" disabled={bezi} onClick={odeslat}>{bezi ? "Ukládám…" : "Vyměnit měřák"}</button>
        <button type="button" className="btn" onClick={() => onHotovo(null)}>Zrušit</button>
      </div>
    </div>
  );
}
