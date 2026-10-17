"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import {
  deleteSettlement, saveSettlement, saveSettlementSkupina, zaplacenoDodavateli, type VyuctovaniFormState, type ZaplacenoSluzbe,
} from "@/lib/vyuctovaniActions";
import {
  pridejDny, prunik, rozuctuj, vyuctovaniNajemce,
  type NajemVstup, type SluzbaVyuctovani, type VyuctovaniVstup,
} from "@/lib/vyuctovani";
import { nazevDruhu, type TypySluzeb } from "@/lib/categories";
import { czk, dateCz } from "@/lib/format";
import { Hlaska, Pole, Rozbalovaci, SmazatTlacitko, TextPole, UpravaPanel, UpravitTlacitko, Vyber } from "./form";
import { DatumPole } from "./DatumPole";
import { Ikona, type NazevIkony } from "./Ikony";
import { Badge } from "./Stat";
import { Dokumenty, type DokumentRadek } from "./Dokumenty";

export interface SluzbaRadek { id: string; type: string; provider: string; chargedToTenant: boolean; groupName?: string | null }

export interface NajemRadek extends NajemVstup {
  tenantStreet: string | null; tenantCity: string | null; tenantZip: string | null;
  tenantAccount: string | null;
}

export interface VyuctovaniRadek extends VyuctovaniVstup {
  serviceId: string;
  cisloFaktury: string | null;
  poznamka: string | null;
  /** Spolecne vyuctovani vice sluzeb: stejny batchId a pocet sluzeb v nem. */
  batchId?: string | null;
  batchPocet?: number;
}

const dnesISO = () => new Date().toISOString().slice(0, 10);
const cislo = (t: string) => Number(t.replace(/\s/g, "").replace(",", "."));
const obdobi = (od: string, doDne: string) => `${dateCz(od)} – ${dateCz(doDne)}`;

// --- Vyuctovani sluzeb od dodavatelu ---

export function VyuctovaniSluzeb({ services, leases, vyuctovani, canEdit, typy, dokumenty, diskPripojen }: {
  /** Dokumenty k vyuctovanim podle id vyuctovani. */
  dokumenty: Record<string, DokumentRadek[]>;
  diskPripojen: boolean;
  typy: TypySluzeb;
  services: SluzbaRadek[]; leases: NajemRadek[]; vyuctovani: VyuctovaniRadek[]; canEdit: boolean;
}) {
  const [addState, addAction, adding] = useActionState<VyuctovaniFormState, FormData>(saveSettlement.bind(null, null), {});
  const [delState, delAction] = useActionState<VyuctovaniFormState, FormData>(deleteSettlement, {});
  const [skupinaState, skupinaAction, skupinaBezi] = useActionState<VyuctovaniFormState, FormData>(saveSettlementSkupina, {});
  const [upravaId, setUpravaId] = useState<string | null>(null);
  const [upravaState, upravaAction, upravuji] = useActionState<VyuctovaniFormState, FormData>(
    saveSettlement.bind(null, upravaId), {});
  useEffect(() => { if (upravaState.success) setUpravaId(null); }, [upravaState.success]);
  const [rozbaleno, setRozbaleno] = useState<Set<string>>(new Set());
  const [prilohy, setPrilohy] = useState<Set<string>>(new Set());
  const prepniPrilohy = (id: string) => setPrilohy((r) => { const n = new Set(r); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const upravovane = vyuctovani.find((v) => v.id === upravaId) ?? null;
  const prepni = (id: string) => setRozbaleno((r) => { const n = new Set(r); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const stav = upravaState.error || upravaState.success ? upravaState
    : addState.error || addState.success ? addState
    : skupinaState.error || skupinaState.success ? skupinaState
    : delState.error || delState.success ? delState : {};

  const sSluzbami = services.filter((s) => vyuctovani.some((v) => v.serviceId === s.id));

  return (
    <div>
      <Hlaska state={stav} />

      {vyuctovani.length === 0 ? (
        <p className="py-3 text-center text-sm text-ink-muted">Zatím žádné vyúčtování od dodavatelů.</p>
      ) : (
        <div className="space-y-5">
          {sSluzbami.map((s) => {
            const radky = vyuctovani.filter((v) => v.serviceId === s.id).sort((a, b) => (a.od < b.od ? 1 : -1));
            return (
              <div key={s.id}>
                <div className="mb-2 flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent-soft text-accent">
                    <Ikona nazev={(typy[s.type]?.icon ?? "tri") as NazevIkony} trida="h-4 w-4" />
                  </span>
                  <div className="text-sm font-semibold">{`${nazevDruhu(typy, s.type)} · ${s.provider}`}</div>
                  {s.chargedToTenant && <Badge tone="neutral">přeúčtuje se nájemci</Badge>}
                </div>
                <div className="divide-y divide-line/70 rounded-xl border border-line">
                  {radky.map((v) => {
                    const rozdel = rozuctuj(v, leases);
                    // Rozdelovat se ma jen tam, kde v obdobi bydleli aspon dva najemci
                    const vicNajemcu = leases.filter((l) => prunik(l.od, l.do, v.od, v.do)).length >= 2;
                    const otevrene = rozbaleno.has(v.id);
                    const vysl = v.zalohyDodavateli - v.naklad;
                    return (
                      <div key={v.id} className={upravaId === v.id ? "bg-accent-soft/50" : undefined}>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3.5 py-2.5">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium tabular-nums">{obdobi(v.od, v.do)}</div>
                            {rozdel.vlastnik.dnu > 0 && v.rezim === "DAYS" && (
                              <div className="text-xs text-warn">
                                {rozdel.vlastnik.dnu} dní bez nájemce · {czk(rozdel.vlastnik.podil)} nese vlastník
                              </div>
                            )}
                            <div className="text-xs text-ink-muted">
                              {v.batchId && <span className="mr-1.5"><Badge tone="neutral">společný doklad · {v.batchPocet} služeb</Badge></span>}
                              {v.cisloFaktury ? `č. ${v.cisloFaktury} · ` : ""}
                              {v.rezim === "READINGS" ? `podle odečtů${v.jednotka ? ` (${v.jednotka})` : ""}` : "podle dnů"}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-semibold tabular-nums">{czk(v.naklad)}</div>
                            {v.zalohyDodavateli > 0 && (
                              <div className={`text-xs tabular-nums ${vysl >= 0 ? "text-good" : "text-bad"}`}>
                                {vysl >= 0 ? "přeplatek" : "nedoplatek"} {czk(Math.abs(vysl))}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-0.5">
                            <button type="button" onClick={() => prepniPrilohy(v.id)} aria-expanded={prilohy.has(v.id)}
                              title={`Soubory k vyúčtování (${(dokumenty[v.id] ?? []).length})`} aria-label="Soubory k vyúčtování"
                              className={`relative inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                                prilohy.has(v.id) ? "bg-accent-soft text-accent" : "text-ink-muted hover:bg-accent-soft hover:text-accent"}`}>
                              <Ikona nazev="sponka" />
                              {(dokumenty[v.id] ?? []).length > 0 && (
                                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-white">
                                  {(dokumenty[v.id] ?? []).length}
                                </span>
                              )}
                            </button>
                            {vicNajemcu && <button type="button" onClick={() => prepni(v.id)} aria-expanded={otevrene}
                              title="Rozúčtování na nájemce" aria-label="Rozúčtování na nájemce"
                              className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                                otevrene ? "bg-accent-soft text-accent" : "text-ink-muted hover:bg-accent-soft hover:text-accent"}`}>
                              <Ikona nazev="najemce" />
                            </button>}
                            {canEdit && (
                              <>
                                <span className="mx-1.5 h-5 w-px bg-line" aria-hidden />
                                <UpravitTlacitko aktivni={upravaId === v.id}
                                  onClick={() => setUpravaId(upravaId === v.id ? null : v.id)} />
                                <SmazatTlacitko action={delAction} id={v.id}
                                  potvrzeni={v.batchId ? `Smazat společné vyúčtování ${obdobi(v.od, v.do)} u všech ${v.batchPocet} služeb?` : `Smazat vyúčtování ${obdobi(v.od, v.do)}?`} />
                              </>
                            )}
                          </div>
                        </div>
                        {prilohy.has(v.id) && (
                          <div className="border-t border-line/70 px-3.5 py-3">
                            {diskPripojen || (dokumenty[v.id] ?? []).length > 0 ? (
                              <Dokumenty
                                kontext={{ kategorie: "SLUZBA_VYUCTOVANI", sluzbaId: v.serviceId, settlementId: v.id, rok: Number(v.do.slice(0, 4)) }}
                                dokumenty={dokumenty[v.id] ?? []} canEdit={canEdit && diskPripojen}
                                nadpis="Přidat soubor k vyúčtování"
                                popis="Přetáhni sem fakturu nebo vyúčtování od dodavatele (PDF, sken, foto)."
                                prazdne="K tomuto vyúčtování zatím není žádný soubor." />
                            ) : (
                              <p className="text-sm text-ink-secondary">
                                Google Disk zatím není připojený, soubory nejde nahrát. Připoj ho ve{" "}
                                <a href="/sprava" className="text-accent hover:underline">Správě</a>.
                              </p>
                            )}
                          </div>
                        )}
                        {otevrene && vicNajemcu && (
                          <div className="border-t border-line/70 bg-surface-sunken/50 px-3.5 py-2.5">
                            {rozdel.chyba ? (
                              <p className="text-xs text-bad">{rozdel.chyba}</p>
                            ) : (
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-left text-ink-muted">
                                    <th className="py-1 font-medium">Kdo</th>
                                    <th className="py-1 font-medium">Období</th>
                                    <th className="py-1 text-right font-medium">{v.rezim === "READINGS" ? "Spotřeba" : "Dnů"}</th>
                                    <th className="py-1 text-right font-medium">Podíl</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {rozdel.podily.map((p) => (
                                    <tr key={p.leaseId}>
                                      <td className="py-0.5">{p.nazev}</td>
                                      <td className="py-0.5 tabular-nums text-ink-secondary">{p.od && p.do ? obdobi(p.od, p.do) : "—"}</td>
                                      <td className="py-0.5 text-right tabular-nums">
                                        {v.rezim === "READINGS"
                                          ? p.chybiOdecet ? <span className="text-warn">chybí</span> : p.spotreba
                                          : p.dnu}
                                      </td>
                                      <td className="py-0.5 text-right font-medium tabular-nums">{czk(p.podil)}</td>
                                    </tr>
                                  ))}
                                  {(rozdel.vlastnik.dnu > 0 || rozdel.vlastnik.podil > 0) && (
                                    <tr className="text-ink-muted">
                                      <td className="py-0.5" colSpan={2}>Vlastník (byt bez nájemce)</td>
                                      <td className="py-0.5 text-right tabular-nums">
                                        {v.rezim === "READINGS" ? v.spotrebaVlastnik ?? 0 : rozdel.vlastnik.dnu}
                                      </td>
                                      <td className="py-0.5 text-right tabular-nums">{czk(rozdel.vlastnik.podil)}</td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {canEdit && upravovane && (
        <UpravaPanel nadpis={`Upravit vyúčtování ${obdobi(upravovane.od, upravovane.do)}`} onZavrit={() => setUpravaId(null)}>
          <Formular typy={typy} key={upravovane.id} r={upravovane} services={services} leases={leases} vyuctovani={vyuctovani}
            action={upravaAction} pending={upravuji} popisekTlacitka="Uložit změny" />
        </UpravaPanel>
      )}

      {canEdit && !upravovane && (
        <Rozbalovaci popisek="Přidat vyúčtování od dodavatele" zavritPo={addState.success}>
          <Formular typy={typy} r={null} services={services} leases={leases} vyuctovani={vyuctovani}
            action={addAction} pending={adding} popisekTlacitka="Uložit vyúčtování" />
        </Rozbalovaci>
      )}
      {canEdit && !upravovane && services.length >= 2 && (
        <Rozbalovaci popisek="Společné vyúčtování více služeb" zavritPo={skupinaState.success}>
          <SkupinaFormular services={services} typy={typy} action={skupinaAction} pending={skupinaBezi} />
        </Rozbalovaci>
      )}
    </div>
  );
}

/**
 * Pruvodce spolecnym vyuctovanim: 1) sluzby, 2) obdobi, 3) castky. Zalohy, ktere se
 * dodavateli za obdobi zaplatily, dopocita sam z mesicnich plateb sluzeb.
 */
function SkupinaFormular({ services, typy, action, pending }: {
  services: SluzbaRadek[]; typy: TypySluzeb;
  action: (payload: FormData) => void; pending: boolean;
}) {
  const [krok, setKrok] = useState<1 | 2 | 3>(1);
  const [vybrane, setVybrane] = useState<Set<string>>(new Set());
  const [od, setOd] = useState<string | null>(null);
  const [doDne, setDoDne] = useState<string | null>(null);
  const [zaplaceno, setZaplaceno] = useState<ZaplacenoSluzbe[] | null>(null);
  const [zalohy, setZalohy] = useState<Record<string, string>>({});
  const [naklad, setNaklad] = useState("");
  // Skutecny naklad po sluzbach (nepovinne): kdyz je vyplneny u vsech, celkovy naklad je jejich soucet
  const [skutecnost, setSkutecnost] = useState<Record<string, string>>({});
  const [nacitam, setNacitam] = useState(false);
  const [chyba, setChyba] = useState("");

  const skupiny = [...new Set(services.map((s) => s.groupName).filter((g): g is string => !!g))].sort();
  const prepni = (id: string) => setVybrane((v) => { const n = new Set(v); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  // Skupina se prepina: klik prida vsechny jeji sluzby, dalsi klik je odebere; skupin jde vybrat vic
  const clenove = (g: string) => services.filter((s) => s.groupName === g).map((s) => s.id);
  const celaVybrana = (g: string) => clenove(g).every((id) => vybrane.has(id));
  const vyberSkupinu = (g: string) => setVybrane((v) => {
    const n = new Set(v);
    const ids = clenove(g);
    if (ids.every((id) => n.has(id))) ids.forEach((id) => n.delete(id));
    else ids.forEach((id) => n.add(id));
    return n;
  });
  const nazev = (id: string) => { const s = services.find((x) => x.id === id); return s ? `${nazevDruhu(typy, s.type)} · ${s.provider}` : id; };

  async function dalKCastkam() {
    if (!od || !doDne || od > doDne) { setChyba("Zadej platné období od–do."); return; }
    setChyba("");
    setNacitam(true);
    const r = await zaplacenoDodavateli([...vybrane], od, doDne);
    setNacitam(false);
    if (r.error) { setChyba(r.error); return; }
    setZaplaceno(r.sluzby ?? []);
    setZalohy(Object.fromEntries((r.sluzby ?? []).map((x) => [x.id, String(x.zaplaceno)])));
    setKrok(3);
  }

  const soucetZaloh = Object.values(zalohy).reduce((a, v) => a + (cislo(v) || 0), 0);
  const ids = zaplaceno?.map((x) => x.id) ?? [];
  const vyplnenoSkutecnost = ids.filter((id) => (skutecnost[id] ?? "").trim() !== "");
  const poPolozkach = vyplnenoSkutecnost.length > 0;
  const vsechnyPolozky = poPolozkach && vyplnenoSkutecnost.length === ids.length;
  const soucetSkutecnosti = vyplnenoSkutecnost.reduce((a, id) => a + (cislo(skutecnost[id]) || 0), 0);
  const nakladCislo = poPolozkach ? soucetSkutecnosti : cislo(naklad);
  const vysledek = Number.isFinite(nakladCislo) && (poPolozkach || naklad !== "") ? soucetZaloh - nakladCislo : null;

  const kroky = ["Služby", "Období", "Částky"];
  return (
    <form action={action} className="space-y-4">
      {/* Ukazatel kroku: kolecka spojena carou, hotove kroky jdou kliknutim vratit */}
      <ol className="flex items-center">
        {kroky.map((k, i) => {
          const c = i + 1;
          const hotovo = krok > c;
          const aktivni = krok === c;
          return (
            <li key={k} className={`flex items-center ${i < kroky.length - 1 ? "flex-1" : ""}`}>
              <button type="button" disabled={!hotovo} onClick={() => hotovo && setKrok(c as 1 | 2 | 3)}
                className="flex items-center gap-2 disabled:cursor-default">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                  hotovo ? "bg-good text-white" : aktivni ? "bg-accent text-white ring-4 ring-accent/20" : "border-2 border-line bg-surface-card text-ink-muted"}`}>
                  {hotovo ? "✓" : c}
                </span>
                <span className={`hidden text-sm sm:inline ${aktivni ? "font-semibold text-ink-primary" : hotovo ? "text-good" : "text-ink-muted"}`}>{k}</span>
              </button>
              {i < kroky.length - 1 && (
                <span className="mx-3 h-1 flex-1 overflow-hidden rounded-full bg-line">
                  <span className={`block h-full rounded-full bg-good transition-all duration-500 ${hotovo ? "w-full" : "w-0"}`} />
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {chyba && <p className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">{chyba}</p>}

      {krok === 1 && (
        <div>
          <div className="label mb-1.5">Které služby jsou na jednom dokladu?</div>
          {skupiny.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {skupiny.map((g) => (
                <button key={g} type="button" aria-pressed={celaVybrana(g)} onClick={() => vyberSkupinu(g)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${celaVybrana(g)
                    ? "border-accent bg-accent text-white" : "border-line text-ink-secondary hover:border-accent hover:text-accent"}`}>
                  {celaVybrana(g) ? "✓ " : "+ "}{g} ({clenove(g).length})
                </button>
              ))}
            </div>
          )}
          <div className="grid gap-1.5 sm:grid-cols-2">
            {services.map((s) => (
              <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-sm">
                <input type="checkbox" checked={vybrane.has(s.id)} onChange={() => prepni(s.id)} className="h-4 w-4 accent-accent" />
                <span className="min-w-0 flex-1 truncate">{nazevDruhu(typy, s.type)} · {s.provider}</span>
                {s.groupName && <span className="text-xs text-ink-muted">{s.groupName}</span>}
              </label>
            ))}
          </div>
          <div className="mt-3 flex justify-end">
            <button type="button" className="btn btn-primary" disabled={vybrane.size < 2} onClick={() => setKrok(2)}>
              Dál: období ({vybrane.size} služeb)
            </button>
          </div>
        </div>
      )}

      {krok === 2 && (
        <div>
          <div className="grid gap-3 sm:grid-cols-2">
            <DatumPole label="Období od" name="obdobi-od" hodnota={od} defaultValue={od ?? ""} onChange={setOd} />
            <DatumPole label="Období do" name="obdobi-do" hodnota={doDne} defaultValue={doDne ?? ""} onChange={setDoDne} />
          </div>
          <p className="mt-2 text-xs text-ink-muted">Za toto období spočítám, kolik se dodavateli na zálohách zaplatilo.</p>
          <div className="mt-3 flex justify-between">
            <button type="button" className="btn" onClick={() => setKrok(1)}>Zpět</button>
            <button type="button" className="btn btn-primary" disabled={!od || !doDne || nacitam} onClick={dalKCastkam}>
              {nacitam ? "Počítám zálohy…" : "Dál: částky"}
            </button>
          </div>
        </div>
      )}

      {krok === 3 && zaplaceno && (
        <div className="space-y-3">
          <p className="text-sm text-ink-secondary">Období {od && doDne ? obdobi(od, doDne) : ""}</p>
          <div className="rounded-xl border border-line">
            <div className="flex items-center gap-3 border-b border-line px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              <span className="flex-1">Služba</span>
              <span className="w-32 text-right">Zálohy zaplaceno</span>
              <span className="w-32 text-right">Skutečnost</span>
              <span className="w-24 text-right">Rozdíl</span>
            </div>
            <ul className="divide-y divide-line/60">
              {zaplaceno.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    {nazev(x.id)}
                    <span className="block text-xs text-ink-muted">
                      {x.mesicu === 0 ? "v evidenci nejsou měsíční platby za toto období"
                        : `${x.mesicu} měs. · podle předpisu ${czk(x.predpis)}${x.zaplacenychMesicu ? ` · ${x.zaplacenychMesicu} měs. označeno jako zaplaceno` : " · zaplacení neoznačeno, bere se předpis"}`}
                    </span>
                  </span>
                  <input type="text" inputMode="decimal" aria-label={`Zálohy: ${nazev(x.id)}`} className="input w-32 py-1 text-right tabular-nums"
                    value={zalohy[x.id] ?? ""} onChange={(e) => setZalohy((z) => ({ ...z, [x.id]: e.target.value }))} />
                  <input type="text" inputMode="decimal" aria-label={`Skutečnost: ${nazev(x.id)}`} placeholder="z dokladu"
                    className="input w-32 py-1 text-right tabular-nums"
                    value={skutecnost[x.id] ?? ""} onChange={(e) => setSkutecnost((z) => ({ ...z, [x.id]: e.target.value }))} />
                  {(() => {
                    const sk = (skutecnost[x.id] ?? "").trim();
                    if (!sk) return <span className="w-24" />;
                    const r = (cislo(zalohy[x.id] ?? "0") || 0) - (cislo(sk) || 0);
                    return <span className={`w-24 text-right text-xs font-semibold tabular-nums ${r >= 0 ? "text-good" : "text-bad"}`}>{r >= 0 ? "+" : "−"}{czk(Math.abs(r))}</span>;
                  })()}
                </li>
              ))}
              <li className="flex items-center gap-3 px-3 py-2 text-sm font-semibold">
                <span className="flex-1">Celkem</span>
                <span className="w-32 text-right tabular-nums">{czk(soucetZaloh)}</span>
                <span className="w-32 text-right tabular-nums">{poPolozkach ? czk(soucetSkutecnosti) : "—"}</span>
                <span className="w-24" />
              </li>
            </ul>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label mb-1.5 block" htmlFor="pruvodce-naklad">Skutečný náklad celkem (Kč)</label>
              {poPolozkach ? (
                <p className="input bg-surface-sunken text-right font-semibold tabular-nums">{czk(soucetSkutecnosti)}</p>
              ) : (
                <input id="pruvodce-naklad" type="text" inputMode="decimal" className="input text-right tabular-nums"
                  value={naklad} onChange={(e) => setNaklad(e.target.value)} />
              )}
              <p className="mt-1 text-xs text-ink-muted">
                {poPolozkach
                  ? vsechnyPolozky ? "Součet skutečnosti po službách." : `Doplň skutečnost u všech služeb (chybí ${ids.length - vyplnenoSkutecnost.length}).`
                  : "Zadej celkem z dokladu, nebo vyplň skutečnost u každé služby."}
              </p>
            </div>
            <div className="flex items-end">
              {vysledek != null && (
                <p className={`w-full rounded-lg px-3 py-2 text-sm font-semibold ${vysledek >= 0 ? "bg-good/10 text-good" : "bg-bad/10 text-bad"}`}>
                  {vysledek >= 0 ? "Přeplatek" : "Nedoplatek"} {czk(Math.abs(vysledek))}
                </p>
              )}
            </div>
            <Pole label="Číslo dokladu" name="invoiceNo" placeholder="nepovinné" />
            <TextPole label="Poznámka" name="notes" />
          </div>
          <p className="text-xs text-ink-muted">
            {poPolozkach ? "Každá služba se vyúčtuje svou skutečností a zálohami." : "Celkový náklad se rozdělí mezi služby podle jejich měsíčních nákladů, zálohy podle částek výše."}
          </p>

          {[...vybrane].map((id) => <input key={id} type="hidden" name="serviceId" value={id} />)}
          <input type="hidden" name="periodFrom" value={od ?? ""} />
          <input type="hidden" name="periodTo" value={doDne ?? ""} />
          <input type="hidden" name="totalCost" value={Number.isFinite(nakladCislo) ? String(nakladCislo) : ""} />
          <input type="hidden" name="supplierAdvances" value={String(soucetZaloh)} />
          {vsechnyPolozky && (
            <input type="hidden" name="nakladyPoSluzbach" value={JSON.stringify(Object.fromEntries(ids.map((id) => [id, cislo(skutecnost[id]) || 0])))} />
          )}
          <input type="hidden" name="zalohyPoSluzbach" value={JSON.stringify(Object.fromEntries(Object.entries(zalohy).map(([k, v]) => [k, cislo(v) || 0])))} />

          <div className="flex justify-between">
            <button type="button" className="btn" onClick={() => setKrok(2)}>Zpět</button>
            <button type="submit" disabled={pending || (poPolozkach ? !vsechnyPolozky : naklad === "" || !Number.isFinite(nakladCislo))} className="btn btn-primary">
              {pending ? "Ukládám…" : "Uložit společné vyúčtování"}
            </button>
          </div>
        </div>
      )}
    </form>
  );
}

function Formular({ r, services, leases, vyuctovani, action, pending, popisekTlacitka, typy }: {
  typy: TypySluzeb;
  r: VyuctovaniRadek | null; services: SluzbaRadek[]; leases: NajemRadek[]; vyuctovani: VyuctovaniRadek[];
  action: (payload: FormData) => void; pending: boolean; popisekTlacitka: string;
}) {
  const [sluzbaId, setSluzbaId] = useState(r?.serviceId ?? services[0]?.id ?? "");
  const [od, setOd] = useState<string | null>(r?.od ?? null);
  const [doDne, setDoDne] = useState<string | null>(r?.do ?? null);
  const [naklad, setNaklad] = useState(r ? String(r.naklad) : "");
  const [rezim, setRezim] = useState<string>(r?.rezim ?? "DAYS");
  const [odecty, setOdecty] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(r?.odecty ?? {}).map(([k, v]) => [k, String(v)])));
  const [vlastnik, setVlastnik] = useState(r?.spotrebaVlastnik != null ? String(r.spotrebaVlastnik) : "");

  // Nove vyuctovani navazuje na predchozi: zacina den po konci posledniho
  const navrhOd = useMemo(() => {
    const konce = vyuctovani.filter((v) => v.serviceId === sluzbaId).map((v) => v.do).sort();
    return konce.length ? pridejDny(konce[konce.length - 1], 1) : "";
  }, [vyuctovani, sluzbaId]);

  // Najemci, kterych se obdobi tyka — u odectu se jim zadava spotreba
  const dotcene = od && doDne ? leases.filter((l) => prunik(l.od, l.do, od, doDne)) : [];

  // Ptame se jen tehdy, kdyz v obdobi bydleli aspon dva najemci; jinak neni co delit
  const delit = dotcene.length >= 2;

  const nahled = delit && od && doDne && od <= doDne && cislo(naklad) >= 0 && naklad !== ""
    ? rozuctuj({
      id: "nahled", od, do: doDne, naklad: cislo(naklad), zalohyDodavateli: 0,
      rezim: rezim === "READINGS" ? "READINGS" : "DAYS",
      spotrebaVlastnik: cislo(vlastnik) || 0,
      odecty: Object.fromEntries(Object.entries(odecty).filter(([, v]) => v !== "").map(([k, v]) => [k, cislo(v)])),
    }, leases)
    : null;

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="label mb-1.5 block" htmlFor="serviceId">Služba</label>
        <select id="serviceId" name="serviceId" className="input" value={sluzbaId}
          onChange={(e) => setSluzbaId(e.target.value)}>
          {services.map((s) => <option key={s.id} value={s.id}>{`${nazevDruhu(typy, s.type)} · ${s.provider}`}</option>)}
        </select>
      </div>
      <DatumPole key={`od-${r?.id ?? sluzbaId}`} label="Období od" name="periodFrom" required
        defaultValue={r?.od ?? navrhOd} onChange={setOd}
        hint={!r && navrhOd ? "Navazuje na předchozí vyúčtování této služby." : undefined} />
      <DatumPole label="Období do (včetně)" name="periodTo" required defaultValue={r?.do ?? ""} onChange={setDoDne}
        hint="Nemusí to být celý měsíc ani rok — zadej přesně, co vyúčtování pokrývá." />
      <Pole label="Skutečný náklad za období (Kč)" name="totalCost" type="number" step="0.01" required
        value={naklad} onChange={(e) => setNaklad(e.target.value)} />
      <Pole label="Zálohy zaplacené dodavateli (Kč)" name="supplierAdvances" type="number" step="0.01"
        defaultValue={r?.zalohyDodavateli ?? 0} hint="Rozdíl proti nákladu je přeplatek nebo nedoplatek u dodavatele" />
      <Pole label="Číslo dokladu" name="invoiceNo" placeholder="nepovinné" defaultValue={r?.cisloFaktury ?? ""} />
      {delit ? (
        <div className="space-y-2 sm:col-span-2">
          <div className="flex items-start gap-2.5 rounded-xl bg-warn/15 px-3.5 py-2.5 text-sm" role="status">
            <Ikona nazev="pozor" trida="mt-0.5 h-4 w-4 shrink-0 text-warn" />
            <div>
              <div className="font-semibold">V tomto období bydleli {dotcene.length} nájemci</div>
              <ul className="mt-0.5 text-xs text-ink-secondary">
                {dotcene.map((l) => (
                  <li key={l.id}>{l.nazev}: {dateCz(l.od)} – {l.do ? dateCz(l.do) : "dosud"}</li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-ink-secondary">Zvol, jak se náklad mezi ně rozdělí.</p>
            </div>
          </div>
          <Vyber label="Jak rozdělit mezi nájemce" name="splitMode" defaultValue={rezim} onChange={setRezim}
            options={[["DAYS", "Podle dnů bydlení"], ["READINGS", "Podle odečtů (spotřeby)"]]} />
        </div>
      ) : (
        <input type="hidden" name="splitMode" value="DAYS" />
      )}

      {delit && rezim === "READINGS" && (
        <div className="space-y-3 rounded-xl bg-surface-sunken p-3 sm:col-span-2">
          <Pole label="Jednotka spotřeby" name="readingUnit" placeholder="m³, kWh, GJ…" defaultValue={r?.jednotka ?? ""} />
          {dotcene.length === 0 && (
            <p className="text-xs text-ink-muted">Zadej období — pak se ukážou nájemci, kterých se týká.</p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {dotcene.map((l) => (
              <Pole key={l.id} label={`Spotřeba: ${l.nazev} (${dateCz(l.od)} – ${l.do ? dateCz(l.do) : "dosud"})`}
                name={`odecet:${l.id}`} type="number" step="any"
                value={odecty[l.id] ?? ""} onChange={(e) => setOdecty((o) => ({ ...o, [l.id]: e.target.value }))} />
            ))}
            <Pole label="Spotřeba mimo nájemce (prázdný byt, společné)" name="ownerConsumption" type="number" step="any"
              value={vlastnik} onChange={(e) => setVlastnik(e.target.value)} placeholder="nepovinné" />
          </div>
        </div>
      )}

      {nahled && !nahled.chyba && (
        <div className="rounded-xl bg-accent-soft/60 px-3.5 py-2.5 text-sm sm:col-span-2" role="status">
          <div className="mb-1 font-semibold">Takhle se rozúčtuje</div>
          <ul className="space-y-0.5 text-xs text-ink-secondary">
            {nahled.podily.map((p) => (
              <li key={p.leaseId} className="flex justify-between gap-3">
                <span>{p.nazev} · {rezim === "READINGS" ? (p.chybiOdecet ? "chybí odečet" : `${p.spotreba}`) : `${p.dnu} dní`}</span>
                <span className="tabular-nums font-medium">{czk(p.podil)}</span>
              </li>
            ))}
            {(nahled.vlastnik.dnu > 0 || nahled.vlastnik.podil > 0) && (
              <li className="flex justify-between gap-3">
                <span>Vlastník{rezim === "DAYS" ? ` · ${nahled.vlastnik.dnu} dní bez nájemce` : ""}</span>
                <span className="tabular-nums">{czk(nahled.vlastnik.podil)}</span>
              </li>
            )}
          </ul>
        </div>
      )}
      {nahled?.chyba && <p className="text-xs text-bad sm:col-span-2">{nahled.chyba}</p>}

      {/* Nejvyse jeden najemce: nedeli se, ale dny bez nej nese vlastnik — na to se ma upozornit */}
      {!delit && od && doDne && od <= doDne && naklad !== "" && (() => {
        const n = rozuctuj({
          id: "n", od, do: doDne, naklad: cislo(naklad) || 0, zalohyDodavateli: 0, rezim: "DAYS", odecty: {},
        }, leases);
        if (n.vlastnik.dnu === 0) return null;
        const jmeno = dotcene[0]?.nazev;
        return (
          <div className="flex items-start gap-2.5 rounded-xl bg-warn/15 px-3.5 py-2.5 text-sm sm:col-span-2" role="status">
            <Ikona nazev="pozor" trida="mt-0.5 h-4 w-4 shrink-0 text-warn" />
            <div>
              <div className="font-semibold">
                {dotcene.length === 0
                  ? "V tomto období nebyl v bytě žádný nájemce"
                  : `Nájemce ${jmeno} v období bydlel jen část doby`}
              </div>
              <p className="mt-0.5 text-xs text-ink-secondary">
                {n.vlastnik.dnu} z {n.dnuObdobi} dní je bez nájemce, takže {czk(n.vlastnik.podil)} ponesl{" "}
                vlastník{dotcene.length === 1 ? ` a nájemci se účtuje jen ${czk(n.podily[0]?.podil ?? 0)}` : ""}.
                Zkontroluj, jestli období nebo doba nájmu sedí.
              </p>
            </div>
          </div>
        );
      })()}

      <TextPole label="Poznámka" name="notes" sirka="sm:col-span-2" defaultValue={r?.poznamka ?? ""} placeholder="nepovinné" />
      <div className="sm:col-span-2">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Ukládám…" : popisekTlacitka}
        </button>
      </div>
    </form>
  );
}
