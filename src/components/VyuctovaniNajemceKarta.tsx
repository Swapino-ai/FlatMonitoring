"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import {
  nastavSplatnost, oznacOdeslano, oznacVyporadano, stornoVyuctovani, vydejVyuctovani, zrusVyporadani,
  type VydaniState,
} from "@/lib/vyuctovaniNajemceActions";
import { pridejDny, vyuctovaniNajemce, type NajemVstup, type SluzbaVyuctovani } from "@/lib/vyuctovani";
import {
  kolize, lhutaDoruceni, NAZVY_STAVU, NAZVY_ZPUSOBU, odkazMailto, sestavSnapshot, stavLhuty, textZpravy,
  vychoziSplatnost, type SnapshotVyuctovani, type StavVyuctovani,
} from "@/lib/vyuctovaniVydane";
import { czk, dateCz } from "@/lib/format";
import { Hlaska, UpravaPanel, Vyber } from "./form";
import { DatumPole } from "./DatumPole";
import { Dokumenty, type DokumentRadek } from "./Dokumenty";
import { Ikona } from "./Ikony";
import { Badge } from "./Stat";
import { VyuctovaniDokument, vytisknout } from "./VyuctovaniDokument";

export interface NajemceNajem extends NajemVstup {
  tenantId: string | null;
  cislo: string | null;
  email: string | null;
  phone: string | null;
  adresa: string;
  ucet: string | null;
  /** Pronajimatel teto smlouvy (vybrany na smlouve, jinak provozovatel nemovitosti). */
  pronajimatel: SnapshotVyuctovani["pronajimatel"];
}

export interface VydanoRadek {
  id: string;
  cislo: string;
  leaseId: string | null;
  tenantId: string | null;
  od: string;
  do: string;
  result: number;
  status: StavVyuctovani;
  issuedAt: string;
  sentAt: string | null;
  sentVia: string | null;
  dueDate: string | null;
  settledAt: string | null;
  settledNote: string | null;
  stornoReason: string | null;
  snapshot: SnapshotVyuctovani;
  dokumenty: DokumentRadek[];
}

const dnesISO = () => new Date().toISOString().slice(0, 10);
const obdobi = (od: string, doDne: string) => `${dateCz(od)} – ${dateCz(doDne)}`;
const TON: Record<StavVyuctovani, "neutral" | "good" | "warn" | "bad"> = {
  VYDANO: "warn", ODESLANO: "neutral", VYPORADANO: "good", STORNO: "bad",
};

/**
 * Vyuctovani pro najemce: priprava za zvolene obdobi (s nahledem), vydani dokladu
 * a sprava vydanych — odeslani, vyporadani a storno.
 */
export function VyuctovaniNajemceKarta({ nemovitost, najmy, sluzby, vydana, canEdit, diskPripojen }: {
  nemovitost: { nazev: string; adresa: string };
  najmy: NajemceNajem[];
  sluzby: SluzbaVyuctovani[];
  vydana: VydanoRadek[];
  canEdit: boolean;
  diskPripojen: boolean;
}) {
  const razene = useMemo(() => [...najmy].sort((a, b) => (a.od < b.od ? 1 : -1)), [najmy]);
  const dnes = dnesISO();
  const vychoziKonec = (n: NajemVstup) => (n.do && n.do < dnes ? n.do : dnes);

  const [najemId, setNajemId] = useState(razene[0]?.id ?? "");
  const najem = razene.find((n) => n.id === najemId) ?? null;
  const [od, setOd] = useState<string | null>(najem?.od ?? null);
  const [doDne, setDoDne] = useState<string | null>(najem ? vychoziKonec(najem) : null);
  const [klic, setKlic] = useState(0);
  const [splatnost, setSplatnost] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const [stav, akce, vydavam] = useActionState<VydaniState, FormData>(vydejVyuctovani, {});
  useEffect(() => { if (stav.success) setKlic((k) => k + 1); }, [stav.success]);

  function nastav(o: string, d: string) { setOd(o); setDoDne(d); setKlic((k) => k + 1); }
  function vyber(id: string) {
    setNajemId(id);
    const n = razene.find((x) => x.id === id);
    if (n) nastav(n.od, vychoziKonec(n));
  }

  const v = najem && od && doDne && od <= doDne ? vyuctovaniNajemce(najem, najmy, sluzby, od, doDne) : null;
  const platne = v && !v.chyba && najem ? v : null;
  const snapshot = platne && najem
    ? sestavSnapshot({
      nemovitost,
      najemce: { cislo: najem.cislo, name: najem.nazev, adresa: najem.adresa, email: najem.email, phone: najem.phone, ucet: najem.ucet },
      pronajimatel: najem.pronajimatel, v: platne, aktualniZaloha: najem.utilitiesMonthly,
    })
    : null;

  const splatnostVychozi = pridejDny(dnes, 30);
  const hodnotaSplatnosti = splatnost ?? splatnostVychozi;
  const ostra = snapshot ? snapshot.rozdil : 0;
  const kolizeSVydanym = platne && najem
    ? kolize(vydana.filter((x) => x.leaseId === najem.id).map((x) => ({ cislo: x.cislo, od: x.od, do: x.do, status: x.status })), platne.od, platne.do)
    : null;
  const neuplne = snapshot ? snapshot.nepokryto.length > 0 : false;
  const rok = new Date().getFullYear();

  const detail = vydana.find((x) => x.id === detailId) ?? null;

  if (najmy.length === 0) {
    return <p className="py-3 text-center text-sm text-ink-muted">Žádná nájemní smlouva, není komu vyúčtování udělat.</p>;
  }

  return (
    <div className="space-y-6">
      {/* 1) Priprava */}
      <section>
        <div className="grid gap-3 sm:grid-cols-3 print:hidden">
          <Vyber label="Nájemce" name="najemce" defaultValue={najemId} onChange={vyber} sirka="sm:col-span-3"
            options={razene.map((n) => [n.id, `${n.nazev} (${dateCz(n.od)} – ${n.do ? dateCz(n.do) : "dosud"})`])} />
          <DatumPole key={`od-${najemId}-${klic}`} label="Vyúčtování od" name="odPohled" defaultValue={od ?? ""} onChange={setOd} />
          <DatumPole key={`do-${najemId}-${klic}`} label="Vyúčtování do" name="doPohled" defaultValue={doDne ?? ""} onChange={setDoDne} />
          <div className="flex flex-wrap items-end gap-1.5 pb-0.5">
            {najem && <button type="button" className="btn text-xs" onClick={() => nastav(najem.od, vychoziKonec(najem))}>Celý nájem</button>}
            <button type="button" className="btn text-xs" onClick={() => nastav(`${rok - 1}-01-01`, `${rok - 1}-12-31`)}>Loni</button>
            <button type="button" className="btn text-xs" onClick={() => nastav(`${rok}-01-01`, dnes)}>Letos</button>
          </div>
        </div>

        {v?.chyba && <p className="mt-4 rounded-lg bg-warn/15 px-3 py-2 text-sm">{v.chyba}</p>}

        {snapshot && platne && (
          <div className="mt-5 space-y-3">
            {neuplne && (
              <div className="rounded-xl bg-warn/15 px-4 py-3 text-sm print:hidden" role="status">
                <div className="flex items-start gap-2.5">
                  <Ikona nazev="pozor" trida="mt-0.5 h-4 w-4 shrink-0 text-warn" />
                  <div>
                    <div className="font-semibold">Vyúčtování je neúplné</div>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-ink-secondary">
                      {snapshot.nepokryto.map((n, i) => <li key={i}>{n.sluzba}: {n.popis}</li>)}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            <VyuctovaniDokument s={snapshot} koncept splatnost={Math.abs(ostra) >= 1 ? hodnotaSplatnosti : null} />

            <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
              <p className="text-xs text-ink-muted">
                Zákon o službách spojených s užíváním bytu počítá s vyúčtováním obvykle do 4 měsíců od konce období
                (u tohoto období do {dateCz(lhutaDoruceni(platne.do))}).
              </p>
              <button type="button" className="btn text-xs" onClick={vytisknout}>Vytisknout náhled</button>
            </div>

            {canEdit && (
              <form action={akce} className="space-y-3 rounded-xl border border-line p-4 print:hidden">
                <input type="hidden" name="leaseId" value={najem!.id} />
                <input type="hidden" name="od" value={platne.od} />
                <input type="hidden" name="do" value={platne.do} />
                <h4 className="text-sm font-semibold">Vydat vyúčtování nájemci</h4>
                <p className="text-xs text-ink-secondary">
                  Vydáním se čísla zmrazí a dokladu se přidělí číslo a variabilní symbol. Pozdější úprava vyúčtování
                  dodavatele už vydaný doklad nezmění; opravu uděláš stornem a novým vydáním.
                </p>
                {Math.abs(ostra) >= 1 && (
                  <DatumPole key={`spl-${najemId}-${klic}`} label={ostra < 0 ? "Splatnost nedoplatku" : "Přeplatek vrátit do"}
                    name="dueDate" defaultValue={splatnostVychozi} onChange={(x) => setSplatnost(x)}
                    hint={`Výchozí je ${dateCz(vychoziSplatnost(dnes))}, tedy 30 dní od vydání.`} />
                )}
                {neuplne && (
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" name="potvrditNeuplne" className="mt-1" />
                    <span>Rozumím, že chybí údaje, a přesto chci vydat <strong>neúplné</strong> vyúčtování.</span>
                  </label>
                )}
                {kolizeSVydanym && (
                  <p className="text-sm text-bad">
                    Období se překrývá s vyúčtováním {kolizeSVydanym.cislo} ({obdobi(kolizeSVydanym.od, kolizeSVydanym.do)}).
                    Nejdřív ho stornuj.
                  </p>
                )}
                <Hlaska state={stav} />
                <button type="submit" disabled={vydavam || !!kolizeSVydanym || platne.radky.length === 0} className="btn btn-primary">
                  {vydavam ? "Vydávám…" : "Vydat vyúčtování"}
                </button>
              </form>
            )}
          </div>
        )}
      </section>

      {/* 2) Vydana */}
      <section className="print:hidden">
        <h3 className="mb-2 text-sm font-semibold">Vydaná vyúčtování ({vydana.length})</h3>
        {vydana.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-3 py-4 text-center text-sm text-ink-muted">
            Zatím nic nevydáno. Vyúčtování se po vydání objeví tady a půjde sledovat až do vypořádání.
          </p>
        ) : (
          <ul className="divide-y divide-line/70 rounded-xl border border-line">
            {vydana.map((x) => {
              const lhuta = stavLhuty({ status: x.status, dueDate: x.dueDate }, dnes);
              const nedoplatek = x.result <= -1;
              const preplatek = x.result >= 1;
              return (
                <li key={x.id} className={detailId === x.id ? "bg-accent-soft/40" : undefined}>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3.5 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className={`text-sm font-medium ${x.status === "STORNO" ? "line-through opacity-60" : ""}`}>
                        {x.cislo} · {x.snapshot.najemce.name}
                      </div>
                      <div className="text-xs tabular-nums text-ink-muted">{obdobi(x.od, x.do)} · vydáno {dateCz(x.issuedAt)}</div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-semibold tabular-nums ${x.status === "STORNO" ? "opacity-50" : nedoplatek ? "text-bad" : preplatek ? "text-good" : ""}`}>
                        {nedoplatek ? `nedoplatek ${czk(-x.result)}` : preplatek ? `přeplatek ${czk(x.result)}` : "bez doplatku"}
                      </div>
                      {lhuta.dni != null && (
                        <div className={`text-xs ${lhuta.poSplatnosti ? "font-medium text-bad" : "text-ink-muted"}`}>
                          {lhuta.poSplatnosti ? `po splatnosti ${-lhuta.dni} dní` : lhuta.dni === 0 ? "splatné dnes" : `splatnost za ${lhuta.dni} dní`}
                        </div>
                      )}
                    </div>
                    <Badge tone={TON[x.status]}>{x.status === "VYDANO" ? "čeká na odeslání" : NAZVY_STAVU[x.status]}</Badge>
                    <button type="button" onClick={() => setDetailId(detailId === x.id ? null : x.id)} aria-expanded={detailId === x.id}
                      title="Otevřít vyúčtování" aria-label="Otevřít vyúčtování"
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                        detailId === x.id ? "bg-accent-soft text-accent" : "text-ink-muted hover:bg-accent-soft hover:text-accent"}`}>
                      <Ikona nazev="dokument" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {detail && (
          <UpravaPanel key={detail.id} nadpis={`Vyúčtování ${detail.cislo}`} onZavrit={() => setDetailId(null)}>
            <Detail x={detail} canEdit={canEdit} diskPripojen={diskPripojen}
              znovu={() => {
                const n = najmy.find((m) => m.id === detail.leaseId);
                if (n) { setNajemId(n.id); nastav(detail.od, detail.do); setDetailId(null); window.scrollTo({ top: 0, behavior: "smooth" }); }
              }} />
          </UpravaPanel>
        )}
      </section>
    </div>
  );
}

/** Jedno vydane vyuctovani: dokument, predani najemci, vyporadani a storno. */
function Detail({ x, canEdit, diskPripojen, znovu }: { x: VydanoRadek; canEdit: boolean; diskPripojen: boolean; znovu: () => void }) {
  const [odeslano, odeslanoAkce] = useActionState<VydaniState, FormData>(oznacOdeslano, {});
  const [vyporadano, vyporadanoAkce] = useActionState<VydaniState, FormData>(oznacVyporadano, {});
  const [zruseno, zrusAkce] = useActionState<VydaniState, FormData>(zrusVyporadani, {});
  const [splatnost, splatnostAkce] = useActionState<VydaniState, FormData>(nastavSplatnost, {});
  const [storno, stornoAkce] = useActionState<VydaniState, FormData>(stornoVyuctovani, {});
  const [zkopirovano, setZkopirovano] = useState(false);

  const zprava = textZpravy(x.snapshot, x.cislo, x.dueDate);
  const stornovano = x.status === "STORNO";
  const hlaska = [odeslano, vyporadano, zruseno, splatnost, storno].find((s) => s.error || s.success) ?? {};

  return (
    <div className="space-y-5">
      <Hlaska state={hlaska} />
      {stornovano && (
        <p className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">
          Stornováno{x.stornoReason ? `: ${x.stornoReason}` : ""}. Doklad zůstává v evidenci, ale nepočítá se.
        </p>
      )}

      <VyuctovaniDokument s={x.snapshot} cislo={x.cislo} vydano={x.issuedAt} splatnost={x.dueDate} />
      <div className="flex flex-wrap justify-end gap-2 print:hidden">
        <button type="button" className="btn btn-primary" onClick={vytisknout}>Vytisknout / uložit PDF</button>
      </div>

      {!stornovano && (
        <>
          <section className="space-y-3 rounded-xl border border-line p-4 print:hidden">
            <h4 className="text-sm font-semibold">Předání nájemci</h4>
            <p className="text-xs text-ink-secondary">
              Ulož si vyúčtování jako PDF (tlačítko výše), přilož ho sem a pošli ho nájemci. Text zprávy je připravený.
            </p>
            <div className="flex flex-wrap gap-2">
              <a href={odkazMailto(x.snapshot.najemce.email, zprava.predmet, zprava.telo)} className="btn text-xs">
                Napsat e-mail{x.snapshot.najemce.email ? ` (${x.snapshot.najemce.email})` : ""}
              </a>
              <button type="button" className="btn text-xs"
                onClick={async () => {
                  try { await navigator.clipboard.writeText(`${zprava.predmet}\n\n${zprava.telo}`); setZkopirovano(true); setTimeout(() => setZkopirovano(false), 2500); } catch { /* schranka nemusi byt dostupna */ }
                }}>
                {zkopirovano ? "Zkopírováno" : "Zkopírovat text zprávy"}
              </button>
            </div>

            {(diskPripojen || x.dokumenty.length > 0) ? (
              <Dokumenty
                kontext={{ kategorie: "VYUCTOVANI_NAJEMCE", leaseId: x.leaseId, tenantId: x.tenantId, statementId: x.id }}
                dokumenty={x.dokumenty} canEdit={canEdit && diskPripojen}
                nadpis="Přiložit PDF vyúčtování" popis="Přetáhni sem uložené PDF; schová se na Google Disk do složky nájemce."
                prazdne="PDF zatím není přiložené." />
            ) : (
              <p className="text-xs text-ink-muted">Google Disk není připojený, PDF nejde přiložit. Připoj ho ve <a className="text-accent hover:underline" href="/sprava">Správě</a>.</p>
            )}

            {canEdit && (
              <form action={odeslanoAkce} className="flex flex-wrap items-end gap-3 border-t border-line pt-3">
                <input type="hidden" name="id" value={x.id} />
                <DatumPole label="Odesláno dne" name="sentAt" defaultValue={x.sentAt ?? dnesISO()} />
                <Vyber label="Jak" name="sentVia" defaultValue={x.sentVia ?? "EMAIL"}
                  options={Object.entries(NAZVY_ZPUSOBU) as [string, string][]} />
                <button type="submit" className="btn text-xs">
                  {x.sentAt ? "Změnit odeslání" : "Označit jako odesláno"}
                </button>
                {x.sentAt && (
                  <span className="pb-2 text-xs text-ink-muted">
                    odesláno {dateCz(x.sentAt)}{x.sentVia ? ` ${NAZVY_ZPUSOBU[x.sentVia as keyof typeof NAZVY_ZPUSOBU] ?? ""}` : ""}
                  </span>
                )}
              </form>
            )}
          </section>

          {canEdit && Math.abs(x.result) >= 1 && (
            <section className="space-y-3 rounded-xl border border-line p-4 print:hidden">
              <h4 className="text-sm font-semibold">{x.result < 0 ? "Úhrada nedoplatku" : "Vrácení přeplatku"}</h4>
              {x.status === "VYPORADANO" ? (
                <form action={zrusAkce} className="flex flex-wrap items-center gap-3">
                  <input type="hidden" name="id" value={x.id} />
                  <span className="text-sm text-good">
                    {x.result < 0 ? "Uhrazeno" : "Vráceno"} {x.settledAt ? dateCz(x.settledAt) : ""}{x.settledNote ? ` · ${x.settledNote}` : ""}
                  </span>
                  <button type="submit" className="btn text-xs">Zrušit vypořádání</button>
                </form>
              ) : (
                <form action={vyporadanoAkce} className="flex flex-wrap items-end gap-3">
                  <input type="hidden" name="id" value={x.id} />
                  <DatumPole label={x.result < 0 ? "Uhrazeno dne" : "Vráceno dne"} name="settledAt" defaultValue={dnesISO()} />
                  <div className="min-w-[10rem] flex-1">
                    <label className="label mb-1.5 block" htmlFor={`pozn-${x.id}`}>Poznámka</label>
                    <input id={`pozn-${x.id}`} name="settledNote" className="input" placeholder="nepovinné, např. převodem" />
                  </div>
                  <button type="submit" className="btn btn-primary text-xs">{x.result < 0 ? "Označit jako uhrazené" : "Označit jako vrácené"}</button>
                </form>
              )}
              <form action={splatnostAkce} className="flex flex-wrap items-end gap-3 border-t border-line pt-3">
                <input type="hidden" name="id" value={x.id} />
                <DatumPole label={x.result < 0 ? "Splatnost" : "Vrátit do"} name="dueDate" defaultValue={x.dueDate ?? ""} />
                <button type="submit" className="btn text-xs">Změnit termín</button>
              </form>
            </section>
          )}

          {canEdit && (
            <form action={stornoAkce} className="flex flex-wrap items-end gap-3 print:hidden">
              <input type="hidden" name="id" value={x.id} />
              <div className="min-w-[12rem] flex-1">
                <label className="label mb-1.5 block" htmlFor={`storno-${x.id}`}>Storno (oprava chyby)</label>
                <input id={`storno-${x.id}`} name="reason" className="input" placeholder="Důvod storna, např. chybné odečty" />
              </div>
              <button type="submit" className="btn text-xs text-bad"
                onClick={(e) => { if (!confirm("Stornovat toto vyúčtování? Doklad zůstane v evidenci, ale nebude se počítat.")) e.preventDefault(); }}>
                Stornovat
              </button>
            </form>
          )}
        </>
      )}

      {stornovano && canEdit && (
        <button type="button" className="btn print:hidden" onClick={znovu}>Vyúčtovat toto období znovu</button>
      )}
    </div>
  );
}
