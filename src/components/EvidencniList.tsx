"use client";

import { useState } from "react";
import { czk, dateCz } from "@/lib/format";
import { SERVICE_TYPES } from "@/lib/categories";
import { platnyKDatu } from "@/lib/zalohy";
import { DatumPole } from "./DatumPole";

export interface Pronajimatel { name: string; adresa: string }

export interface EvidencniVstup {
  nemovitost: { nazev: string; adresa: string };
  najemce: { name: string; adresa: string; email: string | null; phone: string | null };
  pronajimatele: Pronajimatel[];
  najemne: number;
  zalohyAktualni: number;
  zalohyHistorie: { validFrom: Date | string; amount: number }[];
  odKdy: string;
  doKdy: string | null;
  platebniDen: number;
  kauce: number;
  prectene: { type: string; provider: string }[];
}

const dnes = () => new Date().toISOString().slice(0, 10);

function Karta({ titulek, children }: { titulek: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid rounded-xl border border-line">
      <h4 className="border-b border-line bg-surface-sunken/60 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-accent">
        {titulek}
      </h4>
      <dl className="divide-y divide-line/60 text-sm">{children}</dl>
    </section>
  );
}

function Radek({ t, v }: { t: string; v: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[9.5rem_1fr] gap-3 px-4 py-2">
      <dt className="text-ink-muted">{t}</dt>
      <dd className="font-medium">{v || "—"}</dd>
    </div>
  );
}

/**
 * Evidencni list bytu / rozpis najmu pro najemce: kdo, kde, kolik se plati a od kdy.
 * Hodnoty se berou ke zvolenemu dni — zalohy mohly mezitim zmenit.
 */
export function EvidencniList({ v }: { v: EvidencniVstup }) {
  const vychozi = v.odKdy > dnes() ? v.odKdy : dnes();
  const [platnyOd, setPlatnyOd] = useState<string | null>(vychozi);
  const den = platnyOd ?? vychozi;

  // Zalohy platne k zvolenemu dni; pred zacatkem najmu plati pocatecni hodnota
  const platne = platnyKDatu(v.zalohyHistorie, new Date(`${den}T00:00:00Z`));
  const zalohy = platne ? platne.amount : v.zalohyAktualni;
  const celkem = v.najemne + zalohy;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 print:hidden">
        <DatumPole label="Platný od" name="platnyOd" defaultValue={vychozi} onChange={setPlatnyOd}
          hint="Zálohy se vezmou tak, jak platily k tomuto dni." />
        <button type="button" className="btn btn-primary"
          onClick={() => {
            const html = document.documentElement;
            html.classList.add("tisk-dokument");
            window.addEventListener("afterprint", () => html.classList.remove("tisk-dokument"), { once: true });
            window.print();
          }}>
          Vytisknout / uložit PDF
        </button>
      </div>

      <article className="tisk-dokument-obsah mx-auto max-w-[760px] rounded-2xl border border-line bg-surface-card p-6 shadow-card sm:p-9">
        <header className="border-b-2 border-accent pb-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">Rozpis nájmu</div>
              <h3 className="mt-1 text-2xl font-bold tracking-tight">Evidenční list bytu</h3>
            </div>
            <div className="rounded-lg bg-accent-soft px-3 py-1.5 text-right">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-accent">Platný od</div>
              <div className="text-base font-bold tabular-nums">{dateCz(den)}</div>
            </div>
          </div>
        </header>

        <div className="mt-5 grid gap-4">
          <Karta titulek="Nemovitost">
            <Radek t="Označení" v={v.nemovitost.nazev} />
            <Radek t="Adresa" v={v.nemovitost.adresa} />
          </Karta>

          <Karta titulek="Nájemce">
            <Radek t="Jméno a příjmení" v={<strong>{v.najemce.name}</strong>} />
            <Radek t="Trvalé bydliště" v={v.najemce.adresa} />
            <Radek t="Kontakt" v={[v.najemce.phone, v.najemce.email].filter(Boolean).join(" · ")} />
          </Karta>

          <Karta titulek={v.pronajimatele.length > 1 ? "Pronajímatelé" : "Pronajímatel"}>
            {v.pronajimatele.length === 0
              ? <Radek t="Jméno a příjmení" v="" />
              : v.pronajimatele.map((p, i) => (
                <div key={i}>
                  <Radek t="Jméno a příjmení" v={<strong>{p.name}</strong>} />
                  {p.adresa && <Radek t="Adresa" v={p.adresa} />}
                </div>
              ))}
          </Karta>

          <section className="break-inside-avoid overflow-hidden rounded-xl border border-line">
            <h4 className="border-b border-line bg-surface-sunken/60 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-accent">
              Platby a poplatky (měsíčně)
            </h4>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-line/60">
                <tr>
                  <td className="px-4 py-2.5">
                    <div className="font-medium">Nájemné</div>
                    <div className="text-xs text-ink-muted">čisté nájemné bez záloh na služby</div>
                  </td>
                  <td className="px-4 py-2.5 text-right text-base font-semibold tabular-nums">{czk(v.najemne)}</td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5">
                    <div className="font-medium">Zálohy na služby spojené s užíváním bytu</div>
                    {v.prectene.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {v.prectene.map((s, i) => (
                          <span key={i} className="rounded-md bg-surface-sunken px-1.5 py-0.5 text-[11px] text-ink-secondary">
                            {SERVICE_TYPES[s.type] ?? s.type}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="mt-1 text-[11px] text-ink-muted">Zálohy se vyúčtují podle skutečných nákladů.</div>
                  </td>
                  <td className="px-4 py-2.5 text-right align-top text-base font-semibold tabular-nums">{czk(zalohy)}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr className="bg-accent text-white">
                  <td className="px-4 py-3 text-sm font-bold uppercase tracking-wide">Celková měsíční částka</td>
                  <td className="px-4 py-3 text-right text-lg font-bold tabular-nums">{czk(celkem)}</td>
                </tr>
              </tfoot>
            </table>
          </section>

          <div className="grid gap-x-6 gap-y-1 text-xs text-ink-secondary sm:grid-cols-3">
            <div>Splatnost: do <strong>{v.platebniDen}.</strong> dne v měsíci</div>
            <div>Kauce: <strong>{czk(v.kauce)}</strong></div>
            <div>Nájem od <strong>{dateCz(v.odKdy)}</strong>{v.doKdy ? <> do <strong>{dateCz(v.doKdy)}</strong></> : " na dobu neurčitou"}</div>
          </div>
        </div>

        <footer className="mt-10 grid grid-cols-2 gap-10 break-inside-avoid text-center text-sm">
          {["Pronajímatel", "Nájemce"].map((t) => (
            <div key={t}>
              <div className="h-14" />
              <div className="border-t border-ink-muted/60 pt-1.5 font-semibold">{t}</div>
              <div className="text-[11px] text-ink-muted">podpis</div>
            </div>
          ))}
        </footer>
        <div className="mt-6 text-center text-[10px] text-ink-muted">Vygenerováno {dateCz(new Date())}</div>
      </article>
    </div>
  );
}

