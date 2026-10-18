"use client";

import { Fragment, useState, useTransition } from "react";
import { DRUHY_MERAKU, DRUH_MERAKU_MAP, retezceMeraku, spotrebaVObdobi, type MerakSeStavy, type UdalostNajmu } from "@/lib/meraky";
import { pridejMerak, smazMerak, ulozStav, upravMerak, vymenMerak, zmenDatumUdalosti } from "@/lib/merakyActions";
import { denISO } from "@/lib/format";
import { DatumPole } from "./DatumPole";
import { Ikona, type NazevIkony } from "./Ikony";
import { Badge } from "./Stat";
import { SbalitelnaKarta } from "./SbalitelnaKarta";

export interface MerakRadek {
  id: string; druh: string; nazev: string | null; cislo: string | null; aktivni: boolean; dvoutarif: boolean;
  /** Merak, ktery tento nahradil (vymena) */
  nahrazujeId: string | null;
  /** Den vymeny (u vymeneneho meraku) */
  vymenenAt: string | null;
}
export interface StavRadek { id: string; merakId: string; leaseId: string | null; udalost: string; datum: string; hodnota: number | null; hodnota2: number | null }

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
  // Radky otevrene k uprave tuzkou (radky s chybejicimi stavy jsou otevrene samy)
  const [upravovane, setUpravovane] = useState<Set<string>>(new Set());
  const otevri = (klic: string, ano = true) => setUpravovane((u) => { const n = new Set(u); if (ano) n.add(klic); else n.delete(klic); return n; });

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
    ...m, stavy: stavy.filter((x) => x.merakId === m.id).map((x) => ({ datum: x.datum, hodnota: x.hodnota, hodnota2: x.hodnota2 })),
  });
  const [vymenaId, setVymenaId] = useState<string | null>(null);
  /** Posledni zapsany stav meraku (navrh pro konecny stav pri vymene). */
  const posledniStav = (merakId: string) => {
    const s = stavy.filter((x) => x.merakId === merakId && x.hodnota != null).sort((a, b) => b.datum.localeCompare(a.datum))[0];
    return s ? { hodnota: s.hodnota!, hodnota2: s.hodnota2, datum: s.datum } : null;
  };
  const archiv = meraky.filter((m) => !m.aktivni);

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
    return spotrebaVObdobi(ret.map(sMerakem), od, doDne, tarif)?.spotreba ?? null;
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
  // Policka k zapisu: rucne otevreny radek, nove pridany prubezny odecet, nebo kde chybi stavy
  const jeOtevreny = (r: Radek) => upravovane.has(r.klic) || jeNeuplny(r)
    || (r.udalost === "ODECET" && noveOdecty.includes(r.datum ?? "") && !zobrazene.some((m) => maHodnotu(r, m)));
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
                      </td>
                      {canEdit && (
                        <td className="whitespace-nowrap text-right">
                          <button type="button" className="mr-3 text-sm font-medium text-accent hover:underline" onClick={() => setVymenaId(vymenaId === m.id ? null : m.id)}>Vyměnit</button>
                          <button type="button" className="align-middle text-ink-muted hover:text-bad" aria-label="Vyřadit měřák"
                            title="Vyřadit měřák (se zapsanými stavy se jen archivuje)"
                            onClick={() => { if (confirm(`Vyřadit měřák ${d?.nazev ?? ""}? Se zapsanými stavy zůstane v archivu.`)) spust(async () => { await smazMerak(m.id); }); }}>
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
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-ink-secondary">Archiv měřáků ({archiv.length})</summary>
            <ul className="mt-2 space-y-1 text-ink-secondary">
              {archiv.map((m) => {
                const d = DRUH_MERAKU_MAP.get(m.druh);
                const nastupce = meraky.find((x) => x.nahrazujeId === m.id);
                const p = posledniStav(m.id);
                return (
                  <li key={m.id} className="flex flex-wrap items-center gap-2">
                    <Ikona nazev={(d?.ikona ?? "tri") as NazevIkony} trida="h-4 w-4" />
                    <span className="font-medium text-ink-primary">{d?.nazev}{m.nazev ? ` · ${m.nazev}` : ""}</span>
                    {m.cislo && <span>č. {m.cislo}</span>}
                    <Badge>{m.vymenenAt ? `vyměněn ${m.vymenenAt.split("-").reverse().join("/")}` : "vyřazen"}</Badge>
                    {p && <span className="text-xs">poslední stav {fmt(p.hodnota)}{p.hodnota2 != null ? ` / ${fmt(p.hodnota2)}` : ""} {d?.jednotka}</span>}
                    {nastupce?.cislo && <span className="text-xs">→ nový č. {nastupce.cislo}</span>}
                  </li>
                );
              })}
            </ul>
          </details>
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
      </SbalitelnaKarta>

      {zobrazene.length > 0 && (
        <SbalitelnaKarta klic={`meraky-historie:${propertyId}`} title="Stavy měřáků"
          shrnuti={radky.filter(jeNeuplny).length ? `chybí stavy u ${radky.filter(jeNeuplny).length}` : `${radky.length} ${radky.length === 1 ? "záznam" : radky.length < 5 ? "záznamy" : "záznamů"}`}
          action={canEdit ? <button type="button" className="btn" onClick={prubeznyOdecet}>Průběžný odečet</button> : undefined}>
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
                    {canEdit && <th className="w-24"><span className="sr-only">Akce</span></th>}
                  </tr>
                </thead>
                <tbody>
                  {radky.map((r) => {
                    const upravit = canEdit && jeOtevreny(r);
                    return (
                      <tr key={r.klic} className={`${upravit ? "!bg-accent-soft/40" : ""} ${r.budouci && !upravit ? "opacity-60" : ""}`}>
                        <td className="align-top">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{nazevRadku(r)}</span>
                            {r.budouci && <Badge>plánováno</Badge>}
                            {jeNeuplny(r) && <Badge tone="warn">chybí stavy</Badge>}
                          </div>
                          {(r.udalost === "ZACATEK" || r.udalost === "KONEC") && <div className="text-xs text-ink-muted">{r.popis.split(" · ").slice(1).join(" · ")}</div>}
                        </td>
                        <td className="align-top whitespace-nowrap tabular-nums">
                          {upravit && r.udalost !== "VYMENA" ? (
                            <div className="w-36">
                              <DatumPole key={r.klic} label="Datum odečtu" skrytLabel name={`datum-${r.klic}`} defaultValue={datumRadku(r)}
                                onChange={(iso) => { if (iso) zmenDatum(r, iso); }} />
                            </div>
                          ) : datumRadku(r) ? datumRadku(r).split("-").reverse().join("/") : "—"}
                        </td>
                        {retezce.map((ret) => {
                          const vRadku = merakyRadku(ret, r);
                          return (
                            <td key={ret[0].id} className="num align-top whitespace-nowrap tabular-nums">
                              {upravit ? (
                                <div className="space-y-1.5">
                                  {vRadku.map((m) => tarify(m).map((t) => {
                                    const k = `${r.klic}|${m.id}|${t}`;
                                    const h = hodnota(r, m.id, t);
                                    const b = bunky[k];
                                    const pred = predchozi(r, m.id, t);
                                    const jednotka = DRUH_MERAKU_MAP.get(m.druh)?.jednotka ?? "";
                                    const popisek = [m.dvoutarif ? `T${t}` : "", r.udalost === "VYMENA" ? (m.vymenenAt === datumRadku(r) ? "starý" : "nový") : ""].filter(Boolean).join(" ");
                                    return (
                                      <div key={k}>
                                        <div className="flex items-center justify-end gap-2">
                                          {popisek && <span className="text-xs font-medium text-ink-muted">{popisek}</span>}
                                          <input key={`${k}|${h ?? ""}`} inputMode="decimal" defaultValue={h != null ? fmt(h) : ""} placeholder="stav"
                                            aria-label={`${DRUH_MERAKU_MAP.get(m.druh)?.nazev ?? ""} ${popisek} — ${r.popis}`}
                                            className={`input w-28 py-1.5 text-right tabular-nums ${b === "chyba" ? "!border-bad" : b === "ok" ? "!border-good" : ""}`}
                                            onBlur={(e) => uloz(r, m.id, t, e.target.value)}
                                            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
                                        </div>
                                        <div className="mt-0.5 text-xs">
                                          {b === "uklada" ? <span className="text-ink-muted">ukládám…</span>
                                            : b === "chyba" ? <span className="text-bad">neuloženo</span>
                                            : h != null && pred ? <span className={h < pred.hodnota ? "text-bad" : "text-ink-muted"}>{h < pred.hodnota ? "menší než minule!" : `+${fmt(h - pred.hodnota)} ${jednotka}`}</span>
                                            : pred ? <span className="text-ink-muted">minule {fmt(pred.hodnota)}</span> : null}
                                        </div>
                                      </div>
                                    );
                                  }))}
                                  {vRadku.length === 0 && <span className="text-ink-muted">—</span>}
                                </div>
                              ) : (
                                tarify(ret[0]).map((t) => {
                                  // Pri vymene ma stav stary i novy merak: "konecny → pocatecni"
                                  const hodnotyRetezce = [...ret].reverse().map((m) => hodnota(r, m.id, t)).filter((h): h is number => h != null);
                                  const sp = spotreba(r, ret, t);
                                  return (
                                    <div key={t}>
                                      {ret[0].dvoutarif && <span className="mr-1 text-xs text-ink-muted">T{t}</span>}
                                      {hodnotyRetezce.length ? hodnotyRetezce.map(fmt).join(" → ") : <span className="text-ink-muted">—</span>}
                                      {sp != null && <div className="text-xs text-ink-muted">spotřeba {fmt(sp)}</div>}
                                    </div>
                                  );
                                })
                              )}
                            </td>
                          );
                        })}
                        {canEdit && (
                          <td className="align-top text-right">
                            {upravit ? (
                              !jeNeuplny(r) && <button type="button" className="btn py-1 text-sm" onClick={() => otevri(r.klic, false)}>Hotovo</button>
                            ) : (
                              <button type="button" className="text-ink-muted hover:text-accent" aria-label="Upravit stavy" title="Upravit stavy"
                                onClick={() => otevri(r.klic)}>
                                <Ikona nazev="pero" trida="h-4 w-4" />
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-xs text-ink-muted">
            Řádky s chybějícími stavy mají políčka rovnou; ostatní upravíš tužkou. Hodnota se uloží sama po opuštění políčka (nebo Enter)
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
