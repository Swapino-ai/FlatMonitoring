"use client";

import { useState } from "react";
import { czk, dateCz } from "@/lib/format";
import { nazevDruhu, type TypySluzeb } from "@/lib/categories";
import { mesicniNaklad, platnyKDatu, polozkyKDatu, soucetPolozek, sluzbaKDatu, type PolozkaZalohy, type SluzbaVstup } from "@/lib/zalohy";
import { DatumPole } from "./DatumPole";

export interface Pronajimatel { name: string; adresa: string }

export interface EvidencniVstup {
  nemovitost: { nazev: string; adresa: string };
  najemce: { name: string; adresa: string; email: string | null; phone: string | null };
  pronajimatele: Pronajimatel[];
  najemne: number;
  zalohyAktualni: number;
  zalohyHistorie: { validFrom: Date | string; amount: number; items?: PolozkaZalohy[] | null }[];
  /** Aktualni rozpis zaloh po sluzbach; null = jen celkova castka. */
  zalohyPolozky?: PolozkaZalohy[] | null;
  odKdy: string;
  /** Vsechny sluzby nemovitosti (s id); bez rozpisu zaloh se vezmou ty preuctovane a jejich cena. */
  prectene: SluzbaVstup[];
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
export function EvidencniList({ v, typy }: { v: EvidencniVstup; typy: TypySluzeb }) {
  const vychozi = v.odKdy > dnes() ? v.odKdy : dnes();
  const [platnyOd, setPlatnyOd] = useState<string | null>(vychozi);
  const den = platnyOd ?? vychozi;

  // Zalohy platne k zvolenemu dni; pred zacatkem najmu plati pocatecni hodnota
  const datumDne = new Date(`${den}T00:00:00Z`);
  const platne = platnyKDatu(v.zalohyHistorie, datumDne);
  const polozkyDen = polozkyKDatu({ advanceItems: v.zalohyPolozky, historie: v.zalohyHistorie }, datumDne);

  // Rozepsane zalohy: kazda sluzba ma castku, kterou nájemce skutecne plati.
  // Bez rozpisu se ukazou naklady preuctovanych sluzeb a celkova zaloha zvlast.
  const rozepsano = polozkyDen != null && polozkyDen.length > 0;
  const zalohy = rozepsano ? soucetPolozek(polozkyDen) : platne ? platne.amount : v.zalohyAktualni;
  const celkem = v.najemne + zalohy;
  const sluzby = rozepsano
    ? polozkyDen!.map((p) => {
      const s = v.prectene.find((x) => x.id === p.serviceId);
      return { type: s?.type ?? "OTHER", provider: s?.provider ?? "smazaná služba", poznamka: s?.notes?.trim() || null, castka: p.amount };
    })
    : v.prectene.filter((s) => s.chargedToTenant).map((s) => {
      const k = sluzbaKDatu(s, datumDne);
      return { type: s.type, provider: s.provider, poznamka: s.notes?.trim() || null, castka: mesicniNaklad(k) };
    });
  const souctuSluzeb = sluzby.reduce((a, s) => a + s.castka, 0);
  const rozdil = zalohy - souctuSluzeb;

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
                <tr className="bg-surface-sunken/40">
                  <td className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-muted" colSpan={2}>
                    Zálohy na služby spojené s užíváním bytu
                  </td>
                </tr>
                {sluzby.map((s, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2 pl-7">
                      <div className="font-medium">{nazevDruhu(typy, s.type)}</div>
                      <div className="text-xs text-ink-muted">{s.provider}</div>
                      {s.poznamka && (
                        <div className="mt-1 whitespace-pre-line border-l-2 border-accent/40 pl-2 text-[11px] leading-snug text-ink-secondary">
                          {s.poznamka}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right align-top tabular-nums">{czk(s.castka)}</td>
                  </tr>
                ))}
                {sluzby.length === 0 && (
                  <tr><td className="px-4 py-2 pl-7 text-xs text-ink-muted" colSpan={2}>Žádná služba není přeúčtovaná nájemci.</td></tr>
                )}
                <tr>
                  <td className="px-4 py-2.5">
                    <div className="font-medium">Zálohy na služby celkem</div>
                    <div className="text-[11px] text-ink-muted">
                      Zálohy se vyúčtují podle skutečných nákladů.
                      {!rozepsano && sluzby.length > 0 && Math.abs(rozdil) >= 1 && (
                        <> Náklady služeb jsou nyní {czk(souctuSluzeb)}, záloha je {rozdil > 0 ? "vyšší" : "nižší"} o {czk(Math.abs(rozdil))}.</>
                      )}
                    </div>
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

