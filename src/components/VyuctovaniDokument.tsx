"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { czk, dateCz } from "@/lib/format";
import { spayd } from "@/lib/platba";
import { variabilniSymbol, type SnapshotVyuctovani } from "@/lib/vyuctovaniVydane";
import { Ikona } from "./Ikony";

const obdobi = (od: string, doDne: string) => `${dateCz(od)} – ${dateCz(doDne)}`;

function Strana({ titulek, children }: { titulek: string; children: React.ReactNode }) {
  return (
    <div className="break-inside-avoid rounded-xl border border-line px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-accent">{titulek}</div>
      <div className="mt-1 text-sm">{children}</div>
    </div>
  );
}

/**
 * Vyuctovani sluzeb pro najemce — stejny dokument pro nahled pred vydanim i pro
 * vydane (zmrazene) vyuctovani. Pri tisku zustane jen on.
 */
export function VyuctovaniDokument({ s, cislo, vydano, splatnost, koncept = false }: {
  s: SnapshotVyuctovani;
  /** Cislo dokladu; bez nej je to nahled pred vydanim. */
  cislo?: string | null;
  vydano?: string | null;
  splatnost?: string | null;
  koncept?: boolean;
}) {
  const nedoplatek = s.rozdil <= -1;
  const preplatek = s.rozdil >= 1;
  const vs = cislo ? variabilniSymbol(cislo) : undefined;

  // QR platba jen u nedoplatku a jen kdyz pronajimatel ma platny ucet
  const [qr, setQr] = useState<string | null>(null);
  const platba = nedoplatek && s.pronajimatel?.ucet
    ? spayd({ ucet: s.pronajimatel.ucet, castka: Math.abs(s.rozdil), vs, zprava: `Vyuctovani sluzeb ${s.od} az ${s.do}` })
    : null;
  useEffect(() => {
    let zruseno = false;
    if (!platba) { setQr(null); return; }
    QRCode.toDataURL(platba, { margin: 1, width: 220, errorCorrectionLevel: "M" })
      .then((u) => { if (!zruseno) setQr(u); })
      .catch(() => { if (!zruseno) setQr(null); });
    return () => { zruseno = true; };
  }, [platba]);

  return (
    <article className="vyuctovani-tisk mx-auto max-w-[780px] rounded-2xl border border-line bg-surface-card p-6 shadow-card sm:p-9">
      <header className="border-b-2 border-accent pb-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
              {koncept ? "Náhled — zatím nevydáno" : "Vyúčtování"}
            </div>
            <h3 className="mt-1 text-2xl font-bold tracking-tight">Vyúčtování služeb</h3>
            <p className="mt-0.5 text-sm text-ink-secondary tabular-nums">za období {obdobi(s.od, s.do)}</p>
          </div>
          <div className="text-right text-sm">
            {cislo && <div className="text-base font-bold tabular-nums">{cislo}</div>}
            {vydano && <div className="text-xs text-ink-muted">Vydáno {dateCz(vydano)}</div>}
          </div>
        </div>
      </header>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Strana titulek="Nemovitost">
          <div className="font-medium">{s.nemovitost.nazev}</div>
          <div className="text-xs text-ink-muted">{s.nemovitost.adresa}</div>
        </Strana>
        <Strana titulek="Nájemce">
          <div className="font-medium">{s.najemce.name}</div>
          {s.najemce.adresa && <div className="text-xs text-ink-muted">{s.najemce.adresa}</div>}
        </Strana>
        <Strana titulek="Pronajímatel">
          {s.pronajimatel ? (
            <>
              <div className="font-medium">{s.pronajimatel.name}</div>
              {s.pronajimatel.adresa && <div className="text-xs text-ink-muted">{s.pronajimatel.adresa}</div>}
              {(s.pronajimatel.ico || s.pronajimatel.dic) && (
                <div className="text-xs text-ink-muted">{[s.pronajimatel.ico && `IČO ${s.pronajimatel.ico}`, s.pronajimatel.dic && `DIČ ${s.pronajimatel.dic}`].filter(Boolean).join(" · ")}</div>
              )}
            </>
          ) : <div className="text-xs text-ink-muted">neuveden</div>}
        </Strana>
      </div>

      <table className="mt-5 w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-ink-muted">
            <th className="py-1.5 font-medium">Služba</th>
            <th className="py-1.5 text-right font-medium">Váš podíl</th>
          </tr>
        </thead>
        <tbody>
          {s.radky.map((x) => (
            <tr key={x.sluzbaId} className="break-inside-avoid border-b border-line/60 align-top">
              <td className="py-2">
                <div className="font-medium">{x.nazev}</div>
                <div className="text-xs text-ink-muted">{x.dodavatel}</div>
                {x.zdroje.map((z) => (
                  <div key={z.id} className="text-xs tabular-nums text-ink-secondary">
                    {obdobi(z.od, z.do)}
                    {z.spotreba != null && z.jednotka ? ` · ${z.spotreba} ${z.jednotka}` : ""} · {czk(z.podil)}
                  </div>
                ))}
                {x.zdroje.length === 0 && <div className="text-xs text-warn">bez vyúčtování</div>}
              </td>
              <td className="py-2 text-right font-medium tabular-nums">{czk(x.castka)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="text-sm">
          <tr><td className="pt-3">Náklady na služby celkem</td><td className="pt-3 text-right font-medium tabular-nums">{czk(s.naklady)}</td></tr>
          <tr><td className="py-1">Zaplacené zálohy</td><td className="py-1 text-right font-medium tabular-nums">{czk(s.zalohy)}</td></tr>
          <tr className="border-t-2 border-line text-base font-bold">
            <td className="pt-2">
              {nedoplatek ? "Nedoplatek k úhradě" : preplatek ? "Přeplatek k vrácení" : "Zálohy odpovídají nákladům"}
            </td>
            <td className={`pt-2 text-right tabular-nums ${nedoplatek ? "text-bad" : preplatek ? "text-good" : ""}`}>
              {nedoplatek || preplatek ? czk(Math.abs(s.rozdil)) : czk(0)}
            </td>
          </tr>
        </tfoot>
      </table>

      {(nedoplatek || preplatek) && (
        <section className="mt-5 break-inside-avoid rounded-xl bg-accent-soft/60 px-4 py-3 text-sm">
          {nedoplatek ? (
            <div className="flex flex-wrap items-center gap-5">
              <div className="min-w-[14rem] flex-1 space-y-0.5">
                <div className="font-semibold">Platební údaje</div>
                {s.pronajimatel?.ucet
                  ? <div>Číslo účtu: <strong className="tabular-nums">{s.pronajimatel.ucet}</strong></div>
                  : <div className="text-warn">Pronajímatel nemá vyplněné číslo účtu (doplň ve Správě → Uživatelé).</div>}
                {vs && <div>Variabilní symbol: <strong className="tabular-nums">{vs}</strong></div>}
                <div>Částka: <strong className="tabular-nums">{czk(Math.abs(s.rozdil))}</strong></div>
                {splatnost && <div>Splatnost: <strong>{dateCz(splatnost)}</strong></div>}
              </div>
              {qr && (
                <div className="text-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qr} alt="QR platba" width={110} height={110} className="rounded-md bg-white p-1" />
                  <div className="mt-0.5 text-[10px] text-ink-muted">QR platba</div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-0.5">
              <div className="font-semibold">Vrácení přeplatku</div>
              <div>
                Přeplatek <strong className="tabular-nums">{czk(s.rozdil)}</strong> bude vrácen
                {splatnost ? <> nejpozději do <strong>{dateCz(splatnost)}</strong></> : null}
                {s.najemce.ucet ? <> na účet <strong className="tabular-nums">{s.najemce.ucet}</strong></> : null}.
              </div>
              {!s.najemce.ucet && <div className="text-xs text-warn print:hidden">Nájemce nemá vyplněný účet pro vratku.</div>}
            </div>
          )}
        </section>
      )}

      {s.doporucenaZaloha != null && (
        <p className="mt-4 break-inside-avoid text-sm">
          <strong>Návrh záloh od dalšího období:</strong> podle skutečných nákladů navrhujeme upravit měsíční zálohy
          z {czk(s.aktualniZaloha)} na <strong>{czk(s.doporucenaZaloha)}</strong>.
        </p>
      )}

      {s.nepokryto.length > 0 && (
        <div className="mt-4 break-inside-avoid rounded-xl bg-warn/15 px-4 py-3 text-sm" role="status">
          <div className="flex items-start gap-2.5">
            <Ikona nazev="pozor" trida="mt-0.5 h-4 w-4 shrink-0 text-warn" />
            <div>
              <div className="font-semibold">Vyúčtování je neúplné</div>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-ink-secondary">
                {s.nepokryto.map((n, i) => <li key={i}>{n.sluzba}: {n.popis}</li>)}
              </ul>
            </div>
          </div>
        </div>
      )}

      <p className="mt-5 text-[11px] text-ink-muted">
        Zálohy jsou počítané podle nájemní smlouvy a jejích změn za dny, kdy nájem trval. Náklady jsou rozúčtované
        podle skutečných vyúčtování dodavatelů za dny, kdy jste v bytě bydleli.
      </p>
    </article>
  );
}

/** Spusti tisk jen dokumentu (do PDF). */
export function vytisknout() {
  const html = document.documentElement;
  html.classList.add("tisk-vyuctovani");
  window.addEventListener("afterprint", () => html.classList.remove("tisk-vyuctovani"), { once: true });
  window.print();
}
