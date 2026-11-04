"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { nahrajFotkuVykazu, smazFotkuVykazu, smazVykaz, ulozVykaz } from "@/lib/vykazActions";
import { dateCz } from "@/lib/format";
import { Card } from "./Stat";
import { DatumPole } from "./DatumPole";
import { Galerie } from "./Galerie";
import { Ikona } from "./Ikony";

export interface ZaznamVykazu { id: string; datum: string; kdo: string; minut: number; popis: string; fotky: { id: string; nazev: string }[] }
interface Fotka { data: string; mime: string; nahled: string }

const dnes = () => new Date().toISOString().slice(0, 10);
const MESICE = ["Leden", "Únor", "Březen", "Duben", "Květen", "Červen", "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec"];
const RYCHLE = [30, 60, 120, 240, 480];

/** 90 → "1 h 30 min" */
export const casText = (minut: number) => {
  const h = Math.floor(minut / 60), m = minut % 60;
  return [h ? `${h} h` : "", m ? `${m} min` : ""].filter(Boolean).join(" ") || "0 min";
};

/** Fotka z telefonu se zmensi (delsi strana 1600 px, JPEG), aby se rychle nahrala. */
async function zmensi(f: File): Promise<Fotka> {
  const url = URL.createObjectURL(f);
  try {
    const img = await new Promise<HTMLImageElement>((ok, chyba) => { const i = new Image(); i.onload = () => ok(i); i.onerror = chyba; i.src = url; });
    const k = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    const dataUrl = c.toDataURL("image/jpeg", 0.8);
    return { data: dataUrl.split(",")[1], mime: "image/jpeg", nahled: dataUrl };
  } finally {
    URL.revokeObjectURL(url);
  }
}

type Formular = { id?: string; datum: string | null; kdo: string; hodiny: string; minuty: string; popis: string; fotky: Fotka[] };

/**
 * Vykaz prace na byte: kdo pracoval, kolik casu, co udelal a fotky z telefonu.
 * Delane hlavne pro mobil — velka tlacitka, rychla volba casu, fotky rovnou z fotoaparatu.
 */
export function VykazPrace({ propertyId, canEdit, diskPripojen, zaznamy }: {
  propertyId: string; canEdit: boolean; diskPripojen: boolean; zaznamy: ZaznamVykazu[];
}) {
  const [bezi, spust] = useTransition();
  const [hlaska, setHlaska] = useState<{ ok: boolean; text: string } | null>(null);
  const [form, setForm] = useState<Formular | null>(null);
  const [nahravam, setNahravam] = useState<string | null>(null);
  const [galerie, setGalerie] = useState<{ fotky: ZaznamVykazu["fotky"]; index: number } | null>(null);
  const vstupFotek = useRef<HTMLInputElement>(null);
  const vstupKZaznamu = useRef<HTMLInputElement>(null);
  const [kZaznamu, setKZaznamu] = useState<string | null>(null);
  const formular = useRef<HTMLDivElement>(null);

  const lide = useMemo(() => [...new Set(zaznamy.map((z) => z.kdo))], [zaznamy]);
  const novy = (): Formular => ({ datum: dnes(), kdo: lide[0] ?? "", hodiny: "", minuty: "", popis: "", fotky: [] });
  const otevri = (f: Formular) => { setForm(f); setHlaska(null); setTimeout(() => formular.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); };

  const pridejFotky = async (soubory: FileList | null) => {
    if (!soubory?.length) return;
    const nove: Fotka[] = [];
    for (const f of Array.from(soubory)) {
      try { nove.push(await zmensi(f)); } catch { setHlaska({ ok: false, text: `Fotku ${f.name} se nepodařilo načíst.` }); }
    }
    setForm((x) => x && { ...x, fotky: [...x.fotky, ...nove] });
  };

  /** Nahraje fotky po jedne (kazda je samostatny pozadavek); vraci pocet chyb. */
  const nahraj = async (vykazId: string, fotky: Fotka[], od = 1) => {
    let chyb = 0;
    for (let i = 0; i < fotky.length; i++) {
      setNahravam(`Nahrávám fotku ${i + 1} z ${fotky.length}…`);
      const r = await nahrajFotkuVykazu(propertyId, vykazId, { data: fotky[i].data, mime: fotky[i].mime }, od + i);
      if (r.error) { chyb++; setHlaska({ ok: false, text: r.error }); }
    }
    setNahravam(null);
    return chyb;
  };

  const uloz = () => {
    if (!form) return;
    const minut = (Number(form.hodiny.replace(",", ".")) || 0) * 60 + (Number(form.minuty) || 0);
    spust(async () => {
      const r = await ulozVykaz(propertyId, { id: form.id, datum: form.datum ?? "", kdo: form.kdo, minut, popis: form.popis });
      if (r.error || !r.id) { setHlaska({ ok: false, text: r.error ?? "Nepodařilo se uložit." }); return; }
      const puvodni = zaznamy.find((z) => z.id === r.id)?.fotky.length ?? 0;
      const chyb = form.fotky.length ? await nahraj(r.id, form.fotky, puvodni + 1) : 0;
      setForm(null);
      if (!chyb) setHlaska({ ok: true, text: form.id ? "Záznam upraven." : "Práce zapsána." });
    });
  };

  const fotkyKZaznamu = async (soubory: FileList | null) => {
    const id = kZaznamu;
    if (!id || !soubory?.length) return;
    const fotky: Fotka[] = [];
    for (const f of Array.from(soubory)) { try { fotky.push(await zmensi(f)); } catch { /* preskocit */ } }
    spust(async () => {
      const chyb = await nahraj(id, fotky, (zaznamy.find((z) => z.id === id)?.fotky.length ?? 0) + 1);
      if (!chyb) setHlaska({ ok: true, text: fotky.length === 1 ? "Fotka přidána." : `Přidáno ${fotky.length} fotek.` });
    });
  };

  // Souhrn: kolik casu kdo stravil (tento mesic a rok)
  const mesic = dnes().slice(0, 7), rok = dnes().slice(0, 4);
  const souhrn = lide.map((kdo) => ({
    kdo,
    mesic: zaznamy.filter((z) => z.kdo === kdo && z.datum.startsWith(mesic)).reduce((a, z) => a + z.minut, 0),
    rok: zaznamy.filter((z) => z.kdo === kdo && z.datum.startsWith(rok)).reduce((a, z) => a + z.minut, 0),
  })).filter((x) => x.rok > 0);
  const poMesicich = useMemo(() => {
    const m = new Map<string, ZaznamVykazu[]>();
    for (const z of zaznamy) m.set(z.datum.slice(0, 7), [...(m.get(z.datum.slice(0, 7)) ?? []), z]);
    return [...m.entries()];
  }, [zaznamy]);
  const minutFormu = form ? (Number(form.hodiny.replace(",", ".")) || 0) * 60 + (Number(form.minuty) || 0) : 0;

  return (
    <div className="space-y-5">
      {hlaska && <p className={`rounded-lg px-3 py-2 text-sm ${hlaska.ok ? "bg-good/10 text-good" : "bg-bad/10 text-bad"}`}>{hlaska.text}</p>}
      <input ref={vstupKZaznamu} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => { void fotkyKZaznamu(e.target.files); e.target.value = ""; }} />

      {canEdit && !form && (
        <button type="button" className="btn btn-primary w-full py-3 text-base sm:w-auto" onClick={() => otevri(novy())}>+ Zapsat práci</button>
      )}

      {form && (
        <div ref={formular} className="scroll-mt-32">
          <Card title={form.id ? "Upravit záznam" : "Zapsat práci"}>
            <div className="grid gap-4 sm:grid-cols-2">
              <DatumPole label="Kdy" name="vykaz-datum" defaultValue={form.datum ?? ""} onChange={(d) => setForm((x) => x && { ...x, datum: d })} />
              <div>
                <label className="label mb-1.5 block" htmlFor="vykaz-kdo">Kdo pracoval</label>
                <input id="vykaz-kdo" className="input" list="vykaz-lide" autoComplete="off" placeholder="Jméno" value={form.kdo}
                  onChange={(e) => setForm((x) => x && { ...x, kdo: e.target.value })} />
                <datalist id="vykaz-lide">{lide.map((l) => <option key={l} value={l} />)}</datalist>
                {lide.length > 1 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {lide.slice(0, 6).map((l) => (
                      <button key={l} type="button" onClick={() => setForm((x) => x && { ...x, kdo: l })}
                        className={`rounded-full border px-3 py-1 text-sm ${form.kdo === l ? "border-accent bg-accent-soft text-accent" : "border-line"}`}>{l}</button>
                    ))}
                  </div>
                )}
              </div>
              <div className="sm:col-span-2">
                <span className="label mb-1.5 block">Kolik času</span>
                <div className="flex flex-wrap gap-1.5">
                  {RYCHLE.map((m) => (
                    <button key={m} type="button" onClick={() => setForm((x) => x && { ...x, hodiny: String(Math.floor(m / 60) || ""), minuty: String(m % 60 || "") })}
                      className={`rounded-full border px-3.5 py-1.5 text-sm ${minutFormu === m ? "border-accent bg-accent-soft text-accent" : "border-line"}`}>{casText(m)}</button>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <input className="input w-20 text-center" inputMode="decimal" placeholder="0" aria-label="Hodiny" value={form.hodiny}
                    onChange={(e) => setForm((x) => x && { ...x, hodiny: e.target.value.replace(/[^\d,.]/g, "") })} />
                  <span className="text-sm text-ink-secondary">h</span>
                  <input className="input w-20 text-center" inputMode="numeric" placeholder="0" aria-label="Minuty" value={form.minuty}
                    onChange={(e) => setForm((x) => x && { ...x, minuty: e.target.value.replace(/\D/g, "") })} />
                  <span className="text-sm text-ink-secondary">min</span>
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="label mb-1.5 block" htmlFor="vykaz-popis">Co se udělalo</label>
                <textarea id="vykaz-popis" className="input min-h-[6rem]" placeholder="např. výměna baterie v koupelně, vymalování kuchyně" value={form.popis}
                  onChange={(e) => setForm((x) => x && { ...x, popis: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <input ref={vstupFotek} type="file" accept="image/*" multiple className="hidden"
                  onChange={(e) => { void pridejFotky(e.target.files); e.target.value = ""; }} />
                {diskPripojen ? (
                  <button type="button" className="btn inline-flex w-full items-center justify-center gap-2 py-2.5 sm:w-auto" onClick={() => vstupFotek.current?.click()}>
                    <Ikona nazev="kamera" trida="h-4 w-4" /> Vyfotit / přidat fotky
                  </button>
                ) : <p className="text-xs text-ink-muted">Fotky jde nahrát po připojení Google Disku (Nastavení).</p>}
                {form.id && (zaznamy.find((z) => z.id === form.id)?.fotky.length ?? 0) > 0 && (
                  <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {zaznamy.find((z) => z.id === form.id)!.fotky.map((f) => (
                      <div key={f.id} className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/soubory/${f.id}`} alt="" loading="lazy" className="aspect-square w-full rounded-lg object-cover" />
                        <button type="button" aria-label="Smazat fotku" disabled={bezi} className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs text-white"
                          onClick={() => { if (confirm("Smazat tuto fotku?")) spust(async () => { await smazFotkuVykazu(propertyId, f.id); }); }}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
                {form.fotky.length > 0 && (
                  <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {form.fotky.map((f, i) => (
                      <div key={i} className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={f.nahled} alt={`Fotka ${i + 1}`} className="aspect-square w-full rounded-lg object-cover" />
                        <button type="button" aria-label="Odebrat fotku" className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs text-white"
                          onClick={() => setForm((x) => x && { ...x, fotky: x.fotky.filter((_, j) => j !== i) })}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {nahravam && <p className="mt-3 text-sm text-ink-secondary">{nahravam}</p>}
            <div className="mt-4 flex gap-2">
              <button type="button" className="btn btn-primary flex-1 py-2.5 sm:flex-none" disabled={bezi || !form.datum || !form.kdo.trim() || !form.popis.trim() || minutFormu <= 0} onClick={uloz}>
                {bezi ? "Ukládám…" : "Uložit"}
              </button>
              <button type="button" className="btn py-2.5" disabled={bezi} onClick={() => setForm(null)}>Zrušit</button>
            </div>
          </Card>
        </div>
      )}

      {souhrn.length > 0 && (
        <Card title="Kolik kdo odpracoval">
          <ul className="divide-y divide-line/70 text-sm">
            {souhrn.map((s) => (
              <li key={s.kdo} className="flex items-center justify-between gap-3 py-2">
                <span className="font-medium">{s.kdo}</span>
                <span className="text-right tabular-nums text-ink-secondary">
                  tento měsíc <strong className="text-ink-primary">{casText(s.mesic)}</strong> · {rok} <strong className="text-ink-primary">{casText(s.rok)}</strong>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {zaznamy.length === 0 && !form && <p className="py-6 text-center text-sm text-ink-muted">Zatím žádná zapsaná práce.</p>}

      {poMesicich.map(([m, polozky]) => (
        <Card key={m} title={`${MESICE[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`}
          action={<span className="text-sm tabular-nums text-ink-muted">{casText(polozky.reduce((a, z) => a + z.minut, 0))}</span>}>
          <ul className="divide-y divide-line/70">
            {polozky.map((z) => (
              <li key={z.id} className="py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="text-sm"><strong>{z.kdo}</strong> <span className="text-ink-muted">· {dateCz(z.datum)}</span></span>
                  <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-sm font-semibold tabular-nums text-accent">{casText(z.minut)}</span>
                </div>
                <p className="mt-1 whitespace-pre-line text-sm text-ink-secondary">{z.popis}</p>
                {z.fotky.length > 0 && (
                  <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                    {z.fotky.map((f, i) => (
                      <button key={f.id} type="button" className="shrink-0" onClick={() => setGalerie({ fotky: z.fotky, index: i })} aria-label={`Fotka ${i + 1}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/soubory/${f.id}`} alt="" loading="lazy" className="h-20 w-20 rounded-lg object-cover sm:h-24 sm:w-24" />
                      </button>
                    ))}
                  </div>
                )}
                {canEdit && (
                  <div className="mt-2 flex flex-wrap gap-4 text-sm">
                    {diskPripojen && <button type="button" className="text-accent hover:underline" disabled={bezi} onClick={() => { setKZaznamu(z.id); vstupKZaznamu.current?.click(); }}>+ fotky</button>}
                    <button type="button" className="text-accent hover:underline" onClick={() => otevri({ id: z.id, datum: z.datum, kdo: z.kdo, hodiny: String(Math.floor(z.minut / 60) || ""), minuty: String(z.minut % 60 || ""), popis: z.popis, fotky: [] })}>Upravit</button>
                    <button type="button" className="text-bad hover:underline" disabled={bezi}
                      onClick={() => { if (confirm("Smazat záznam i s fotkami?")) spust(async () => { const r = await smazVykaz(propertyId, z.id); if (r.error) setHlaska({ ok: false, text: r.error }); }); }}>Smazat</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      ))}

      {galerie && (
        <Galerie polozky={galerie.fotky.map((f) => ({ src: `/api/soubory/${f.id}` }))} rovnou={galerie.index} onZavrit={() => setGalerie(null)} />
      )}
    </div>
  );
}
