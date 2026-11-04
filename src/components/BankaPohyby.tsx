"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ignorovatPohyb, priraditKratkodoby, priraditPohyb, priraditVydaj, stahnoutZBanky, ulozPoznamkuPohybu, zrusitParovani } from "@/lib/bankaActions";
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
  vratky: { cil: string; nazev: string }[];
}
type Kategorie = { key: string; label: string };

const bezDiakritiky = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

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
  const [hledat, setHledat] = useState("");
  const [cil, setCil] = useState(vychoziCil);
  const n = cile.find((c) => c.id === nemId) ?? null;
  const shody = hledat.trim()
    ? cile.filter((c) => bezDiakritiky(`${c.nazev} ${c.adresa}`).includes(bezDiakritiky(hledat.trim()))).slice(0, 8)
    : [];
  if (!n) {
    return (
      <div className="relative w-full sm:w-80">
        <input className="input py-1.5 text-sm" placeholder="Nemovitost — hledej podle názvu nebo adresy…" value={hledat}
          onChange={(e) => setHledat(e.target.value)} aria-label="Nemovitost" />
        {shody.length > 0 && (
          <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-xl border border-line bg-surface-card py-1 shadow-lg">
            {shody.map((c) => (
              <li key={c.id}>
                <button type="button" className="block w-full px-3 py-1.5 text-left text-sm hover:bg-accent-soft"
                  onClick={() => { setNemId(c.id); setHledat(""); setCil(""); }}>
                  <span className="font-medium">{c.nazev}</span>{c.adresa && <span className="block text-xs text-ink-muted">{c.adresa}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
        {hledat.trim() && !shody.length && <p className="mt-1 text-xs text-ink-muted">Nic nenalezeno.</p>}
      </div>
    );
  }
  return (
    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
      <button type="button" className="rounded-full bg-accent-soft px-3 py-1 text-sm font-medium text-accent" title="Změnit nemovitost"
        onClick={() => { setNemId(null); setCil(""); }}>{n.nazev} ✕</button>
      <select className="input w-full py-1.5 text-sm sm:w-72" value={cil} onChange={(e) => setCil(e.target.value)} aria-label="Co platba je">
        <option value="">Co to je…</option>
        {odchozi ? (
          <>
            {n.predpisy.length > 0 && <optgroup label="Nezaplacené předpisy">{n.predpisy.map((x) => <option key={x.cil} value={x.cil}>{x.nazev}</option>)}</optgroup>}
            {n.vratky.length > 0 && <optgroup label="Vrácení přeplatku nájemci">{n.vratky.map((x) => <option key={x.cil} value={x.cil}>{x.nazev}</option>)}</optgroup>}
            <optgroup label="Výdaj">{kategorie.vydaje.map((k) => <option key={k.key} value={`vydaj:${n.id}:${k.key}`}>{k.label}</option>)}</optgroup>
          </>
        ) : (
          <>
            {n.smlouvy.length > 0 && <optgroup label="Nájem a zálohy od nájemce">{n.smlouvy.map((x) => <option key={x.id} value={`lease:${x.id}`}>{x.nazev}</option>)}</optgroup>}
            <optgroup label="Krátkodobý pronájem"><option value={`kt:${n.id}`}>Výplata Airbnb, Booking…</option></optgroup>
            <optgroup label="Příjem">{kategorie.prijmy.map((k) => <option key={k.key} value={`vydaj:${n.id}:${k.key}`}>{k.label}</option>)}</optgroup>
          </>
        )}
      </select>
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
export function BankaPohyby({ napojeno, posledniStazeni, pocty, keKontrole, sparovane, cile = [], kategorie = { prijmy: [], vydaje: [] }, kategorieNazvy = {} }: {
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
  smlouvy?: { id: string; nazev: string }[];
}) {
  const [bezi, spust] = useTransition();
  const [hlaska, setHlaska] = useState<{ ok: boolean; text: string } | null>(null);

  const akce = (f: () => Promise<{ error?: string; success?: string }>) => spust(async () => {
    const r = await f();
    setHlaska(r.error ? { ok: false, text: r.error } : r.success ? { ok: true, text: r.success } : null);
  });

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

      <Card title={`Ke kontrole (${keKontrole.length})`}>
        {keKontrole.length === 0 ? (
          <p className="py-3 text-center text-sm text-ink-muted">Vše spárováno.</p>
        ) : (
          <ul className="divide-y divide-line/70">
            {keKontrole.map((p) => {
              const odchozi = p.castka < 0;
              // Navrh: smlouva (prichozi) nebo cil (odchozi) urci i nemovitost
              const navrhNem = odchozi
                ? (p.navrhCil?.startsWith("predpis:") || p.navrhCil?.startsWith("vydaj:") ? p.navrhCil.split(":")[1] : null)
                : cile.find((c) => c.smlouvy.some((x) => x.id === p.navrhLeaseId))?.id ?? null;
              const navrh = odchozi ? p.navrhCil ?? "" : p.navrhLeaseId ? `lease:${p.navrhLeaseId}` : "";
              return (
                <li key={p.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 py-3">
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
                      onSparuj={(cil) => akce(() => cil.startsWith("lease:") ? priraditPohyb(p.id, cil.slice(6))
                        : cil.startsWith("kt:") ? priraditKratkodoby(p.id, cil.slice(3)) : priraditVydaj(p.id, cil))} />
                    <button type="button" className="btn py-1.5" disabled={bezi} onClick={() => akce(async () => { await ignorovatPohyb(p.id); return {}; })}>Ignorovat</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-2 text-xs text-ink-muted">Po spárování si aplikace účet zapamatuje — další platby z něj (příchozí i odchozí) se spárují samy.</p>
      </Card>

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
                        onClick={() => { if (confirm("Zrušit párování? Uhrazené předpisy budou zase nezaplacené.")) akce(async () => { await zrusitParovani(p.id); return {}; }); }}>
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
