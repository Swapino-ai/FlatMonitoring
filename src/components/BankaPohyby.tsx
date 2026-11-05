"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ignorovatPohyb, vratitKeKontrole, priraditKratkodoby, priraditPohyb, priraditVydaj, stahnoutZBanky, ulozPoznamkuPohybu, zrusitParovani } from "@/lib/bankaActions";
import { czk, dateCz } from "@/lib/format";
import { Card } from "./Stat";
import { Ikona } from "./Ikony";

export interface PohybRadek {
  id: string;
  datum: string;
  castka: number;
  protiucet: string | null;
  nazevProtiuctu: string | null;
  vs: string | null;
  zprava: string | null;
  poznamka: string | null;
  navrhLeaseId: string | null;
  propertyId: string | null;
  smlouva: string | null;
  /** Navrh cile odchozi platby (predpis / vratka / vydaj) */
  navrhCil?: string | null;
  /** Vlastni poznamka uzivatele */
  mojePoznamka?: string | null;
  parovani: { klic: string; castka: number }[] | { vyuctovani: string; cislo: string } | { kratkodoby: string } | { vydaj: string; cislo?: string; transakce?: string } | null;
}

/** Kam jde platbu u nemovitosti priradit */
export interface CileNemovitosti {
  id: string; nazev: string; adresa: string; kratkodoby: boolean;
  smlouvy: { id: string; nazev: string }[];
  predpisy: { cil: string; nazev: string }[];
  /** Vsechny sluzby jednoho dodavatele za mesic jednou platbou */
  skupiny?: { cil: string; nazev: string; detail: string }[];
  vratky: { cil: string; nazev: string }[];
}
type Kategorie = { key: string; label: string };

const bezDiakritiky = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

type Moznost = { value: string; label: string; detail?: string };
type Skupina = { label?: string; moznosti: Moznost[] };

/**
 * Vyber s hledanim: po kliknuti ukaze cely seznam (po skupinach), psanim se filtruje
 * (bez diakritiky, v nazvu i v nazvu skupiny). Sipky + Enter vybiraji, Esc zavre.
 */
function HledaciVyber({ skupiny, value, onChange, placeholder, label, className = "" }: {
  skupiny: Skupina[]; value: string; onChange: (v: string) => void; placeholder: string; label: string; className?: string;
}) {
  const [text, setText] = useState("");
  const [otevreno, setOtevreno] = useState(false);
  const [aktivni, setAktivni] = useState(0);
  const vybrana = skupiny.flatMap((s) => s.moznosti).find((m) => m.value === value);
  const q = bezDiakritiky(text.trim());
  const filtr = skupiny
    .map((s) => ({ ...s, moznosti: q ? s.moznosti.filter((m) => bezDiakritiky(`${m.label} ${m.detail ?? ""} ${s.label ?? ""}`).includes(q)) : s.moznosti }))
    .filter((s) => s.moznosti.length);
  const ploche = filtr.flatMap((s) => s.moznosti);
  const vyber = (m: Moznost) => { onChange(m.value); setText(""); setOtevreno(false); };
  let i = -1;
  return (
    <div className={`relative ${className}`}>
      <input className="input w-full py-1.5 text-sm" aria-label={label} role="combobox" aria-expanded={otevreno}
        placeholder={vybrana ? vybrana.label : placeholder}
        value={otevreno ? text : vybrana?.label ?? ""}
        onFocus={() => { setOtevreno(true); setText(""); setAktivni(0); }}
        onBlur={() => setTimeout(() => setOtevreno(false), 150)}
        onChange={(e) => { setText(e.target.value); setOtevreno(true); setAktivni(0); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setAktivni((a) => Math.min(a + 1, ploche.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setAktivni((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter" && ploche[aktivni]) { e.preventDefault(); vyber(ploche[aktivni]); (e.target as HTMLInputElement).blur(); }
          else if (e.key === "Escape") (e.target as HTMLInputElement).blur();
        }} />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-muted">▾</span>
      {otevreno && (
        <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-xl border border-line bg-surface-card py-1 shadow-lg" role="listbox">
          {filtr.map((s, si) => (
            <li key={si}>
              {s.label && <p className="px-3 pb-0.5 pt-2 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{s.label}</p>}
              <ul>
                {s.moznosti.map((m) => {
                  i++;
                  const idx = i;
                  return (
                    <li key={m.value}>
                      <button type="button" role="option" aria-selected={m.value === value}
                        className={`block w-full px-3 py-1.5 text-left text-sm ${idx === aktivni ? "bg-accent-soft" : "hover:bg-accent-soft"} ${m.value === value ? "font-semibold" : ""}`}
                        onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setAktivni(idx)} onClick={() => vyber(m)}>
                        {m.label}{m.detail && <span className="block text-xs text-ink-muted">{m.detail}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
          {!ploche.length && <li className="px-3 py-1.5 text-sm text-ink-muted">Nic nenalezeno.</li>}
        </ul>
      )}
    </div>
  );
}

/**
 * Prirazeni platby: nejdriv nemovitost (hledani podle nazvu a adresy), pak co platba je —
 * stejne kategorie jako na strance Pohyby, u prichozi i najemci, u odchozi nezaplacene predpisy.
 */
function Prirazeni({ p, cile, kategorie, vychoziNemovitost, vychoziCil, bezi, onSparuj }: {
  p: PohybRadek; cile: CileNemovitosti[]; kategorie: { prijmy: Kategorie[]; vydaje: Kategorie[] };
  vychoziNemovitost: string | null; vychoziCil: string; bezi: boolean; onSparuj: (cil: string) => void;
}) {
  const odchozi = p.castka < 0;
  const [nemId, setNemId] = useState<string | null>(vychoziNemovitost);
  const [cil, setCil] = useState(vychoziCil);
  const n = cile.find((c) => c.id === nemId) ?? null;
  if (!n) {
    return (
      <HledaciVyber className="w-full sm:w-80" label="Nemovitost" placeholder="Nemovitost — vyber nebo hledej…" value=""
        skupiny={[{ moznosti: cile.map((c) => ({ value: c.id, label: c.nazev, detail: c.adresa || undefined })) }]}
        onChange={(v) => { setNemId(v); setCil(""); }} />
    );
  }
  const skupiny: Skupina[] = odchozi
    ? [
        { label: "Služby (za dodavatele a měsíc)", moznosti: (n.skupiny ?? []).map((x) => ({ value: x.cil, label: x.nazev, detail: x.detail })) },
        { label: "Splátky úvěru", moznosti: n.predpisy.filter((x) => x.cil.includes(":uver:")).map((x) => ({ value: x.cil, label: x.nazev })) },
        { label: "Služby bez dodavatele", moznosti: n.predpisy.filter((x) => x.cil.includes(":sluzba:")).map((x) => ({ value: x.cil, label: x.nazev })) },
        { label: "Nedoplatky z vyúčtování dodavatele", moznosti: n.predpisy.filter((x) => x.cil.includes(":vyuctovani:")).map((x) => ({ value: x.cil, label: x.nazev })) },
        { label: "Vrácení přeplatku nájemci", moznosti: n.vratky.map((x) => ({ value: x.cil, label: x.nazev })) },
        { label: "Výdaj", moznosti: kategorie.vydaje.map((k) => ({ value: `vydaj:${n.id}:${k.key}`, label: k.label })) },
      ]
    : [
        { label: "Nájem a zálohy od nájemce", moznosti: n.smlouvy.map((x) => ({ value: `lease:${x.id}`, label: x.nazev })) },
        { label: "Krátkodobý pronájem", moznosti: [{ value: `kt:${n.id}`, label: "Výplata Airbnb, Booking…" }] },
        { label: "Příjem", moznosti: kategorie.prijmy.map((k) => ({ value: `vydaj:${n.id}:${k.key}`, label: k.label })) },
      ];
  return (
    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
      <button type="button" className="rounded-full bg-accent-soft px-3 py-1 text-sm font-medium text-accent" title="Změnit nemovitost"
        onClick={() => { setNemId(null); setCil(""); }}>{n.nazev} ✕</button>
      <HledaciVyber className="w-full sm:w-72" label="Co platba je" placeholder="Co to je… (vyber nebo hledej)" value={cil} onChange={setCil}
        skupiny={skupiny.filter((s) => s.moznosti.length)} />
      <button type="button" className="btn btn-primary py-1.5" disabled={!cil || bezi} onClick={() => onSparuj(cil)}>Spárovat</button>
    </div>
  );
}

const POPIS_PREDPISU: Record<string, string> = { sluzba: "platba služby", uver: "splátka úvěru", vyuctovani: "nedoplatek z vyúčtování dodavatele" };

/** Vlastni poznamka k platbe: klik otevre pole, ulozi se po opusteni */
function Poznamka({ p, onUloz }: { p: PohybRadek; onUloz: (text: string) => void }) {
  const [uprava, setUprava] = useState(false);
  if (!uprava) {
    return p.mojePoznamka
      ? <button type="button" className="mt-0.5 block text-left text-xs italic text-ink-secondary hover:text-ink-primary" title="Upravit poznámku" onClick={() => setUprava(true)}>✎ {p.mojePoznamka}</button>
      : <button type="button" className="mt-0.5 block text-xs text-accent hover:underline" onClick={() => setUprava(true)}>+ poznámka</button>;
  }
  return (
    <input autoFocus className="input mt-1 w-full py-1 text-xs" defaultValue={p.mojePoznamka ?? ""} placeholder="Poznámka k platbě…" maxLength={500}
      onBlur={(e) => { setUprava(false); if (e.target.value.trim() !== (p.mojePoznamka ?? "")) onUloz(e.target.value); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setUprava(false); }} />
  );
}

/** Popis, co platba uhradila: "nájem 3/2026, zálohy 3/2026" nebo "vyúčtování VN-2026-0001". */
function coUhradila(p: PohybRadek["parovani"]): string {
  if (!p) return "";
  if ("kratkodoby" in p) return "příjem z krátkodobého pronájmu";
  if ("vydaj" in p) {
    const [typ, , ...k] = p.vydaj.split(":");
    if (typ === "vratka") return `vrácení přeplatku${p.cislo ? ` ${p.cislo}` : ""}`;
    if (typ === "vydaj") return `kategorie: ${k[0] ?? ""}`;
    if (typ === "skupina") return `služby ${k.slice(1).join(":")} ${Number((k[0] ?? "").slice(5))}/${(k[0] ?? "").slice(0, 4)}`;
    const [druh, , mesic] = k;
    return `${POPIS_PREDPISU[druh] ?? "předpis"}${mesic && /^\d{4}-\d{2}$/.test(mesic) ? ` ${Number(mesic.slice(5))}/${mesic.slice(0, 4)}` : ""}`;
  }
  if (!Array.isArray(p)) return `nedoplatek z vyúčtování ${p.cislo}`;
  return p.map((x) => {
    const [druh, , mesic] = x.klic.split(":");
    return `${druh === "najem" ? "nájem" : "zálohy"} ${Number(mesic.slice(5, 7))}/${mesic.slice(0, 4)}`;
  }).join(", ");
}

/** Pohyby z banky: stazeni, kontrola nesparovanych a prehled sparovanych. */
export function BankaPohyby({ napojeno, posledniStazeni, pocty, keKontrole, sparovane, ignorovane = [], cile = [], kategorie = { prijmy: [], vydaje: [] }, kategorieNazvy = {} }: {
  cile?: CileNemovitosti[];
  kategorie?: { prijmy: Kategorie[]; vydaje: Kategorie[] };
  /** Klic kategorie -> nazev (do popisu sparovanych vydaju) */
  kategorieNazvy?: Record<string, string>;
  /** Stare props (uz se nepouzivaji) */
  kratkodobe?: { id: string; nazev: string }[];
  napojeno: boolean;
  posledniStazeni: string | null;
  pocty: Record<string, number>;
  keKontrole: PohybRadek[];
  sparovane: PohybRadek[];
  /** Ignorovane platby (jdou zobrazit a i tak zaradit) */
  ignorovane?: PohybRadek[];
  smlouvy?: { id: string; nazev: string }[];
}) {
  const [bezi, spust] = useTransition();
  const [hlaska, setHlaska] = useState<{ ok: boolean; text: string } | null>(null);

  const akce = (f: () => Promise<{ error?: string; success?: string }>) => spust(async () => {
    const r = await f();
    setHlaska(r.error ? { ok: false, text: r.error } : r.success ? { ok: true, text: r.success } : null);
  });
  const router = useRouter();
  // Vyrizene radky zmizi hned (nezavisle na obnove stranky); chyba se ukaze primo u platby
  const [vyrizene, setVyrizene] = useState<Set<string>>(new Set());
  const [chybaRadku, setChybaRadku] = useState<{ id: string; text: string } | null>(null);
  const vyrid = (id: string, f: () => Promise<{ error?: string; success?: string }>) => spust(async () => {
    setChybaRadku(null);
    try {
      const r = await f();
      if (r.error) { setChybaRadku({ id, text: r.error }); return; }
      setVyrizene((v) => new Set(v).add(id));
      setHlaska(r.success ? { ok: true, text: r.success } : null);
      router.refresh();
    } catch {
      setChybaRadku({ id, text: "Nepodařilo se uložit — zkus to znovu." });
    }
  });
  const zbyva = keKontrole.filter((p) => !vyrizene.has(p.id));
  const zbyvaIgnorovane = ignorovane.filter((p) => !vyrizene.has(p.id));
  // Zobrazovat ignorovane platby (pamatuje si prohlizec)
  const [ukazIgnorovane, setUkazIgnorovane] = useState(false);
  useEffect(() => { try { setUkazIgnorovane(localStorage.getItem("banka:ignorovane") === "1"); } catch { /* bez uloziste */ } }, []);
  const prepniIgnorovane = (v: boolean) => { setUkazIgnorovane(v); try { localStorage.setItem("banka:ignorovane", v ? "1" : "0"); } catch { /* bez uloziste */ } };
  const radek = (p: PohybRadek, ignorovany: boolean) => {
              const odchozi = p.castka < 0;
              // Navrh: smlouva (prichozi) nebo cil (odchozi) urci i nemovitost
              const navrhNem = odchozi
                ? (p.navrhCil?.startsWith("predpis:") || p.navrhCil?.startsWith("vydaj:") || p.navrhCil?.startsWith("skupina:") ? p.navrhCil.split(":")[1] : null)
                : cile.find((c) => c.smlouvy.some((x) => x.id === p.navrhLeaseId))?.id ?? null;
              const navrh = odchozi ? p.navrhCil ?? "" : p.navrhLeaseId ? `lease:${p.navrhLeaseId}` : "";
              return (
                <li key={p.id} className={`flex flex-wrap items-start gap-x-4 gap-y-2 py-3 ${ignorovany ? "opacity-80" : ""}`}>
                  <div className="min-w-[14rem] flex-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <strong className={`tabular-nums ${odchozi ? "text-bad" : "text-good"}`}>{odchozi ? "−" : "+"}{czk(Math.abs(p.castka))}</strong>
                      <span className="text-sm text-ink-muted">{dateCz(p.datum)}</span>
                      <span className="text-xs text-ink-muted">{odchozi ? "odchozí" : "příchozí"}</span>
                    </div>
                    <div className="text-sm">{platce(p)}</div>
                    <div className="text-xs text-ink-muted">{[p.vs && `VS ${p.vs}`, p.zprava].filter(Boolean).join(" · ")}</div>
                    {p.poznamka && <div className="mt-0.5 text-xs text-warn">{p.poznamka}</div>}
                    <Poznamka p={p} onUloz={(t) => akce(async () => { await ulozPoznamkuPohybu(p.id, t); return {}; })} />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Prirazeni p={p} cile={cile} kategorie={kategorie} vychoziNemovitost={navrhNem} vychoziCil={navrh} bezi={bezi}
                      onSparuj={(cil) => vyrid(p.id, () => cil.startsWith("lease:") ? priraditPohyb(p.id, cil.slice(6))
                        : cil.startsWith("kt:") ? priraditKratkodoby(p.id, cil.slice(3)) : priraditVydaj(p.id, cil))} />
                    {ignorovany
                      ? <button type="button" className="btn py-1.5" disabled={bezi} onClick={() => vyrid(p.id, () => vratitKeKontrole(p.id))}>Vrátit ke kontrole</button>
                      : <button type="button" className="btn py-1.5" disabled={bezi} onClick={() => vyrid(p.id, () => ignorovatPohyb(p.id))}>Ignorovat</button>}
                  </div>
                  {chybaRadku?.id === p.id && <p className="w-full rounded-lg bg-bad/10 px-3 py-1.5 text-sm text-bad">{chybaRadku.text}</p>}
                </li>
              );
  };

  const platce = (p: PohybRadek) => [p.nazevProtiuctu, p.protiucet].filter(Boolean).join(" · ") || "neznámý účet";

  return (
    <div className="space-y-5">
      <Card title="Fio banka" action={napojeno ? (
        <button type="button" className="btn btn-primary" disabled={bezi} onClick={() => akce(stahnoutZBanky)}>
          {bezi ? "Stahuji…" : "Stáhnout pohyby"}
        </button>
      ) : undefined}>
        {napojeno ? (
          <p className="text-sm text-ink-secondary">
            Pohyby se stahují a párují samy každou noc; tlačítkem hned.
            {posledniStazeni && <> Naposledy uloženy nové pohyby {dateCz(posledniStazeni)}.</>}
            {" "}Spárováno {pocty.SPAROVANO ?? 0}, ke kontrole {pocty.KE_KONTROLE ?? 0}, ignorováno {pocty.IGNOROVANO ?? 0}.
          </p>
        ) : (
          <div className="space-y-2 text-sm">
            <p className="font-medium">Účet Fio zatím není napojený.</p>
            <ol className="list-decimal space-y-1 pl-5 text-ink-secondary">
              <li>V internetbankingu Fio: <strong>Nastavení → API → Přidat nový token</strong>, oprávnění <strong>„Pouze sledovat účet“</strong>.</li>
              <li>Token vlož ve Vercelu do <strong>Settings → Environment Variables</strong> jako <code>FIO_TOKEN</code> (Production) a aplikaci znovu nasaď.</li>
              <li>Pro noční párování ho vlož i do GitHubu: <strong>Settings → Secrets → Actions</strong> jako <code>FIO_TOKEN</code>.</li>
            </ol>
            <p className="text-xs text-ink-muted">Token umí jen číst pohyby — platby s ním odeslat nejde. Do chatu ani nikam jinam ho nevkládej.</p>
          </div>
        )}
        {hlaska && <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${hlaska.ok ? "bg-good/10 text-good" : "bg-bad/10 text-bad"}`}>{hlaska.text}</p>}
      </Card>

      <Card title={`Ke kontrole (${zbyva.length})`}>
        {zbyva.length === 0 ? (
          <p className="py-3 text-center text-sm text-ink-muted">Vše spárováno.</p>
        ) : (
          <ul className="divide-y divide-line/70">
            {zbyva.map((p) => radek(p, false))}
          </ul>
        )}
        <p className="mt-2 text-xs text-ink-muted">Po spárování si aplikace účet zapamatuje — další platby z něj (příchozí i odchozí) se spárují samy.</p>
        <label className="mt-3 flex w-fit cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-[var(--accent,#2563eb)]" checked={ukazIgnorovane} onChange={(e) => prepniIgnorovane(e.target.checked)} />
          Zobrazovat ignorované platby ({zbyvaIgnorovane.length})
        </label>
      </Card>

      {ukazIgnorovane && (
        <Card title={`Ignorované (${zbyvaIgnorovane.length})`}>
          {zbyvaIgnorovane.length === 0 ? (
            <p className="py-3 text-center text-sm text-ink-muted">Žádné ignorované platby.</p>
          ) : (
            <ul className="divide-y divide-line/70">{zbyvaIgnorovane.map((p) => radek(p, true))}</ul>
          )}
          <p className="mt-2 text-xs text-ink-muted">Ignorovanou platbu jde i tak zařadit (spárovat), nebo vrátit ke kontrole.</p>
        </Card>
      )}

      <Card title="Spárované platby">
        {sparovane.length === 0 ? (
          <p className="py-3 text-center text-sm text-ink-muted">Zatím nic.</p>
        ) : (
          <div className="table-scroll">
            <table className="table-base">
              <thead>
                <tr><th>Datum</th><th>Plátce / příjemce</th><th>Uhrazeno</th><th className="num">Částka</th><th className="w-10"><span className="sr-only">Akce</span></th></tr>
              </thead>
              <tbody>
                {sparovane.map((p) => (
                  <tr key={p.id}>
                    <td className="whitespace-nowrap tabular-nums">{dateCz(p.datum)}</td>
                    <td>
                      <div className="font-medium">{p.smlouva ?? platce(p)}</div>
                      <div className="text-xs text-ink-muted">{platce(p)}{p.vs ? ` · VS ${p.vs}` : ""}</div>
                    </td>
                    <td className="text-sm">
                      {(() => { const t = coUhradila(p.parovani); const m = /^kategorie: (.+)$/.exec(t); return m ? kategorieNazvy[m[1]] ?? m[1] : t; })()}
                      {p.poznamka && <div className="text-xs text-warn">{p.poznamka}</div>}
                      <Poznamka p={p} onUloz={(t) => akce(async () => { await ulozPoznamkuPohybu(p.id, t); return {}; })} />
                      {p.propertyId && <div><Link href={`/properties/${p.propertyId}?list=pohyby`} className="text-xs text-accent hover:underline">nemovitost →</Link></div>}
                    </td>
                    <td className={`num font-medium tabular-nums ${p.castka < 0 ? "text-bad" : ""}`}>{czk(p.castka)}</td>
                    <td className="text-right">
                      <button type="button" className="text-ink-muted hover:text-bad" title="Zrušit párování" aria-label="Zrušit párování"
                        onClick={() => { if (confirm("Zrušit párování? Uhrazené předpisy budou zase nezaplacené.")) { setVyrizene((v) => { const n = new Set(v); n.delete(p.id); return n; }); akce(async () => { await zrusitParovani(p.id); return {}; }); }; }}>
                        <Ikona nazev="kos" trida="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
