"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { prectiUctenku, smazObdobi, smazPolozku, ulozObdobi, ulozPolozku } from "@/lib/kratkodobyActions";
import { KATEGORIE_KRATKODOBE, categoryLabel } from "@/lib/categories";
import { czk, dateCz } from "@/lib/format";
import { Card } from "./Stat";
import { DatumPole } from "./DatumPole";
import { Ikona } from "./Ikony";

interface Obdobi { id: string; od: string; do: string | null; poznamka: string | null }
interface Polozka { id: string; datum: string; castka: number; kategorie: string; popis: string | null; uctenky: { id: string; nazev: string; mime: string }[] }
interface Soubor { data: string; mime: string; nazev: string; nahled: string | null }

const dnes = () => new Date().toISOString().slice(0, 10);
const MESICE = ["leden", "únor", "březen", "duben", "květen", "červen", "červenec", "srpen", "září", "říjen", "listopad", "prosinec"];
const vydaje = KATEGORIE_KRATKODOBE.filter((k) => k.kind === "EXPENSE");

/** Fotka z telefonu se zmensi (delsi strana 1600 px, JPEG) — na AI i na Disk to staci. */
async function nactiSoubor(f: File): Promise<Soubor> {
  if (f.type === "application/pdf") {
    const b = new Uint8Array(await f.arrayBuffer());
    let s = "";
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
    return { data: btoa(s), mime: "application/pdf", nazev: f.name, nahled: null };
  }
  const url = URL.createObjectURL(f);
  try {
    const img = await new Promise<HTMLImageElement>((ok, chyba) => { const i = new Image(); i.onload = () => ok(i); i.onerror = chyba; i.src = url; });
    const k = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    const dataUrl = c.toDataURL("image/jpeg", 0.82);
    return { data: dataUrl.split(",")[1], mime: "image/jpeg", nazev: f.name.replace(/\.[^.]+$/, "") + ".jpg", nahled: dataUrl };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Krátkodobý pronájem: období (kdy se byt pronajímá přes Airbnb a podobně), náklady
 * s účtenkami (fotka → AI vyplní) a příjmy. Bez smluv a nájemníků.
 */
export function KratkodobyPronajem({ propertyId, canEdit, aiZapnuto, diskPripojen, obdobi, polozky }: {
  propertyId: string; canEdit: boolean; aiZapnuto: boolean; diskPripojen: boolean;
  obdobi: Obdobi[]; polozky: Polozka[];
}) {
  const [bezi, spust] = useTransition();
  const [hlaska, setHlaska] = useState<{ ok: boolean; text: string } | null>(null);
  const vysledek = (r: { error?: string; success?: string }) => setHlaska(r.error ? { ok: false, text: r.error } : r.success ? { ok: true, text: r.success } : null);

  // Obdobi
  const [noveObdobi, setNoveObdobi] = useState<{ id?: string; od: string | null; do: string | null; poznamka: string } | null>(null);

  // Formular polozky
  const [form, setForm] = useState<{ prijem: boolean; datum: string | null; castka: string; kategorie: string; popis: string; soubor: Soubor | null } | null>(null);
  const [ctu, setCtu] = useState(false);
  const vstup = useRef<HTMLInputElement>(null);
  const formular = useRef<HTMLDivElement>(null);
  const otevriFormular = (f: NonNullable<typeof form>) => { setForm(f); setTimeout(() => formular.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); };

  const vyberUctenku = async (f: File | undefined) => {
    if (!f) return;
    setHlaska(null);
    let s: Soubor;
    try { s = await nactiSoubor(f); } catch { setHlaska({ ok: false, text: "Soubor se nepodařilo načíst — zkus fotku znovu." }); return; }
    if (s.data.length * 0.75 > 2_600_000) { setHlaska({ ok: false, text: "PDF je moc velké (max. 2,5 MB)." }); return; }
    otevriFormular({ prijem: false, datum: dnes(), castka: "", kategorie: "", popis: "", soubor: s });
    if (!aiZapnuto) return;
    setCtu(true);
    const r = await prectiUctenku({ data: s.data, mime: s.mime });
    setCtu(false);
    if (r.error) { setHlaska({ ok: false, text: r.error }); return; }
    const u = r.uctenka!;
    setForm((x) => x && ({
      ...x, datum: u.datum ?? x.datum, castka: u.castka != null ? String(u.castka).replace(".", ",") : x.castka,
      kategorie: u.kategorie ?? x.kategorie, popis: [u.obchod, u.popis].filter(Boolean).join(" – ") || x.popis,
    }));
  };

  const uloz = () => {
    if (!form) return;
    const castka = Number(form.castka.replace(/\s/g, "").replace(",", "."));
    spust(async () => {
      const r = await ulozPolozku(propertyId, {
        datum: form.datum ?? "", castka, kategorie: form.prijem ? "KT_PRIJEM" : form.kategorie, popis: form.popis,
        soubor: form.soubor ? { data: form.soubor.data, mime: form.soubor.mime, nazev: form.soubor.nazev } : null,
      });
      vysledek(r);
      if (!r.error || r.error.startsWith("Zapsáno")) setForm(null);
    });
  };

  // Prehled po mesicich za vybrany rok
  const roky = useMemo(() => [...new Set([new Date().getFullYear(), ...polozky.map((p) => Number(p.datum.slice(0, 4)))])].sort((a, b) => b - a), [polozky]);
  const [rok, setRok] = useState(roky[0]);
  const vRoce = polozky.filter((p) => p.datum.startsWith(String(rok)));
  const mesice = MESICE.map((nazev, i) => {
    const m = vRoce.filter((p) => Number(p.datum.slice(5, 7)) === i + 1);
    return { nazev, prijmy: m.filter((p) => p.castka > 0).reduce((a, p) => a + p.castka, 0), naklady: m.filter((p) => p.castka < 0).reduce((a, p) => a - p.castka, 0) };
  });
  const prijmy = mesice.reduce((a, m) => a + m.prijmy, 0), naklady = mesice.reduce((a, m) => a + m.naklady, 0);
  const podleKategorii = vydaje.map((k) => ({ k, castka: vRoce.filter((p) => p.kategorie === k.key).reduce((a, p) => a - p.castka, 0) })).filter((x) => x.castka > 0).sort((a, b) => b.castka - a.castka);
  const aktivni = obdobi.find((o) => o.od <= dnes() && (!o.do || o.do >= dnes()));

  return (
    <div className="space-y-5">
      {hlaska && <p className={`rounded-lg px-3 py-2 text-sm ${hlaska.ok ? "bg-good/10 text-good" : "bg-bad/10 text-bad"}`}>{hlaska.text}</p>}

      {/* Obdobi */}
      <Card title="Krátkodobý pronájem" action={canEdit && !noveObdobi ? <button type="button" className="btn text-xs" onClick={() => setNoveObdobi({ od: dnes(), do: null, poznamka: "" })}>+ Období</button> : undefined}>
        <p className="mb-3 text-sm text-ink-secondary">
          {aktivni ? <>Byt se teď pronajímá <strong>krátkodobě</strong> (od {dateCz(aktivni.od)}).</> : obdobi.length ? "Teď se byt pronajímá dlouhodobě." : "Byt se pronajímá dlouhodobě. Přidej období, kdy jde přes Airbnb, Booking a podobně."}
          {" "}Bez smluv a nájemníků — jen příjmy a náklady s účtenkami.
        </p>
        {obdobi.length > 0 && (
          <ul className="divide-y divide-line/70 rounded-xl border border-line">
            {obdobi.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <span>
                  <span className="font-medium tabular-nums">{dateCz(o.od)} – {o.do ? dateCz(o.do) : "dosud"}</span>
                  {o.poznamka && <span className="text-ink-muted"> · {o.poznamka}</span>}
                </span>
                {canEdit && (
                  <span className="flex gap-3 text-xs">
                    <button type="button" className="text-accent hover:underline" onClick={() => setNoveObdobi({ id: o.id, od: o.od, do: o.do, poznamka: o.poznamka ?? "" })}>Upravit</button>
                    <button type="button" className="text-bad hover:underline" onClick={() => { if (confirm("Smazat období? Zapsané příjmy a náklady zůstanou.")) spust(async () => vysledek(await smazObdobi(propertyId, o.id))); }}>Smazat</button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {noveObdobi && (
          <div className="mt-3 grid gap-3 rounded-xl bg-surface-sunken/60 p-3 sm:grid-cols-3">
            <DatumPole label="Od" name="kt-od" defaultValue={noveObdobi.od ?? ""} onChange={(d) => setNoveObdobi((x) => x && { ...x, od: d })} />
            <DatumPole label="Do (prázdné = dosud)" name="kt-do" defaultValue={noveObdobi.do ?? ""} onChange={(d) => setNoveObdobi((x) => x && { ...x, do: d })} />
            <div>
              <label className="label mb-1.5 block" htmlFor="kt-pozn">Poznámka</label>
              <input id="kt-pozn" className="input" placeholder="např. Airbnb" value={noveObdobi.poznamka} onChange={(e) => setNoveObdobi((x) => x && { ...x, poznamka: e.target.value })} />
            </div>
            <div className="flex gap-2 sm:col-span-3">
              <button type="button" className="btn btn-primary" disabled={bezi || !noveObdobi.od}
                onClick={() => spust(async () => { const r = await ulozObdobi(propertyId, { id: noveObdobi.id, od: noveObdobi.od!, do: noveObdobi.do, poznamka: noveObdobi.poznamka }); vysledek(r); if (!r.error) setNoveObdobi(null); })}>Uložit</button>
              <button type="button" className="btn" onClick={() => setNoveObdobi(null)}>Zrušit</button>
            </div>
          </div>
        )}
      </Card>

      {/* Zapis */}
      {canEdit && (
        <Card title="Zapsat náklad nebo příjem">
          <input ref={vstup} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { void vyberUctenku(e.target.files?.[0]); e.target.value = ""; }} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary inline-flex items-center gap-2" onClick={() => vstup.current?.click()}>
              <Ikona nazev="kamera" trida="h-4 w-4" /> Vyfotit / nahrát účtenku
            </button>
            <button type="button" className="btn" onClick={() => otevriFormular({ prijem: false, datum: dnes(), castka: "", kategorie: "", popis: "", soubor: null })}>Náklad bez účtenky</button>
            <button type="button" className="btn" onClick={() => otevriFormular({ prijem: true, datum: dnes(), castka: "", kategorie: "KT_PRIJEM", popis: "", soubor: null })}>Příjem</button>
          </div>
          <p className="mt-2 text-xs text-ink-muted">
            {aiZapnuto ? "Z fotky účtenky AI přečte datum, částku a obchod a navrhne kategorii — jen to zkontroluješ." : "Čtení účtenek AI není zapnuté (chybí ANTHROPIC_API_KEY ve Vercelu) — údaje vyplníš ručně."}
            {!diskPripojen && " Google Disk není připojený, účtenky se neuloží (připoj ho ve Správě)."}
            {" "}Výplaty z Airbnb a Bookingu přiřaď na stránce Banka — příště už se spárují samy.
          </p>

          {form && (
            <div ref={formular} className="mt-4 scroll-mt-24 rounded-xl border border-accent/40 bg-accent-soft/30 p-3 sm:p-4">
              <div className="flex flex-col gap-4 sm:flex-row">
                {form.soubor && (
                  <div className="shrink-0 sm:w-48">
                    {form.soubor.nahled
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={form.soubor.nahled} alt="Účtenka" className="max-h-64 w-full rounded-lg object-contain sm:max-h-72" />
                      : <div className="flex h-24 items-center justify-center rounded-lg bg-surface-sunken text-sm text-ink-secondary">PDF · {form.soubor.nazev}</div>}
                    {ctu && <p className="mt-2 text-center text-xs font-medium text-accent">AI čte účtenku…</p>}
                  </div>
                )}
                <div className="grid flex-1 gap-3 sm:grid-cols-2">
                  <div className="flex gap-1 sm:col-span-2">
                    {[false, true].map((p) => (
                      <button key={String(p)} type="button" onClick={() => setForm((x) => x && { ...x, prijem: p, kategorie: p ? "KT_PRIJEM" : x.kategorie === "KT_PRIJEM" ? "" : x.kategorie })}
                        className={`rounded-full px-3 py-1 text-sm font-medium ${form.prijem === p ? "bg-accent text-white" : "bg-surface-sunken text-ink-secondary"}`}>{p ? "Příjem" : "Náklad"}</button>
                    ))}
                  </div>
                  <DatumPole key={`d${form.datum}`} label="Datum" name="kt-datum" defaultValue={form.datum ?? ""} onChange={(d) => setForm((x) => x && { ...x, datum: d })} />
                  <div>
                    <label className="label mb-1.5 block" htmlFor="kt-castka">Částka (Kč)</label>
                    <input id="kt-castka" inputMode="decimal" className="input text-right tabular-nums" value={form.castka} disabled={ctu}
                      onChange={(e) => setForm((x) => x && { ...x, castka: e.target.value })} />
                  </div>
                  {!form.prijem && (
                    <div>
                      <label className="label mb-1.5 block" htmlFor="kt-kat">Kategorie</label>
                      <select id="kt-kat" className="input" value={form.kategorie} disabled={ctu} onChange={(e) => setForm((x) => x && { ...x, kategorie: e.target.value })}>
                        <option value="">Vyber…</option>
                        {vydaje.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
                      </select>
                    </div>
                  )}
                  <div className={form.prijem ? "" : ""}>
                    <label className="label mb-1.5 block" htmlFor="kt-popis">Popis</label>
                    <input id="kt-popis" className="input" placeholder={form.prijem ? "např. výplata Airbnb" : "např. Lidl – drogerie"} value={form.popis} disabled={ctu}
                      onChange={(e) => setForm((x) => x && { ...x, popis: e.target.value })} />
                  </div>
                  <div className="flex gap-2 sm:col-span-2">
                    <button type="button" className="btn btn-primary" disabled={bezi || ctu || !form.datum || !form.castka || (!form.prijem && !form.kategorie)} onClick={uloz}>
                      {bezi ? "Ukládám…" : "Uložit"}
                    </button>
                    <button type="button" className="btn" onClick={() => setForm(null)}>Zrušit</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Prehled */}
      <Card title="Přehled" action={roky.length > 1 ? (
        <select className="input w-auto py-1 text-sm" value={rok} onChange={(e) => setRok(Number(e.target.value))}>{roky.map((r) => <option key={r} value={r}>{r}</option>)}</select>
      ) : <span className="text-sm text-ink-muted">{rok}</span>}>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div><div className="text-xs text-ink-muted">Příjmy</div><div className="text-lg font-semibold tabular-nums text-good">{czk(prijmy)}</div></div>
          <div><div className="text-xs text-ink-muted">Náklady</div><div className="text-lg font-semibold tabular-nums text-bad">{czk(naklady)}</div></div>
          <div><div className="text-xs text-ink-muted">Výsledek</div><div className={`text-lg font-semibold tabular-nums ${prijmy - naklady >= 0 ? "text-good" : "text-bad"}`}>{czk(prijmy - naklady)}</div></div>
        </div>
        {(prijmy > 0 || naklady > 0) && (
          <div className="mt-4 grid gap-5 lg:grid-cols-2">
            <div className="table-scroll">
              <table className="table-base">
                <thead><tr><th>Měsíc</th><th className="num">Příjmy</th><th className="num">Náklady</th><th className="num">Výsledek</th></tr></thead>
                <tbody>
                  {mesice.map((m) => (m.prijmy || m.naklady) ? (
                    <tr key={m.nazev}><td>{m.nazev}</td><td className="num">{czk(m.prijmy)}</td><td className="num">{czk(m.naklady)}</td>
                      <td className={`num font-medium ${m.prijmy - m.naklady >= 0 ? "text-good" : "text-bad"}`}>{czk(m.prijmy - m.naklady)}</td></tr>
                  ) : null)}
                </tbody>
              </table>
            </div>
            {podleKategorii.length > 0 && (
              <ul className="space-y-1.5 text-sm">
                {podleKategorii.map(({ k, castka }) => (
                  <li key={k.key}>
                    <div className="flex justify-between gap-3"><span>{k.label}</span><span className="tabular-nums">{czk(castka)}</span></div>
                    <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-surface-sunken"><div className="h-full rounded-full bg-accent" style={{ width: `${(castka / naklady) * 100}%` }} /></div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <p className="mt-3 text-xs text-ink-muted">Krátkodobé ubytování se daní podle § 7 (podnikání), ne jako nájem — na stránce Daně je zvlášť.</p>
      </Card>

      {/* Pohyby */}
      <Card title={`Příjmy a náklady ${rok}`}>
        {vRoce.length === 0 ? (
          <p className="py-3 text-center text-sm text-ink-muted">Zatím nic zapsaného.</p>
        ) : (
          <ul className="divide-y divide-line/70">
            {vRoce.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="w-20 shrink-0 tabular-nums text-ink-secondary">{dateCz(p.datum)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{p.popis || categoryLabel(p.kategorie)}</span>
                  <span className="block text-xs text-ink-muted">
                    {categoryLabel(p.kategorie)}
                    {p.uctenky.map((u) => <a key={u.id} href={`/api/soubory/${u.id}`} target="_blank" rel="noreferrer" className="ml-2 text-accent hover:underline">účtenka</a>)}
                  </span>
                </span>
                <span className={`shrink-0 font-medium tabular-nums ${p.castka >= 0 ? "text-good" : ""}`}>{p.castka >= 0 ? "+" : "−"}{czk(Math.abs(p.castka))}</span>
                {canEdit && (
                  <button type="button" className="shrink-0 text-ink-muted hover:text-bad" aria-label="Smazat" title="Smazat (i s účtenkou)"
                    onClick={() => { if (confirm("Smazat položku i s účtenkou?")) spust(async () => vysledek(await smazPolozku(propertyId, p.id))); }}>
                    <Ikona nazev="kos" trida="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
