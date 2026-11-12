"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { nahrajDokladPohybu, smazDokladPohybu } from "@/lib/dokladyActions";
import { nactiSoubor, type NactenySoubor } from "@/lib/souborKlient";
import { deleteTransaction, saveTransaction, type EntityFormState } from "@/lib/entityActions";
import { Hlaska, Pole, Rozbalovaci, SmazatTlacitko, UpravaPanel, UpravitTlacitko, Vyber, isoDatum } from "./form";
import { CATEGORIES, categoryLabel } from "@/lib/categories";
import { czk, dateCz, denISO } from "@/lib/format";
import { Ikona } from "./Ikony";
import { useOrezFotky } from "./OrezFotky";

interface Row {
  id: string; date: Date; amount: number; category: string;
  description: string | null; documentRef: string | null;
  /** Poznamka ze sparovane platby v bance */
  poznamkaBanky?: string | null;
  /** "banka:<id>" = importovano z Fio (datum, castka a popis nejdou menit) */
  sourceKey?: string | null;
  /** Prilozene doklady (uctenky, faktury) na Google Disku */
  doklady?: { id: string; nazev: string; mime: string }[];
}

export function TransactionManager({ propertyId, transactions, canEdit, diskPripojen = false }: {
  propertyId: string; transactions: Row[]; canEdit: boolean;
  /** Doklady jdou prikladat jen s pripojenym Google Diskem */
  diskPripojen?: boolean;
}) {
  const [addState, addAction, adding] = useActionState<EntityFormState, FormData>(saveTransaction.bind(null, null), {});
  const [delState, delAction] = useActionState<EntityFormState, FormData>(deleteTransaction, {});

  const [upravaId, setUpravaId] = useState<string | null>(null);
  const [upravaState, upravaAction, upravuji] = useActionState<EntityFormState, FormData>(
    saveTransaction.bind(null, upravaId), {});
  useEffect(() => { if (upravaState.success) setUpravaId(null); }, [upravaState.success]);

  const upravovany = transactions.find((t) => t.id === upravaId) ?? null;

  // Doklady: fotka z telefonu nebo PDF; nahravaji se po jednom (limit velikosti pozadavku)
  const [soubory, setSoubory] = useState<NactenySoubor[]>([]);
  const [stavDokladu, setStavDokladu] = useState<{ ok: boolean; text: string } | null>(null);
  const [nahravam, spustNahrani] = useTransition();
  const vstupRadku = useRef<HTMLInputElement>(null);
  const [kPohybu, setKPohybu] = useState<string | null>(null);
  // Fotky dokladu jde pred nahranim oriznout a narovnat podle rohu
  const { orizni, dialog: dialogOrezu } = useOrezFotky();
  const nacti = async (fl: FileList | null) => {
    const out: NactenySoubor[] = [];
    for (const f of await orizni(Array.from(fl ?? []))) {
      try { out.push(await nactiSoubor(f)); } catch { setStavDokladu({ ok: false, text: `Soubor ${f.name} se nepodařilo načíst.` }); }
    }
    return out.filter((x) => { const ok = x.data.length * 0.75 <= 2_600_000; if (!ok) setStavDokladu({ ok: false, text: "PDF je moc velké (max. 2,5 MB)." }); return ok; });
  };
  const nahraj = (transactionId: string, seznam: NactenySoubor[]) => spustNahrani(async () => {
    let chyb = 0;
    for (let i = 0; i < seznam.length; i++) {
      setStavDokladu({ ok: true, text: `Nahrávám doklad ${i + 1} z ${seznam.length}…` });
      const r = await nahrajDokladPohybu(transactionId, { data: seznam[i].data, mime: seznam[i].mime });
      if (r.error) { chyb++; setStavDokladu({ ok: false, text: r.error }); }
    }
    if (!chyb) setStavDokladu({ ok: true, text: seznam.length === 1 ? "Doklad přiložen." : `Přiloženo ${seznam.length} dokladů.` });
  });
  // Novy pohyb ulozen: prilozit vybrane doklady
  useEffect(() => {
    if (addState.id && addState.kdy && soubory.length) { nahraj(addState.id, soubory); setSoubory([]); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addState.kdy]);

  // Prijmy a vydaje zvlast, at je jasne, co znamena kladna castka
  const prijmy = CATEGORIES.filter((c) => c.kind === "INCOME" && !c.kratkodoby).map((c) => [c.key, c.label] as [string, string]);
  const vydaje = CATEGORIES.filter((c) => c.kind === "EXPENSE" && !c.kratkodoby).map((c) => [c.key, c.label] as [string, string]);

  // Pohyby po letech: nejnovejsi rok je rozbaleny, starsi sbalene
  const roky = (() => {
    const m = new Map<string, Row[]>();
    for (const t of transactions) {
      const rok = denISO(t.date).slice(0, 4);
      m.set(rok, [...(m.get(rok) ?? []), t]);
    }
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  })();
  const [otevreneRoky, setOtevreneRoky] = useState<Set<string>>(() => new Set(roky[0] ? [roky[0][0]] : []));
  const prepniRok = (r: string) => setOtevreneRoky((s) => { const n = new Set(s); if (n.has(r)) n.delete(r); else n.add(r); return n; });
  // Rozeditovany pohyb nesmi zustat schovany ve sbalenem roce
  const rokUpravy = upravovany ? denISO(upravovany.date).slice(0, 4) : null;

  return (
    <div>
      {dialogOrezu}
      {stavDokladu && <p className={`mb-2 rounded-lg px-3 py-2 text-sm ${stavDokladu.ok ? "bg-good/10 text-good" : "bg-bad/10 text-bad"}`}>{stavDokladu.text}</p>}
      <input ref={vstupRadku} type="file" accept="image/*,application/pdf" multiple className="hidden"
        onChange={async (e) => { const id = kPohybu; const fl = e.target.files; const seznam = await nacti(fl); e.target.value = ""; if (id && seznam.length) nahraj(id, seznam); }} />
      <Hlaska state={
        upravaState.error ? upravaState
          : addState.error || addState.success ? addState
          : delState.error || delState.success ? delState
          : upravaState
      } />

      {transactions.length === 0 ? (
        <p className="py-3 text-center text-sm text-ink-muted">Žádné pohyby.</p>
      ) : (
        <div className="space-y-3">
          {roky.map(([rok, radky]) => {
            const otevreno = otevreneRoky.has(rok) || rokUpravy === rok;
            const soucet = radky.reduce((a, t) => a + t.amount, 0);
            return (
              <section key={rok} className="overflow-hidden rounded-xl border border-line">
                <button type="button" onClick={() => prepniRok(rok)} aria-expanded={otevreno}
                  className="flex w-full items-center gap-2 bg-surface-sunken/60 px-3 py-2 text-left text-sm font-semibold">
                  <svg viewBox="0 0 20 20" className={`h-4 w-4 shrink-0 text-ink-muted transition-transform ${otevreno ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M8 5l5 5-5 5" /></svg>
                  <span className="flex-1">{rok}</span>
                  <span className="text-xs font-normal text-ink-muted">{radky.length}×</span>
                  <span className={`w-28 text-right tabular-nums ${soucet >= 0 ? "text-good" : ""}`}>{soucet > 0 ? "+" : ""}{czk(soucet)}</span>
                </button>
                {otevreno && (
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Datum</th><th>Kategorie</th><th>Popis</th><th className="num">Částka</th>
                    {canEdit && <th className="w-[7.5rem]"><span className="sr-only">Akce</span></th>}
                  </tr>
                </thead>
                <tbody>
                  {radky.map((t) => (
                    <tr key={t.id} className={upravaId === t.id ? "bg-accent/5" : undefined}>
                      <td className="tabular-nums text-ink-secondary">{dateCz(t.date)}</td>
                      <td>
                        <div className="flex items-center gap-2.5">
                          {/* Smer penez je videt driv, nez se precte kategorie. Neni to jedina
                              informace: znamenko u castky a barva jen doplnuji. */}
                          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                            t.amount >= 0 ? "bg-good/15 text-good" : "bg-surface-sunken text-ink-muted"
                          }`} title={t.amount >= 0 ? "Příjem" : "Výdaj"}>
                            <Ikona nazev={t.amount >= 0 ? "sipkaDolu" : "sipkaNahoru"} trida="h-4 w-4" />
                          </span>
                          <span className="font-medium">{categoryLabel(t.category)}</span>
                        </div>
                      </td>
                      <td className="max-w-[24rem] text-ink-secondary">
                        <span className="line-clamp-2" title={t.description ?? undefined}>{t.description}</span>
                        {t.documentRef && <span className="text-xs text-ink-muted">{t.documentRef}</span>}
                        {t.poznamkaBanky && <span className="block text-xs italic text-ink-secondary" title="Poznámka z banky">✎ {t.poznamkaBanky}</span>}
                        {/* Na telefonu jsou akce mimo obrazovku — doklad jde pridat primo tady */}
                        {canEdit && diskPripojen && (
                          <button type="button" disabled={nahravam} className="mt-0.5 block text-xs font-medium text-accent sm:hidden"
                            onClick={() => { setKPohybu(t.id); setStavDokladu(null); vstupRadku.current?.click(); }}>+ vyfotit doklad</button>
                        )}
                        {(t.doklady?.length ?? 0) > 0 && (
                          <span className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-xs">
                            {t.doklady!.map((d, i) => (
                              <span key={d.id} className="inline-flex items-center gap-1">
                                <a href={`/api/soubory/${d.id}`} target="_blank" rel="noreferrer" className="text-accent hover:underline" title={d.nazev}>
                                  📎 doklad{t.doklady!.length > 1 ? ` ${i + 1}` : ""}
                                </a>
                                {canEdit && <button type="button" aria-label="Odebrat doklad" title="Odebrat doklad" className="text-ink-muted hover:text-bad" disabled={nahravam}
                                  onClick={() => { if (confirm("Odebrat doklad? Na Disku půjde do koše.")) spustNahrani(async () => { await smazDokladPohybu(d.id); }); }}>✕</button>}
                              </span>
                            ))}
                          </span>
                        )}
                      </td>
                      <td className={`num font-semibold ${t.amount >= 0 ? "text-good" : ""}`}>
                        {t.amount > 0 ? "+" : ""}{czk(t.amount)}
                      </td>
                      {canEdit && (
                        <td>
                          <div className="flex items-center justify-end gap-0.5">
                            {diskPripojen && (
                              <button type="button" title="Vyfotit / přiložit doklad" aria-label="Přiložit doklad" disabled={nahravam}
                                onClick={() => { setKPohybu(t.id); setStavDokladu(null); vstupRadku.current?.click(); }}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-accent-soft hover:text-accent">
                                <Ikona nazev="kamera" trida="h-4 w-4" />
                              </button>
                            )}
                            <UpravitTlacitko aktivni={upravaId === t.id}
                              onClick={() => setUpravaId(upravaId === t.id ? null : t.id)} />
                            <SmazatTlacitko action={delAction} id={t.id} potvrzeni="Opravdu smazat tento pohyb?" />
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
                )}
              </section>
            );
          })}
        </div>
      )}

      {canEdit && upravovany && (
        <UpravaPanel nadpis={`Upravit pohyb z ${dateCz(upravovany.date)}`} onZavrit={() => setUpravaId(null)}>
          <Formular key={upravovany.id} propertyId={propertyId} r={upravovany}
            kategorie={upravovany.sourceKey?.startsWith("banka:") ? (upravovany.amount >= 0 ? prijmy : vydaje) : [...prijmy, ...vydaje]}
            action={upravaAction} pending={upravuji} popisekTlacitka="Uložit změny" />
        </UpravaPanel>
      )}

      {canEdit && !upravovany && (
        <Rozbalovaci popisek="Zaúčtovat pohyb" zavritPo={addState.success}>
          <Formular propertyId={propertyId} r={null} kategorie={[...prijmy, ...vydaje]}
            action={addAction} pending={adding || nahravam} popisekTlacitka="Zaúčtovat"
            doklady={diskPripojen ? { soubory, pridej: async (fl) => { const n = await nacti(fl); setSoubory((x) => [...x, ...n]); }, odeber: (i) => setSoubory((x) => x.filter((_, j) => j !== i)) } : undefined} />
        </Rozbalovaci>
      )}
    </div>
  );
}

function Formular({ propertyId, r, kategorie, action, pending, popisekTlacitka, doklady }: {
  propertyId: string; r: Row | null; kategorie: [string, string][];
  action: (payload: FormData) => void; pending: boolean; popisekTlacitka: string;
  /** Doklady k novemu pohybu (nahraji se po zauctovani) */
  doklady?: { soubory: NactenySoubor[]; pridej: (f: FileList | null) => void; odeber: (i: number) => void };
}) {
  const vstup = useRef<HTMLInputElement>(null);
  // Pohyb z Fio: datum, castka a popis jsou z banky a nemeni se; jde zmenit kategorie a poznamka
  if (r?.sourceKey?.startsWith("banka:")) {
    const pevne = (label: string, hodnota: string) => (
      <div>
        <div className="label mb-1.5">{label}</div>
        <div className="input cursor-not-allowed bg-surface-sunken text-ink-secondary">{hodnota || "—"}</div>
      </div>
    );
    return (
      <form action={action} className="grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="propertyId" value={propertyId} />
        <input type="hidden" name="date" value={isoDatum(r.date) ?? ""} />
        <input type="hidden" name="amount" value={Math.abs(r.amount)} />
        <input type="hidden" name="description" value={r.description ?? ""} />
        <p className="flex items-center gap-2 rounded-lg bg-surface-sunken px-3 py-2 text-xs text-ink-secondary sm:col-span-2">
          <Ikona nazev="penize" trida="h-4 w-4" /> Importováno z Fio — datum, částka a popis nejdou změnit.
        </p>
        {pevne("Datum", dateCz(r.date))}
        <Vyber label="Kategorie" name="category" defaultValue={r.category} options={kategorie} hint="Daňové zařazení se doplní podle kategorie" />
        {pevne("Částka (Kč)", czk(Math.abs(r.amount)))}
        <Pole label="Doklad" name="documentRef" placeholder="např. FA-2026-0312" defaultValue={r.documentRef ?? ""} />
        <div className="sm:col-span-2">{pevne("Popis", r.description ?? "")}</div>
        <Pole label="Poznámka" name="poznamkaBanky" sirka="sm:col-span-2" placeholder="nepovinné — stejná poznámka je u platby v Bance"
          defaultValue={r.poznamkaBanky ?? ""} />
        <div className="sm:col-span-2">
          <button type="submit" disabled={pending} className="btn btn-primary">{pending ? "Ukládám…" : popisekTlacitka}</button>
        </div>
      </form>
    );
  }
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="propertyId" value={propertyId} />
      <Pole label="Datum" name="date" type="date" required
        defaultValue={isoDatum(r?.date) ?? new Date().toISOString().slice(0, 10)} />
      <Vyber label="Kategorie" name="category" defaultValue={r?.category ?? "RENT"}
        options={kategorie}
        hint="Daňové zařazení se doplní podle kategorie" />
      {/* Znamenko urcuje kategorie, takze do pole patri absolutni hodnota */}
      <Pole label="Částka (Kč)" name="amount" type="number" step="1" required
        defaultValue={r ? Math.abs(r.amount) : undefined}
        hint="Zadej kladně — znaménko určí kategorie" />
      <Pole label="Doklad" name="documentRef" placeholder="např. FA-2026-0312" defaultValue={r?.documentRef ?? ""} />
      <Pole label="Popis" name="description" sirka="sm:col-span-2" placeholder="nepovinné"
        defaultValue={r?.description ?? ""} />
      {doklady && (
        <div className="sm:col-span-2">
          <input ref={vstup} type="file" accept="image/*,application/pdf" multiple className="hidden"
            onChange={(e) => { doklady.pridej(e.target.files); e.target.value = ""; }} />
          <button type="button" className="btn inline-flex w-full items-center justify-center gap-2 sm:w-auto" onClick={() => vstup.current?.click()}>
            <Ikona nazev="kamera" trida="h-4 w-4" /> Vyfotit / přiložit doklad
          </button>
          <span className="ml-2 hidden text-xs text-ink-muted sm:inline">jen pro vlastní evidenci, uloží se na Google Disk</span>
          {doklady.soubory.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {doklady.soubory.map((f, i) => (
                <div key={i} className="relative">
                  {f.nahled
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={f.nahled} alt={`Doklad ${i + 1}`} className="h-20 w-20 rounded-lg object-cover" />
                    : <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-surface-sunken text-xs font-semibold text-ink-muted">PDF</div>}
                  <button type="button" aria-label="Odebrat" onClick={() => doklady.odeber(i)}
                    className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs text-white">✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="sm:col-span-2">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Ukládám…" : popisekTlacitka}
        </button>
      </div>
    </form>
  );
}
