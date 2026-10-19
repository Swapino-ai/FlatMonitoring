"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ignorovatPohyb, priraditPohyb, stahnoutZBanky, zrusitParovani } from "@/lib/bankaActions";
import { czk, dateCz } from "@/lib/format";
import { Badge, Card } from "./Stat";
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
  parovani: { klic: string; castka: number }[] | { vyuctovani: string; cislo: string } | null;
}

/** Popis, co platba uhradila: "nájem 3/2026, zálohy 3/2026" nebo "vyúčtování VN-2026-0001". */
function coUhradila(p: PohybRadek["parovani"]): string {
  if (!p) return "";
  if (!Array.isArray(p)) return `nedoplatek z vyúčtování ${p.cislo}`;
  return p.map((x) => {
    const [druh, , mesic] = x.klic.split(":");
    return `${druh === "najem" ? "nájem" : "zálohy"} ${Number(mesic.slice(5, 7))}/${mesic.slice(0, 4)}`;
  }).join(", ");
}

/** Pohyby z banky: stazeni, kontrola nesparovanych a prehled sparovanych. */
export function BankaPohyby({ napojeno, posledniStazeni, pocty, keKontrole, sparovane, smlouvy }: {
  napojeno: boolean;
  posledniStazeni: string | null;
  pocty: Record<string, number>;
  keKontrole: PohybRadek[];
  sparovane: PohybRadek[];
  smlouvy: { id: string; nazev: string }[];
}) {
  const [bezi, spust] = useTransition();
  const [hlaska, setHlaska] = useState<{ ok: boolean; text: string } | null>(null);
  const [volba, setVolba] = useState<Record<string, string>>({});

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
            {" "}Spárováno {pocty.SPAROVANO ?? 0}, ke kontrole {pocty.KE_KONTROLE ?? 0}, výdaje {pocty.VYDAJ ?? 0}, ignorováno {pocty.IGNOROVANO ?? 0}.
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
              const vybrana = volba[p.id] ?? p.navrhLeaseId ?? "";
              return (
                <li key={p.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 py-3">
                  <div className="min-w-[14rem] flex-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <strong className="tabular-nums text-good">+{czk(p.castka)}</strong>
                      <span className="text-sm text-ink-muted">{dateCz(p.datum)}</span>
                    </div>
                    <div className="text-sm">{platce(p)}</div>
                    <div className="text-xs text-ink-muted">{[p.vs && `VS ${p.vs}`, p.zprava].filter(Boolean).join(" · ")}</div>
                    {p.poznamka && <div className="mt-0.5 text-xs text-warn">{p.poznamka}</div>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select className="input w-64 py-1.5 text-sm" value={vybrana} onChange={(e) => setVolba((v) => ({ ...v, [p.id]: e.target.value }))}>
                      <option value="">Vyber nájemce…</option>
                      {smlouvy.map((s) => <option key={s.id} value={s.id}>{s.nazev}{s.id === p.navrhLeaseId ? " (návrh)" : ""}</option>)}
                    </select>
                    <button type="button" className="btn btn-primary py-1.5" disabled={!vybrana || bezi} onClick={() => akce(() => priraditPohyb(p.id, vybrana))}>Spárovat</button>
                    <button type="button" className="btn py-1.5" disabled={bezi} onClick={() => akce(async () => { await ignorovatPohyb(p.id); return {}; })}>Ignorovat</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-2 text-xs text-ink-muted">Po spárování si aplikace účet plátce zapamatuje — další platby z něj se spárují samy.</p>
      </Card>

      <Card title="Spárované platby">
        {sparovane.length === 0 ? (
          <p className="py-3 text-center text-sm text-ink-muted">Zatím nic.</p>
        ) : (
          <div className="table-scroll">
            <table className="table-base">
              <thead>
                <tr><th>Datum</th><th>Plátce</th><th>Uhrazeno</th><th className="num">Částka</th><th className="w-10"><span className="sr-only">Akce</span></th></tr>
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
                      {coUhradila(p.parovani)}
                      {p.poznamka && <div className="text-xs text-warn">{p.poznamka}</div>}
                      {p.propertyId && <div><Link href={`/properties/${p.propertyId}?list=pohyby`} className="text-xs text-accent hover:underline">nemovitost →</Link></div>}
                    </td>
                    <td className="num font-medium tabular-nums">{czk(p.castka)}</td>
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
      {Object.keys(pocty).length > 0 && <p className="text-xs text-ink-muted"><Badge>{pocty.VYDAJ ?? 0}</Badge> odchozích plateb (výdaje) se zatím nepárují.</p>}
    </div>
  );
}
