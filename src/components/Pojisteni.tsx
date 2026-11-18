"use client";

import { useRef, useState, useTransition } from "react";
import { nahrajSmlouvu, prectiNovouSmlouvu, rozeberSmlouvu, smazPojistku, smazSmlouvu, smazZmenuPojistneho, ukonciPojistku, ulozPojistku } from "@/lib/pojistkyActions";
import { DRUHY_POJISTKY, FREKVENCE, RIZIKA, pristiSplatnost, type Frekvence } from "@/lib/pojistky";
import type { RozborPojistky } from "@/lib/pojistkaAi";
import { nactiSoubor } from "@/lib/souborKlient";
import { czk, dateCz } from "@/lib/format";
import { Badge, Card } from "./Stat";
import { DatumPole } from "./DatumPole";
import { Ikona } from "./Ikony";
import { useOrezFotky } from "./OrezFotky";

export interface PojistkaRadek {
  id: string; pojistovna: string; cisloSmlouvy: string | null; druh: string; od: string; do: string | null;
  frekvence: string; castka: number; pojistnaCastka: number | null; poznamka: string | null;
  /** Datum splatnosti (rrrr-mm-dd) nebo null = k zacatku pojisteni */
  splatnost: string | null;
  zmeny: { id: string; validFrom: string; castka: number }[];
  smlouvy: { id: string; nazev: string; mime: string }[];
  ai: RozborPojistky | null; aiAt: string | null;
}

type Form = {
  id?: string; pojistovna: string; cisloSmlouvy: string; druh: string; od: string | null; do: string | null;
  frekvence: string; castka: string; pojistnaCastka: string; poznamka: string; castkaOd: string | null; puvodniCastka?: number;
  splatnost: string | null;
};

const dnes = () => new Date().toISOString().slice(0, 10);
const cislo = (t: string) => Number(t.replace(/\s/g, "").replace(",", "."));
const zaRok = (f: string) => FREKVENCE[f as Frekvence]?.zaRok ?? 1;
const TON = { OK: "good", POZOR: "warn", PROBLEM: "bad" } as const;
const POPIS_STAVU = { OK: "V pořádku", POZOR: "Pozor", PROBLEM: "Problém" } as const;

/**
 * Pojisteni nemovitosti: pojistky (od-do, pojistne s historii vyse, ukonceni), nahrana smlouva
 * a jeji rozbor AI (udaje, rizika, hodnoceni kryti). Pojistne se plati jako predpis na Stavu uctu.
 */
export function Pojisteni({ propertyId, canEdit, diskPripojen, aiZapnuto, hodnota, pojistky }: {
  propertyId: string; canEdit: boolean; diskPripojen: boolean; aiZapnuto: boolean;
  /** Aktualni odhad hodnoty (nebo porizovaci cena) — k porovnani s pojistnou castkou */
  hodnota: number | null;
  pojistky: PojistkaRadek[];
}) {
  const [bezi, spust] = useTransition();
  const [hlaska, setHlaska] = useState<{ ok: boolean; text: string } | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  // Nova pojistka ze smlouvy: soubory se nahraji, AI z nich vyplni formular, uzivatel potvrdi
  const [nova, setNova] = useState<{ faze: "nahrani" | "prace" | "kontrola"; dokumenty: { id: string; nazev: string; mime: string }[]; ai: RozborPojistky | null } | null>(null);
  const vstupNove = useRef<HTMLInputElement>(null);
  // Drag & drop: nad kterou plochou se zrovna tahne soubor ("nova" nebo id pojistky)
  const [tahnuti, setTahnuti] = useState<string | null>(null);
  const POVOLENE = /^(application\/pdf|image\/)/;
  const pretazeni = (cil: string, onSoubory: (f: File[]) => void) => ({
    onDragOver: (e: React.DragEvent) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; if (tahnuti !== cil) setTahnuti(cil); } },
    onDragLeave: (e: React.DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setTahnuti(null); },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault(); setTahnuti(null);
      const f = Array.from(e.dataTransfer.files).filter((x) => POVOLENE.test(x.type));
      if (f.length) onSoubory(f); else setHlaska({ ok: false, text: "Přetáhni PDF nebo fotky stran smlouvy." });
    },
  });
  const [ukoncit, setUkoncit] = useState<{ id: string; do: string | null } | null>(null);
  const [kPojistce, setKPojistce] = useState<string | null>(null);
  const vstup = useRef<HTMLInputElement>(null);
  const { orizni, dialog } = useOrezFotky();
  const vysledek = (r: { error?: string; success?: string }) => setHlaska(r.error ? { ok: false, text: r.error } : r.success ? { ok: true, text: r.success } : null);

  const platne = pojistky.filter((p) => p.od <= dnes() && (!p.do || p.do >= dnes()));
  const ukoncene = pojistky.filter((p) => p.do && p.do < dnes());
  const budouci = pojistky.filter((p) => p.od > dnes());

  /** Nahraje soubory smlouvy (fotky jde oriznout) a pak je necha AI rozebrat. */
  const nahrajARozeber = async (pojistkaId: string, vybrane: File[]) => {
    const upravene = await orizni(vybrane);
    for (let i = 0; i < upravene.length; i++) {
      setHlaska({ ok: true, text: `Nahrávám smlouvu ${i + 1} z ${upravene.length}…` });
      const s = await nactiSoubor(upravene[i]);
      const r = await nahrajSmlouvu(propertyId, pojistkaId, { data: s.data, mime: s.mime, nazev: s.nazev });
      if (r.error) { vysledek(r); return; }
    }
    if (aiZapnuto && upravene.length) {
      setHlaska({ ok: true, text: "AI prochází smlouvu… (může trvat i minutu)" });
      vysledek(await rozeberSmlouvu(propertyId, pojistkaId));
    } else setHlaska({ ok: true, text: "Smlouva nahrána." });
  };

  const uloz = () => {
    if (!form) return;
    spust(async () => {
      const r = await ulozPojistku(propertyId, {
        id: form.id, pojistovna: form.pojistovna, cisloSmlouvy: form.cisloSmlouvy, druh: form.druh, od: form.od ?? "", do: form.do,
        frekvence: form.frekvence, castka: cislo(form.castka), pojistnaCastka: form.pojistnaCastka.trim() ? cislo(form.pojistnaCastka) : null,
        poznamka: form.poznamka, castkaOd: form.castkaOd, splatnost: form.splatnost,
        ...(!form.id && nova ? { dokumenty: nova.dokumenty.map((d) => d.id), ai: nova.ai } : {}),
      });
      if (r.error || !r.id) { vysledek(r); return; }
      setForm(null); setNova(null);
      setHlaska({ ok: true, text: form.id ? "Pojistka upravena." : "Pojistka uložena." });
    });
  };

  /** Smlouva vybrana: fotky oriznout, nahrat na Disk, AI precte udaje a vyplni formular. */
  const prectiSmlouvu = (vybrane: File[]) => spust(async () => {
    const upravene = await orizni(vybrane);
    if (!upravene.length) return;
    setNova((n) => n && { ...n, faze: "prace" });
    const dokumenty = [...(nova?.dokumenty ?? [])];
    for (let i = 0; i < upravene.length; i++) {
      setHlaska({ ok: true, text: `Nahrávám smlouvu ${i + 1} z ${upravene.length}…` });
      const s = await nactiSoubor(upravene[i]);
      const r = await nahrajSmlouvu(propertyId, null, { data: s.data, mime: s.mime, nazev: s.nazev });
      if (r.error || !r.dokument) { vysledek(r); setNova((n) => n && { ...n, faze: "nahrani", dokumenty }); return; }
      dokumenty.push(r.dokument);
    }
    if (!aiZapnuto) {
      setNova({ faze: "kontrola", dokumenty, ai: null }); setForm(novy());
      setHlaska({ ok: false, text: "Smlouva je nahraná, ale čtení AI není zapnuté — vyplň údaje ručně." });
      return;
    }
    setHlaska({ ok: true, text: "AI čte smlouvu… (může trvat i minutu)" });
    const r = await prectiNovouSmlouvu(propertyId, dokumenty.map((d) => d.id));
    if (r.error || !r.rozbor) { setNova({ faze: "kontrola", dokumenty, ai: null }); setForm(novy()); vysledek({ error: r.error ?? "Smlouvu se nepodařilo přečíst — vyplň údaje ručně." }); return; }
    const a = r.rozbor;
    const frekvence = a.frekvence ?? "ROCNE";
    const castka = a.pojistneZaPlatbu ?? (a.rocniPojistne != null ? a.rocniPojistne / zaRok(frekvence) : null);
    setNova({ faze: "kontrola", dokumenty, ai: a });
    setForm({
      pojistovna: a.pojistovna ?? "", cisloSmlouvy: a.cisloSmlouvy ?? "", druh: a.druh ?? "NEMOVITOST",
      od: a.od && /^\d{4}-\d{2}-\d{2}$/.test(a.od) ? a.od : null, do: a.do && /^\d{4}-\d{2}-\d{2}$/.test(a.do) ? a.do : null,
      frekvence, castka: castka != null ? String(Math.round(castka * 100) / 100).replace(".", ",") : "",
      pojistnaCastka: a.pojistnaCastkaNemovitost != null ? String(a.pojistnaCastkaNemovitost) : "", poznamka: "", castkaOd: null,
      splatnost: a.splatnost && /^\d{4}-\d{2}-\d{2}$/.test(a.splatnost) ? a.splatnost : null,
    });
    setHlaska(null);
  });
  const zrusNovou = () => spust(async () => {
    // Nahrane soubory k neulozene pojistce pryc (na Disku do kose)
    for (const d of nova?.dokumenty ?? []) await smazSmlouvu(propertyId, d.id);
    setNova(null); setForm(null);
  });

  const novy = (): Form => ({ pojistovna: "", cisloSmlouvy: "", druh: "NEMOVITOST", od: dnes(), do: null, frekvence: "ROCNE", castka: "", pojistnaCastka: "", poznamka: "", castkaOd: dnes(), splatnost: null });
  const zmenaCastky = form?.id != null && form.puvodniCastka != null && Math.abs(cislo(form.castka) - form.puvodniCastka) >= 0.01;

  return (
    <div className="space-y-5">
      {dialog}
      <input ref={vstup} type="file" accept="application/pdf,image/*" multiple className="hidden"
        onChange={(e) => { const id = kPojistce; const vybrane = Array.from(e.target.files ?? []); e.target.value = ""; if (id && vybrane.length) spust(() => nahrajARozeber(id, vybrane)); }} />
      {hlaska && !nova && !form && <p className={`rounded-lg px-3 py-2 text-sm ${hlaska.ok ? "bg-good/10 text-good" : "bg-bad/10 text-bad"}`}>{hlaska.text}</p>}

      <Card title="Pojištění" action={canEdit && !form && !nova ? <button type="button" className="btn btn-primary text-sm" onClick={() => { setHlaska(null); if (diskPripojen) setNova({ faze: "nahrani", dokumenty: [], ai: null }); else setForm(novy()); }}>+ Přidat pojistku</button> : undefined}>
        {platne.length ? (
          <p className="text-sm text-ink-secondary">
            Platné pojištění: {platne.map((p) => <strong key={p.id} className="text-ink-primary">{p.pojistovna} ({czk(p.castka * zaRok(p.frekvence))}/rok)</strong>).reduce<React.ReactNode[]>((a, x, i) => (i ? [...a, ", ", x] : [x]), [])}
            {" "}· pojistné se platí jako předpis na Stavu účtu a jde spárovat z banky.
          </p>
        ) : (
          <p className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-sm font-medium text-bad">Nemovitost nemá platné pojištění.</p>
        )}
      </Card>

      <input ref={vstupNove} type="file" accept="application/pdf,image/*" multiple className="hidden"
        onChange={(e) => { const vybrane = Array.from(e.target.files ?? []); e.target.value = ""; if (vybrane.length) prectiSmlouvu(vybrane); }} />
      {nova && nova.faze !== "kontrola" && (
        <Card title="Nová pojistka">
          <div {...pretazeni("nova", (f) => { if (!bezi) prectiSmlouvu(f); })}
            className={`rounded-xl border-2 border-dashed p-4 transition-colors ${tahnuti === "nova" ? "border-accent bg-accent-soft/60" : "border-line"}`}>
          <p className="mb-3 text-sm text-ink-secondary">Nahraj smlouvu — AI z ní přečte pojišťovnu, číslo, platnost, pojistné i pojistné částky a ty údaje jen zkontroluješ a potvrdíš.</p>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-primary inline-flex items-center gap-2 py-2.5" disabled={bezi} onClick={() => vstupNove.current?.click()}>
              <Ikona nazev="dokument" trida="h-4 w-4" /> {bezi ? "Zpracovávám…" : "Nahrát smlouvu (PDF nebo fotky stran)"}
            </button>
            <button type="button" className="text-sm text-accent hover:underline" disabled={bezi} onClick={() => { setNova(null); setForm(novy()); }}>Bez smlouvy — vyplnit ručně</button>
            <button type="button" className="text-sm text-ink-muted hover:underline" disabled={bezi} onClick={zrusNovou}>Zrušit</button>
          </div>
          <p className="mt-3 hidden text-xs text-ink-muted sm:block">{tahnuti === "nova" ? "Pusť soubory sem…" : "…nebo sem smlouvu přetáhni myší (PDF i fotky, víc souborů najednou)."}</p>
          </div>
          {hlaska && <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${hlaska.ok ? "bg-good/10 text-good" : "bg-bad/10 text-bad"}`}>{hlaska.text}</p>}
        </Card>
      )}

      {form && (
        <Card title={form.id ? "Upravit pojistku" : nova?.ai ? "Nová pojistka — zkontroluj údaje ze smlouvy" : "Nová pojistka"}>
          {!form.id && nova?.ai && (
            <p className="mb-3 rounded-lg bg-accent-soft/60 px-3 py-2 text-sm text-ink-secondary">Údaje vyplnila AI ze smlouvy ({nova.dokumenty.length} {nova.dokumenty.length === 1 ? "soubor" : "soubory"}). Zkontroluj je, případně oprav, a potvrď.</p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="label mb-1.5 block">Pojišťovna</span>
              <input className="input" value={form.pojistovna} placeholder="např. Kooperativa" onChange={(e) => setForm((f) => f && { ...f, pojistovna: e.target.value })} /></label>
            <label className="block"><span className="label mb-1.5 block">Číslo smlouvy</span>
              <input className="input" value={form.cisloSmlouvy} placeholder="nepovinné — AI ho doplní ze smlouvy" onChange={(e) => setForm((f) => f && { ...f, cisloSmlouvy: e.target.value })} /></label>
            <label className="block"><span className="label mb-1.5 block">Druh</span>
              <select className="input" value={form.druh} onChange={(e) => setForm((f) => f && { ...f, druh: e.target.value })}>
                {Object.entries(DRUHY_POJISTKY).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
              </select></label>
            <label className="block"><span className="label mb-1.5 block">Jak často se platí</span>
              <select className="input" value={form.frekvence} onChange={(e) => setForm((f) => f && { ...f, frekvence: e.target.value })}>
                {Object.entries(FREKVENCE).map(([k, v]) => <option key={k} value={k}>{v.nazev}</option>)}
              </select></label>
            <DatumPole label="Platí od" name="poj-od" defaultValue={form.od ?? ""} onChange={(d) => setForm((f) => f && { ...f, od: d })} />
            <DatumPole label="Platí do (prázdné = na dobu neurčitou)" name="poj-do" defaultValue={form.do ?? ""} onChange={(d) => setForm((f) => f && { ...f, do: d })} />
            <DatumPole label="Splatnost pojistného (datum platby)" name="poj-splatnost" defaultValue={form.splatnost ?? ""} onChange={(d) => setForm((f) => f && { ...f, splatnost: d })}
              hint="Např. 15/03 — další platby podle frekvence. Prázdné = k začátku pojištění." />
            <label className="block"><span className="label mb-1.5 block">Pojistné za jednu platbu (Kč)</span>
              <input className="input" inputMode="decimal" value={form.castka} onChange={(e) => setForm((f) => f && { ...f, castka: e.target.value })} />
              {cislo(form.castka) > 0 && <span className="mt-1 block text-xs text-ink-muted">= {czk(cislo(form.castka) * zaRok(form.frekvence))} ročně</span>}</label>
            <label className="block"><span className="label mb-1.5 block">Pojistná částka nemovitosti (Kč)</span>
              <input className="input" inputMode="decimal" value={form.pojistnaCastka} placeholder="limit plnění — AI ho doplní ze smlouvy" onChange={(e) => setForm((f) => f && { ...f, pojistnaCastka: e.target.value })} /></label>
            {zmenaCastky && (
              <DatumPole label="Nová výše pojistného platí od" name="poj-castka-od" defaultValue={form.castkaOd ?? dnes()} onChange={(d) => setForm((f) => f && { ...f, castkaOd: d })}
                hint="Dosavadní výše zůstane v historii — předpisy před tímto datem se nezmění." />
            )}
            <label className="block sm:col-span-2"><span className="label mb-1.5 block">Poznámka</span>
              <input className="input" value={form.poznamka} onChange={(e) => setForm((f) => f && { ...f, poznamka: e.target.value })} /></label>
          </div>
          {hlaska && <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${hlaska.ok ? "bg-good/10 text-good" : "bg-bad/10 text-bad"}`}>{hlaska.text}</p>}
          <div className="mt-4 flex gap-2">
            <button type="button" className="btn btn-primary" disabled={bezi || !form.pojistovna.trim() || !form.od || !(cislo(form.castka) > 0)} onClick={uloz}>{bezi ? "Ukládám…" : nova?.ai ? "Potvrdit a uložit" : "Uložit"}</button>
            <button type="button" className="btn" disabled={bezi} onClick={() => { if (nova) zrusNovou(); else setForm(null); }}>Zrušit</button>
          </div>
          {!form.id && nova?.ai && <div className="mt-4"><RozborAi ai={nova.ai} kdy={null} /></div>}
        </Card>
      )}

      {[...budouci, ...platne, ...ukoncene].map((p) => {
        const stav = p.od > dnes() ? { t: "od " + dateCz(p.od), tone: "neutral" as const } : p.do && p.do < dnes() ? { t: "ukončená", tone: "neutral" as const } : { t: "platí", tone: "good" as const };
        const kryti = p.pojistnaCastka && hodnota ? p.pojistnaCastka / hodnota : null;
        const zmeny = [...p.zmeny].sort((a, b) => b.validFrom.localeCompare(a.validFrom));
        const ai = p.ai;
        return (
          <Card key={p.id} title={`${p.pojistovna} · ${DRUHY_POJISTKY[p.druh] ?? p.druh}`}
            action={<Badge tone={stav.tone}>{stav.t}</Badge>}>
            <div {...(canEdit && diskPripojen ? pretazeni(p.id, (f) => { if (!bezi) spust(() => nahrajARozeber(p.id, f)); }) : {})}
              className={`space-y-3 rounded-lg text-sm transition-colors ${p.do && p.do < dnes() ? "opacity-70" : ""} ${tahnuti === p.id ? "bg-accent-soft/60 outline-dashed outline-2 outline-accent" : ""}`}>
              {tahnuti === p.id && <p className="text-center font-medium text-accent">Pusť soubory — přidají se ke smlouvě a AI ji znovu posoudí</p>}
              <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                <div>Platnost: <strong>{dateCz(p.od)} – {p.do ? dateCz(p.do) : "na dobu neurčitou"}</strong></div>
                {p.cisloSmlouvy && <div>Smlouva č.: <strong>{p.cisloSmlouvy}</strong></div>}
                <div>Pojistné: <strong>{czk(p.castka)} {FREKVENCE[p.frekvence as Frekvence]?.nazev}</strong> <span className="text-ink-muted">= {czk(p.castka * zaRok(p.frekvence))}/rok</span></div>
                {(() => {
                  const pristi = pristiSplatnost({ id: p.id, pojistovna: p.pojistovna, od: p.od, do: p.do, frekvence: p.frekvence, castka: p.castka, splatnost: p.splatnost, zmeny: p.zmeny }, dnes());
                  return (
                    <div>Splatnost: <strong>{p.splatnost ? `${Number(p.splatnost.slice(8))}. ${Number(p.splatnost.slice(5, 7))}.` : "k začátku pojištění"}</strong>
                      {pristi && <span className={pristi <= new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10) ? " font-medium text-warn" : " text-ink-muted"}> · příští platba {dateCz(pristi)}</span>}</div>
                  );
                })()}
                {p.pojistnaCastka != null && (
                  <div>Pojistná částka: <strong>{czk(p.pojistnaCastka)}</strong>
                    {kryti != null && <span className={kryti < 0.6 ? " text-bad" : kryti < 0.85 ? " text-warn" : " text-ink-muted"}> ({Math.round(kryti * 100)} % hodnoty nemovitosti)</span>}</div>
                )}
              </div>
              {p.poznamka && <p className="text-ink-secondary">{p.poznamka}</p>}

              {zmeny.length > 1 && (
                <details className="text-xs text-ink-secondary">
                  <summary className="cursor-pointer text-accent">Historie pojistného ({zmeny.length})</summary>
                  <ul className="mt-1 space-y-0.5 pl-3">
                    {zmeny.map((z) => (
                      <li key={z.id} className="flex items-center gap-3">
                        <span className="tabular-nums">od {dateCz(z.validFrom)}</span>
                        <strong className="tabular-nums">{czk(z.castka)}</strong>
                        {canEdit && zmeny.length > 1 && <button type="button" className="text-ink-muted hover:text-bad" disabled={bezi}
                          onClick={() => { if (confirm("Smazat tuto výši pojistného?")) spust(async () => vysledek(await smazZmenuPojistneho(propertyId, z.id))); }}>✕</button>}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-ink-secondary">Smlouva:</span>
                {p.smlouvy.length === 0 && <span className="text-ink-muted">nenahraná</span>}
                {p.smlouvy.map((s, i) => (
                  <span key={s.id} className="inline-flex items-center gap-1">
                    <a href={`/api/soubory/${s.id}`} target="_blank" rel="noreferrer" className="text-accent hover:underline" title={s.nazev}>📄 {s.mime === "application/pdf" ? "PDF" : "strana"}{p.smlouvy.length > 1 ? ` ${i + 1}` : ""}</a>
                    {canEdit && <button type="button" className="text-xs text-ink-muted hover:text-bad" aria-label="Odebrat" disabled={bezi}
                      onClick={() => { if (confirm("Odebrat soubor smlouvy? Na Disku půjde do koše.")) spust(async () => vysledek(await smazSmlouvu(propertyId, s.id))); }}>✕</button>}
                  </span>
                ))}
                {canEdit && diskPripojen && <button type="button" className="text-accent hover:underline" disabled={bezi} onClick={() => { setKPojistce(p.id); vstup.current?.click(); }}>+ nahrát smlouvu</button>}
                {canEdit && aiZapnuto && p.smlouvy.length > 0 && (
                  <button type="button" className="btn py-1 text-xs" disabled={bezi}
                    onClick={() => spust(async () => { setHlaska({ ok: true, text: "AI prochází smlouvu… (může trvat i minutu)" }); vysledek(await rozeberSmlouvu(propertyId, p.id)); })}>
                    {ai ? "Znovu posoudit AI" : "Posoudit smlouvu AI"}
                  </button>
                )}
              </div>

              {ai && <RozborAi ai={ai} kdy={p.aiAt} />}

              {canEdit && (
                <div className="flex flex-wrap gap-4 border-t border-line/70 pt-2 text-sm">
                  <button type="button" className="text-accent hover:underline" onClick={() => { setHlaska(null); setForm({
                    id: p.id, pojistovna: p.pojistovna, cisloSmlouvy: p.cisloSmlouvy ?? "", druh: p.druh, od: p.od, do: p.do, frekvence: p.frekvence,
                    castka: String(p.castka).replace(".", ","), pojistnaCastka: p.pojistnaCastka != null ? String(p.pojistnaCastka) : "", poznamka: p.poznamka ?? "",
                    castkaOd: dnes(), puvodniCastka: p.castka, splatnost: p.splatnost,
                  }); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Upravit / změnit cenu</button>
                  {!p.do && <button type="button" className="text-accent hover:underline" onClick={() => setUkoncit({ id: p.id, do: dnes() })}>Ukončit</button>}
                  <button type="button" className="text-bad hover:underline" disabled={bezi}
                    onClick={() => { if (confirm("Smazat pojistku i se smlouvou a předpisy pojistného?")) spust(async () => vysledek(await smazPojistku(propertyId, p.id))); }}>Smazat</button>
                </div>
              )}
              {ukoncit?.id === p.id && (
                <div className="flex flex-wrap items-end gap-2 rounded-lg bg-surface-sunken/60 p-2">
                  <DatumPole label="Pojištění končí ke dni" name={`poj-konec-${p.id}`} defaultValue={ukoncit.do ?? ""} onChange={(d) => setUkoncit((u) => u && { ...u, do: d })} />
                  <button type="button" className="btn btn-primary" disabled={bezi || !ukoncit.do}
                    onClick={() => spust(async () => { const r = await ukonciPojistku(propertyId, p.id, ukoncit.do!); vysledek(r); if (!r.error) setUkoncit(null); })}>Ukončit</button>
                  <button type="button" className="btn" onClick={() => setUkoncit(null)}>Zrušit</button>
                </div>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

/** Vysledek rozboru smlouvy AI: hodnoceni, dulezite udaje, rizika, vyluky. */
export function RozborAi({ ai, kdy }: { ai: RozborPojistky; kdy: string | null }) {
  const udaje: [string, string | null][] = [
    ["Pojistná částka stavby", ai.pojistnaCastkaNemovitost != null ? czk(ai.pojistnaCastkaNemovitost) : null],
    ["Pojistná částka domácnosti", ai.pojistnaCastkaDomacnost != null ? czk(ai.pojistnaCastkaDomacnost) : null],
    ["Limit odpovědnosti", ai.limitOdpovednosti != null ? czk(ai.limitOdpovednosti) : null],
    ["Spoluúčast", ai.spoluucast != null ? czk(ai.spoluucast) : null],
    ["Roční pojistné", ai.rocniPojistne != null ? czk(ai.rocniPojistne) : null],
    ["Splatnost", ai.splatnost ? dateCz(ai.splatnost) : null],
    ["Plnění", ai.pojisteniNaNovou == null ? null : ai.pojisteniNaNovou ? "v nové ceně" : "v časové ceně"],
  ];
  return (
    <div className="space-y-3 rounded-xl border border-line bg-surface-sunken/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Rozbor AI</span>
        <Badge tone={TON[ai.hodnoceni.stav]}>{POPIS_STAVU[ai.hodnoceni.stav]}</Badge>
        {kdy && <span className="text-xs text-ink-muted">{dateCz(kdy)}</span>}
      </div>
      <p>{ai.shrnuti}</p>
      {ai.hodnoceni.body.length > 0 && (
        <ul className="space-y-1">
          {ai.hodnoceni.body.map((b, i) => (
            <li key={i} className={`rounded-lg px-2 py-1 ${b.uroven === "PROBLEM" ? "bg-bad/10 text-bad" : b.uroven === "POZOR" ? "bg-warn/10 text-warn" : "bg-good/10 text-good"}`}>
              {b.uroven === "OK" ? "✓" : "!"} {b.text}
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-x-6 gap-y-0.5 text-xs sm:grid-cols-3">
        {udaje.filter(([, v]) => v).map(([k, v]) => <div key={k}><span className="text-ink-muted">{k}:</span> <strong>{v}</strong></div>)}
      </div>
      <details>
        <summary className="cursor-pointer text-xs text-accent">Kryté riziko po riziku ({ai.rizika.filter((r) => r.kryto === "ANO").length} z {ai.rizika.length})</summary>
        <table className="mt-1 w-full text-xs">
          <tbody>
            {ai.rizika.map((r) => (
              <tr key={r.riziko} className="border-t border-line/50">
                <td className="py-1 pr-2">{RIZIKA[r.riziko] ?? r.riziko}</td>
                <td className={`py-1 pr-2 font-semibold ${r.kryto === "ANO" ? "text-good" : r.kryto === "NE" ? "text-bad" : "text-warn"}`}>{r.kryto === "ANO" ? "✓ kryto" : r.kryto === "NE" ? "✗ nekryto" : "? nejasné"}</td>
                <td className="py-1 text-ink-muted">{[r.limit != null ? `limit ${czk(r.limit)}` : null, r.poznamka].filter(Boolean).join(" · ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      {ai.dulezite.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs text-accent">Důležité ze smlouvy ({ai.dulezite.length})</summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-ink-secondary">{ai.dulezite.map((d, i) => <li key={i}>{d}</li>)}</ul>
        </details>
      )}
      {ai.vyluky.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs text-accent">Výluky a podmínky ({ai.vyluky.length})</summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-ink-secondary">{ai.vyluky.map((d, i) => <li key={i}>{d}</li>)}</ul>
        </details>
      )}
      <p className="text-[11px] text-ink-muted">Rozbor je podklad k posouzení — rozhodující je text smlouvy a pojistných podmínek.</p>
    </div>
  );
}
