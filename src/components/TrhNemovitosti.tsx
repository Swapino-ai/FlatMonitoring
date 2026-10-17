"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { nastavOceneniPodle, prepniVyloucenouObec, nastavVlastnostBytu, nastavVlastnostNabidky, nastavPolohuInzeratu, nastavSledovani, obnovNavrhy, rozhodniInzeraty, type TrhState } from "@/lib/trhActions";
import type { StatistikaNavrhu } from "@/lib/market/inzeraty";
import { czk, dateCz } from "@/lib/format";
import { Hlaska } from "./form";
import { Badge } from "./Stat";
import { Mapa, type BodOkoli } from "./Mapa";
import { VyvojChart } from "./charts";
import { SwipeNavrhy } from "./SwipeNavrhy";
import { AiInfo } from "./AiInfo";
import { Galerie, type PolozkaGalerie } from "./Galerie";
import type { AiNahled } from "@/lib/market/aiNahled";
import { STAVY_BYTU, TYPY_DOMU } from "@/lib/market/zarazeni";

export interface RadekTrhu {
  id: string; // id zarazeni
  stav: "NAVRH" | "ZARAZENO" | "VYRAZENO";
  skore: number | null;
  doporuceno: boolean;
  duvod: string | null;
  dealType: "SALE" | "RENT";
  disposition: string | null;
  areaM2: number | null;
  price: number;
  pricePerM2: number | null;
  city: string;
  district: string | null;
  url: string | null;
  lat: number | null;
  lon: number | null;
  polohaRucne: boolean;
  inzeratId: string;
  firstSeen: string;
  lastSeen: string;
  zmizel: string | null;
  /** Historie ceny od nejstarsi */
  ceny: { at: string; price: number }[];
  typDomu?: string | null;
  stavBytu?: string | null;
  vahaRucne?: number | null;
  /** Vaha v odhadu (spocitana nebo rucni) */
  vaha?: number;
  snimky: { id: string; createdAt: string }[];
  /** Fotografie z inzeratu (ulozene u zarazenych) */
  fotky?: string[];
  /** Parametry vyctene AI z textu stranky */
  ai?: AiNahled | null;
  /** Odkazy na fotky z galerie inzeratu (i u navrhu) */
  fotkyUrl?: string[];
  stejnaObec?: boolean;
}

export interface OdhadPanel {
  /** Vazeny prumer */
  hodnota: number;
  perM2: number;
  pocet: number;
  median: { hodnota: number; perM2: number };
  rada: { datum: string; hodnota: number; median: number }[];
}

const R = 6371;
function km(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const rad = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Sledovani trhu u jedne nemovitosti: zapnuti, navrhy ke kontrole, zarazene a vyrazene
 * nabidky, odhad ze zarazenych za posledni 2 mesice a jeho vyvoj v case.
 */
export function TrhNemovitosti({ propertyId, pocatecniTyp = "SALE", trhId, propojeni, klic, obce = [], vlastnosti, canEdit, sledovat, poloha, radky, odhady, skenovatelne, stareVyrazene = [], diag }: {
  diag?: StatistikaNavrhu;
  /** Ktera zalozka (prodej / najem) se otevre */
  pocatecniTyp?: "SALE" | "RENT";
  propertyId: string;
  /** Nemovitost, jejiz nabidky se pouzivaji (pri propojenem oceneni jina nez propertyId) */
  trhId?: string;
  /** Vlastnosti bytu pro vahy srovnani */
  vlastnosti?: { typDomu: string | null; stavBytu: string | null };
  /** Popis, podle ceho se hleda (klic) */
  klic?: string;
  /** Obce, ze kterych nabidky prisly; klikem vyloucit/vratit */
  obce?: { nazev: string; pocet: number; km: number | null; vyloucena: boolean }[];
  propojeni?: { podle: { id: string; name: string } | null; navazane: { id: string; name: string }[]; moznosti: { id: string; name: string }[] };
  canEdit: boolean;
  sledovat: boolean;
  skenovatelne: boolean;
  poloha: { lat: number; lon: number } | null;
  radky: RadekTrhu[];
  /** Drive vyrazene nabidky, ke kterym se nedochovala data (jen popis). */
  stareVyrazene?: { id: string; popis: string; duvod: string | null; kdy: string }[];
  odhady: { SALE: OdhadPanel | null; RENT: OdhadPanel | null };
}) {
  const router = useRouter();
  const [stav, setStav] = useState<TrhState>({});
  const [bezi, spust] = useTransition();
  const [typ, setTyp] = useState<"SALE" | "RENT">(pocatecniTyp);
  const [vybrane, setVybrane] = useState<Set<string>>(() => new Set(radky.filter((r) => r.stav === "NAVRH" && r.doporuceno).map((r) => r.id)));
  const [vyrazeneOtevrene, setVyrazeneOtevrene] = useState(false);
  const [polohaPro, setPolohaPro] = useState<RadekTrhu | null>(null);
  const [sken, setSken] = useState("");
  const [swipe, setSwipe] = useState(false);
  const [galerie, setGalerie] = useState<PolozkaGalerie[] | null>(null);
  // Galerie inzeratu: nejnovejsi screenshot stranky jako prvni, pak fotky
  const fotkyRadku = (r: RadekTrhu) => ((r.fotky?.length ?? 0) > 0 ? r.fotky!.map((id) => `/api/snimek/${id}`) : r.fotkyUrl ?? []);
  const polozkyGalerie = (r: RadekTrhu): PolozkaGalerie[] => [
    ...(r.snimky[0] ? [{ src: `/api/snimek/${r.snimky[0].id}`, popis: `Screenshot stránky ${dateCz(r.snimky[0].createdAt)}`, posouvat: true }] : []),
    ...fotkyRadku(r).map((src) => ({ src })),
  ];

  const proTyp = radky.filter((r) => r.dealType === typ);
  const navrhy = proTyp.filter((r) => r.stav === "NAVRH")
    .sort((a, b) => Number(b.doporuceno) - Number(a.doporuceno) || (b.skore ?? 0) - (a.skore ?? 0));
  const zarazene = proTyp.filter((r) => r.stav === "ZARAZENO").sort((a, b) => (a.firstSeen < b.firstSeen ? 1 : -1));
  const vyrazene = proTyp.filter((r) => r.stav === "VYRAZENO");
  // Do odhadu vstupuji nabidky za 2 mesice pred nejnovejsi zarazenou
  const nejnovejsi = zarazene.reduce((m, r) => (r.firstSeen > m ? r.firstSeen : m), "");
  const hraniceOkna = nejnovejsi ? new Date(Date.parse(`${nejnovejsi}T00:00:00Z`) - 61 * 86400000).toISOString().slice(0, 10) : "";
  const odhad = odhady[typ];
  const najem = typ === "RENT";
  const cena = (n: number) => (najem ? `${czk(n)}/měs.` : czk(n));

  const akce = (fn: () => Promise<TrhState>) => spust(async () => {
    const r = await fn();
    setStav(r);
    router.refresh();
  });
  // Typ domu, stav a vaha: zmena se ukaze hned, ulozeni a prepocet odhadu bezi na pozadi
  // (revalidace po akci prinese nova data sama, bez dalsiho router.refresh)
  type Uprava = Partial<Pick<RadekTrhu, "typDomu" | "stavBytu" | "vahaRucne">>;
  const [upravy, setUpravy] = useState<Record<string, Uprava>>({});
  const [, ukladej] = useTransition();
  useEffect(() => { setUpravy({}); }, [radky]);
  const uprav = (r: RadekTrhu, data: Uprava) => {
    setUpravy((u) => ({ ...u, [r.id]: { ...u[r.id], ...data } }));
    ukladej(async () => {
      const v = await nastavVlastnostNabidky(propertyId, r.id, data);
      if (v.error) setStav(v);
    });
  };
  const rozhodni = (ids: string[], novy: "ZARAZENO" | "VYRAZENO" | "NAVRH") => {
    akce(() => rozhodniInzeraty(propertyId, ids, novy));
    setVybrane((v) => { const n = new Set(v); ids.forEach((i) => n.delete(i)); return n; });
  };
  const prepni = (id: string) => setVybrane((v) => { const n = new Set(v); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const vybraneNavrhy = navrhy.filter((r) => vybrane.has(r.id)).map((r) => r.id);

  async function skenovat() {
    setSken("Skenuji prodej…");
    try {
      let navrhu = 0;
      let novych = 0;
      for (const d of ["SALE", "RENT"] as const) {
        setSken(d === "SALE" ? "Skenuji prodej…" : "Skenuji pronájem…");
        const r = await fetch("/api/market/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ propertyId: trhId ?? propertyId, dealType: d }) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Sken selhal");
        const chyba = (j.results ?? []).find((x: { status: string; message?: string }) => x.status === "FAILED");
        if (chyba) throw new Error(chyba.message ?? "portál neodpověděl");
        navrhu += j.navrhu ?? 0;
        novych += j.novych ?? 0;
      }
      setSken(`Hotovo: ${novych} nových nabídek, ${navrhu} nových návrhů ke kontrole.`);
      router.refresh();
    } catch (e) {
      setSken(`Sken selhal: ${e instanceof Error ? e.message : e}. Zkus noční sken v GitHub Actions.`);
    }
  }

  // Body do mapy: zarazene barevne, navrhy sede, vyrazene cervene (zapinaji se v legende)
  const body = useMemo<BodOkoli[]>(() => [...zarazene, ...navrhy, ...vyrazene].filter((r) => r.lat != null && r.lon != null).map((r) => ({
    lat: r.lat!, lon: r.lon!, url: r.url,
    druh: r.stav === "ZARAZENO" ? (r.dealType === "SALE" ? "PRODEJ" : "NAJEM") : r.stav === "VYRAZENO" ? "VYRAZENO" : "NAVRH",
    popis: [
      `${r.stav === "ZARAZENO" ? "Zařazeno" : r.stav === "VYRAZENO" ? "Vyřazeno" : "Návrh"}${r.disposition ? ` · ${r.disposition}` : ""}${r.areaM2 ? ` · ${r.areaM2} m²` : ""}`,
      `${cena(r.price)}${r.pricePerM2 ? ` · ${czk(r.pricePerM2)}/m²` : ""}`,
    ],
  // eslint-disable-next-line react-hooks/exhaustive-deps
  })), [radky, typ]);

  const vzdalenost = (r: RadekTrhu) => (poloha && r.lat != null && r.lon != null ? km(poloha, { lat: r.lat, lon: r.lon }) : null);

  const zakladRadku = (r: RadekTrhu) => {
    const d = vzdalenost(r);
    const prvni = r.ceny[0]?.price;
    const zmenaCeny = prvni && Math.abs(prvni - r.price) >= 1 ? ((r.price - prvni) / prvni) * 100 : null;
    return (
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-semibold tabular-nums">{cena(r.price)}</span>
          {r.pricePerM2 != null && <span className="text-xs text-ink-muted tabular-nums">{czk(r.pricePerM2)}/m²</span>}
          {zmenaCeny != null && (
            <span className={`text-xs ${zmenaCeny < 0 ? "text-good" : "text-bad"}`} title={r.ceny.map((c) => `${dateCz(c.at)}: ${czk(c.price)}`).join("\n")}>
              {zmenaCeny < 0 ? "▼" : "▲"} {Math.abs(zmenaCeny).toFixed(1).replace(".", ",")} % od {dateCz(r.ceny[0].at)}
            </span>
          )}
          {r.zmizel && <Badge tone="neutral">zmizel z trhu {dateCz(r.zmizel)}</Badge>}
        </div>
        <div className="text-xs text-ink-secondary">
          {[r.disposition, r.areaM2 ? `${r.areaM2} m²` : null, r.district && r.district !== r.city ? `${r.city}, ${r.district}` : r.city,
            r.stejnaObec ? "stejná obec" : null,
            d != null ? `${d.toFixed(1).replace(".", ",")} km` : r.lat == null ? "bez polohy" : null].filter(Boolean).join(" · ")}
          {" · "}na trhu od {dateCz(r.firstSeen)}
        </div>
        {r.stav === "NAVRH" && r.duvod && <div className="text-xs text-ink-muted">{r.duvod}</div>}
        {r.ai && <div className="mt-1"><AiInfo ai={r.ai} kompaktni={r.stav !== "NAVRH"} /></div>}
      </div>
    );
  };

  const odkazy = (r: RadekTrhu) => (
    <span className="flex shrink-0 items-center gap-2 text-xs">
      {r.url && !r.url.includes("/x/x/") && <a href={r.url} target="_blank" rel="noreferrer noopener" className="text-accent hover:underline">Inzerát ↗</a>}
      {fotkyRadku(r).length > 0 && (
        <button type="button" onClick={() => setGalerie(polozkyGalerie(r))} className="text-accent hover:underline">Fotky ({fotkyRadku(r).length})</button>
      )}
      {r.snimky.map((s, k) => (
        <a key={s.id} href={`/api/snimek/${s.id}`} target="_blank" rel="noreferrer" className="text-accent hover:underline" title={`Screenshot z ${dateCz(s.createdAt)}`}>
          {k === 0 ? "Snímek" : `Snímek ${dateCz(s.createdAt)}`}
        </a>
      ))}
    </span>
  );

  return (
    <div className="space-y-4">
      <Hlaska state={stav} />

      {/* Propojene oceneni: dva byty, jeden odhad */}
      {propojeni && (propojeni.podle || propojeni.navazane.length > 0 || (canEdit && propojeni.moznosti.length > 0)) && (
        <div className={`flex flex-wrap items-center justify-between gap-3 rounded-card border p-4 ${propojeni.podle ? "border-accent/40 bg-accent-soft/40" : "border-line"}`}>
          <div className="text-sm">
            {propojeni.podle ? (
              <>Oceňuje se stejně jako <a href={`/properties/${propojeni.podle.id}/trh`} className="font-semibold text-accent hover:underline">{propojeni.podle.name}</a>: sdílí jeho zařazené nabídky, odhad = vážený průměr za m² × plocha tohoto bytu. Rozhodnutí tady platí pro oba.</>
            ) : propojeni.navazane.length > 0 ? (
              <>Podle tohoto bytu se oceňuje i {propojeni.navazane.map((n) => n.name).join(", ")}. Zařazené nabídky platí pro všechny.</>
            ) : (
              <>Byt se dá oceňovat stejně jako jiný — sdílí zařazené nabídky, každý zůstává samostatný.</>
            )}
          </div>
          {canEdit && (propojeni.podle
            ? <button type="button" className="btn text-xs" disabled={bezi} onClick={() => akce(() => nastavOceneniPodle(propertyId, null))}>Zrušit propojení</button>
            : propojeni.navazane.length === 0 && (
              <select className="input w-auto py-1.5 text-sm" defaultValue="" disabled={bezi}
                onChange={(e) => { const v = e.target.value; if (v) akce(() => nastavOceneniPodle(propertyId, v)); }}>
                <option value="" disabled>Oceňovat stejně jako…</option>
                {propojeni.moznosti.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            ))}
        </div>
      )}

      {/* Klic: podle ceho se hleda */}
      {klic && (
        <div className="rounded-card border border-line bg-surface-sunken/50 p-4 text-sm">
          <div className="label mb-1">Klíč hledání</div>
          <p className="text-ink-secondary">{klic}</p>
          {vlastnosti && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
              <span className="text-ink-muted">Tento byt (nabídky se stejnými vlastnostmi mají v odhadu větší váhu):</span>
              {([["typDomu", TYPY_DOMU], ["stavBytu", STAVY_BYTU]] as const).map(([pole, volby]) => (
                <span key={pole} className="flex flex-wrap gap-1">
                  {Object.entries(volby).map(([k, n]) => {
                    const aktivni = vlastnosti[pole] === k;
                    return (
                      <button key={k} type="button" disabled={!canEdit || bezi}
                        onClick={() => akce(() => nastavVlastnostBytu(propertyId, pole, aktivni ? null : k))}
                        className={`rounded-full border px-2.5 py-0.5 ${aktivni ? "border-accent bg-accent text-white" : "border-line bg-surface-card text-ink-secondary hover:border-accent"}`}>
                        {n}
                      </button>
                    );
                  })}
                </span>
              ))}
            </div>
          )}
          {obce.length > 0 && (
            <div className="mt-3">
              <div className="mb-1.5 text-xs text-ink-muted">Obce, ze kterých nabídky přišly{canEdit ? " — klikem vyloučíš nebo vrátíš" : ""}:</div>
              <div className="flex flex-wrap gap-1.5">
                {obce.map((o) => (
                  <button key={o.nazev} type="button" disabled={!canEdit || bezi}
                    onClick={() => akce(() => prepniVyloucenouObec(propertyId, o.nazev))}
                    title={o.vyloucena ? "Vyloučená — klikem vrátit" : "Klikem vyloučit"}
                    className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${o.vyloucena
                      ? "border-bad/40 bg-bad/10 text-bad line-through"
                      : "border-line bg-surface-card text-ink-secondary hover:border-bad hover:text-bad"}`}>
                    {o.vyloucena ? "✕ " : ""}{o.nazev}{!o.vyloucena && <span className="text-ink-muted"> · {o.pocet}{o.km != null ? ` · ${String(o.km).replace(".", ",")} km` : ""}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Zapnuti sledovani */}
      <div className={`flex flex-wrap items-center justify-between gap-3 rounded-card border p-4 ${sledovat ? "border-good/40 bg-good/5" : "border-line"}`}>
        <div>
          <div className="font-semibold">{sledovat ? "Trh se sleduje" : "Trh se nesleduje"}</div>
          <p className="text-sm text-ink-secondary">
            {sledovat
              ? "Noční sken ukládá nabídky ze Sreality a nové ti nabídne ke kontrole. Odhad se počítá jen z nabídek, které zařadíš."
              : skenovatelne ? "Zapni, a sken začne pro tuhle nemovitost sbírat nabídky. Nic se neocení samo." : "Tenhle druh nemovitosti se na Sreality neskenuje."}
          </p>
          {sken && <p className="mt-1 text-sm text-accent">{sken}</p>}
        </div>
        {canEdit && skenovatelne && (
          <div className="flex gap-2">
            {sledovat && <button type="button" className="btn" disabled={bezi || sken.startsWith("Skenuji")} onClick={skenovat}>Skenovat teď</button>}
            <button type="button" className={sledovat ? "btn" : "btn btn-primary"} disabled={bezi}
              onClick={() => akce(() => nastavSledovani(trhId ?? propertyId, !sledovat))}>
              {sledovat ? "Vypnout sledování" : "Sledovat trh"}
            </button>
          </div>
        )}
      </div>

      {/* Prodej / najem */}
      <div className="flex gap-1.5">
        {(["SALE", "RENT"] as const).map((t) => {
          const n = radky.filter((r) => r.dealType === t && r.stav === "NAVRH").length;
          return (
            <button key={t} type="button" onClick={() => setTyp(t)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium ${typ === t ? "bg-accent text-white" : "bg-surface-sunken text-ink-secondary hover:text-ink-primary"}`}>
              {t === "SALE" ? "Prodejní ceny" : "Nájmy"}
              {n > 0 && <span className={`ml-2 rounded-full px-1.5 text-xs ${typ === t ? "bg-white/25" : "bg-accent/15 text-accent"}`}>{n}</span>}
            </button>
          );
        })}
      </div>

      {/* Odhad a jeho vyvoj */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="card">
          <div className="label">{najem ? "Odhad nájmu" : "Odhad hodnoty"}</div>
          {odhad ? (
            <>
              <div className="mt-2 grid grid-cols-2 gap-3">
                {([["Vážený průměr", odhad.hodnota, odhad.perM2, true], ["Vážený medián", odhad.median.hodnota, odhad.median.perM2, false]] as const).map(([n, h, m2, hlavni]) => (
                  <div key={n} className={`rounded-lg p-3 ${hlavni ? "bg-accent-soft/50" : "bg-surface-sunken"}`}>
                    <div className="flex items-center gap-1.5 text-xs text-ink-secondary">
                      <span className={`inline-block h-0.5 w-4 ${hlavni ? "bg-accent" : "border-t-2 border-dashed border-ink-muted"}`} />{n}
                    </div>
                    <div className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{cena(h)}</div>
                    <div className="text-xs tabular-nums text-ink-muted">{czk(m2)}/m²</div>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-ink-secondary">
                {odhad.pocet} zařazených nabídek, které se objevily za poslední 2 měsíce (před nejnovější z nich), váha podle podobnosti.
                {" "}Průměr bere v potaz všechny nabídky, medián je odolnější vůči jedné výrazně dražší či levnější.
                {odhad.hodnota !== 0 && Math.abs(odhad.median.hodnota - odhad.hodnota) / odhad.hodnota > 0.05 &&
                  <> <strong>Rozdíl přes 5 %</strong> — zkontroluj, jestli mezi nabídkami není nějaká mimo.</>}
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm text-ink-secondary">Odhad vznikne, jakmile zařadíš první nabídku.</p>
          )}
        </div>
        <div className="card">
          <div className="label mb-1">Vývoj odhadu, jak přibývají zařazené nabídky</div>
          {odhad && odhad.rada.length > 1
            ? <VyvojChart data={odhad.rada.map((b) => ({ datum: dateCz(b.datum), hodnota: b.hodnota, hodnota2: b.median }))}
                nazev="Vážený průměr" nazev2="Vážený medián" kompaktni={!najem} />
            : <p className="py-6 text-center text-sm text-ink-muted">Graf vznikne s druhou zařazenou nabídkou.</p>}
        </div>
      </div>

      {/* Mapa */}
      {poloha && body.length > 0 && (
        <div className="card">
          <Mapa latitude={poloha.lat} longitude={poloha.lon} zoom={13} vyskaTrida="h-72" okoli={body} />
        </div>
      )}

      {/* Navrhy ke kontrole */}
      <section className="card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Návrhy ke kontrole <span className="text-ink-muted">({navrhy.length})</span></h2>
          {canEdit && navrhy.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <button type="button" className="btn btn-primary text-xs" onClick={() => setSwipe(true)}>Procházet jeden po druhém</button>
              <button type="button" className="btn text-xs" onClick={() => setVybrane(new Set(navrhy.filter((r) => r.doporuceno).map((r) => r.id)))}>Vybrat doporučené</button>
              <button type="button" className="btn text-xs" onClick={() => setVybrane(new Set())}>Zrušit výběr</button>
              <button type="button" className="btn btn-primary text-xs" disabled={bezi || vybraneNavrhy.length === 0} onClick={() => rozhodni(vybraneNavrhy, "ZARAZENO")}>Zařadit vybrané ({vybraneNavrhy.length})</button>
              <button type="button" className="btn text-xs" disabled={bezi || vybraneNavrhy.length === 0} onClick={() => rozhodni(vybraneNavrhy, "VYRAZENO")}>Vyřadit vybrané</button>
            </div>
          )}
        </div>
        {navrhy.length === 0 ? (
          <div className="py-3 text-center text-sm text-ink-muted">
            <p>{sledovat ? "Nic nového ke kontrole." : "Návrhy přicházejí, jen když se trh sleduje."}</p>
            {diag && diag.kandidatu > 0 && (
              <p className="mt-1 text-xs">
                V databázi trhu je pro tuhle nemovitost {diag.kandidatu} nabídek (prodej i nájem): už posouzených {diag.uzZname}
                {diag.novych > 0 && <>, <strong className="text-accent">{diag.novych} čeká na navržení</strong></>}
                {diag.daleko > 0 && `, příliš daleko ${diag.daleko}`}
                {diag.velikost > 0 && `, jiná plocha (víc než ±25 %) ${diag.velikost}`}
                {diag.jinaDispozice > 0 && `, jiná dispozice ${diag.jinaDispozice}`}
                {diag.vylouceneObce > 0 && `, z vyloučených obcí ${diag.vylouceneObce}`}
                {diag.zmizelych > 0 && `, zmizelé z trhu ${diag.zmizelych}`}.
              </p>
            )}
            {canEdit && sledovat && diag && diag.novych > 0 && (
              <button type="button" className="btn btn-primary mt-2 text-xs" disabled={bezi} onClick={() => akce(() => obnovNavrhy(trhId ?? propertyId))}>Navrhnout teď</button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-line/70 rounded-xl border border-line">
            {navrhy.map((r) => (
              <li key={r.id} className={`flex flex-wrap items-center gap-3 px-3 py-2.5 ${vybrane.has(r.id) ? "bg-accent-soft/40" : ""}`}>
                {canEdit && <input type="checkbox" checked={vybrane.has(r.id)} onChange={() => prepni(r.id)} className="h-4 w-4 accent-accent" aria-label="Vybrat" />}
                <span className={`w-10 shrink-0 rounded-md px-1 py-0.5 text-center text-xs font-semibold tabular-nums ${r.doporuceno ? "bg-good/15 text-good" : "bg-surface-sunken text-ink-muted"}`}
                  title={r.doporuceno ? "Doporučeno zařadit" : "Méně podobné"}>{r.skore ?? "–"}</span>
                {zakladRadku(r)}
                {odkazy(r)}
                {canEdit && (
                  <span className="flex gap-1">
                    <button type="button" className="btn px-2 py-0.5 text-xs" disabled={bezi} onClick={() => rozhodni([r.id], "ZARAZENO")}>Zařadit</button>
                    <button type="button" className="btn px-2 py-0.5 text-xs" disabled={bezi} onClick={() => rozhodni([r.id], "VYRAZENO")}>Vyřadit</button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Zarazene */}
      <section className="card">
        <h2 className="mb-3 font-semibold">Zařazené nabídky <span className="text-ink-muted">({zarazene.length})</span></h2>
        {zarazene.length === 0 ? (
          <p className="py-3 text-center text-sm text-ink-muted">Zatím nic. Zařaď nabídky z návrhů a vznikne odhad.</p>
        ) : (
          <ul className="divide-y divide-line/70 rounded-xl border border-line">
            {zarazene.map((puvodni) => { const r = { ...puvodni, ...upravy[puvodni.id] }; const k = r.firstSeen > hraniceOkna ? 0 : 99; return (
              <li key={r.id} className={`flex gap-3 px-3 py-3 ${r.zmizel ? "opacity-70" : ""}`}>
                {/* Nahled: prvni fotka, klik otevre galerii */}
                {(() => {
                  const fotky = fotkyRadku(r);
                  return fotky.length > 0 || r.snimky[0] ? (
                    <button type="button" onClick={() => setGalerie(polozkyGalerie(r))} className="relative hidden h-20 w-28 shrink-0 overflow-hidden rounded-lg bg-surface-sunken sm:block" title="Fotky inzerátu">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={fotky[0] ?? `/api/snimek/${r.snimky[0]!.id}`} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover object-top" />
                      <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[10px] text-white">{polozkyGalerie(r).length}</span>
                    </button>
                  ) : <div className="hidden h-20 w-28 shrink-0 rounded-lg bg-surface-sunken sm:block" />;
                })()}

                <div className="min-w-0 flex-1 space-y-1.5">
                  {(() => {
                    const d = vzdalenost(r);
                    const prvni = r.ceny[0]?.price;
                    const zmenaCeny = prvni && Math.abs(prvni - r.price) >= 1 ? ((r.price - prvni) / prvni) * 100 : null;
                    return (
                      <div>
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <span className="font-semibold tabular-nums">{cena(r.price)}</span>
                          {r.pricePerM2 != null && <span className="text-xs text-ink-muted tabular-nums">{czk(r.pricePerM2)}/m²</span>}
                          {zmenaCeny != null && (
                            <span className={`text-xs ${zmenaCeny < 0 ? "text-good" : "text-bad"}`}>{zmenaCeny < 0 ? "▼" : "▲"} {Math.abs(zmenaCeny).toFixed(1).replace(".", ",")} %</span>
                          )}
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${k < 10 ? "bg-accent-soft text-accent" : "bg-surface-sunken text-ink-muted"}`}
                            title={k < 10 ? "Objevila se v posledních 2 měsících, počítá se do odhadu" : "Starší než 2 měsíce, do odhadu už nevstupuje"}>{k < 10 ? "v odhadu" : "starší"}</span>
                          {r.zmizel && <Badge tone="neutral">zmizel {dateCz(r.zmizel)}</Badge>}
                        </div>
                        <div className="text-xs text-ink-secondary">
                          {[r.disposition, r.areaM2 ? `${r.areaM2} m²` : null, r.district && r.district !== r.city ? `${r.city}, ${r.district}` : r.city,
                            r.stejnaObec ? "stejná obec" : null, d != null ? `${d.toFixed(1).replace(".", ",")} km` : null, `od ${dateCz(r.firstSeen)}`].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Typ domu a stav: tvoje volba, jinak AI */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    {([["typDomu", "Dům", TYPY_DOMU, r.ai?.typDomuDuvod], ["stavBytu", "Stav", STAVY_BYTU, r.ai?.stavBytuDuvod]] as const).map(([pole, nazev, volby, duvod]) => {
                      const ai = r.ai?.[pole] ?? null;
                      const aiNazev = ai ? (volby as Record<string, string>)[ai] ?? null : null;
                      const rucne = r[pole] ?? null;
                      const rozpor = rucne && aiNazev && rucne !== ai;
                      return (
                        <label key={pole} className="flex items-center gap-1" title={duvod ? `AI: ${duvod}` : undefined}>
                          <span className="text-ink-muted">{nazev}</span>
                          <select className={`rounded-md border bg-surface-card px-1.5 py-0.5 ${rucne ? "border-line font-medium" : aiNazev ? "border-dashed border-accent text-accent" : "border-line text-ink-muted"}`}
                            value={rucne ?? ""} disabled={!canEdit}
                            onChange={(e) => uprav(r, { [pole]: e.target.value || null })}>
                            <option value="">{aiNazev ? `${aiNazev} (AI)` : "neurčeno"}</option>
                            {Object.entries(volby).map(([kl, n]) => <option key={kl} value={kl}>{n}</option>)}
                          </select>
                          {rozpor && <span className="text-[10px] text-warn">AI: {aiNazev}</span>}
                        </label>
                      );
                    })}
                    {r.ai?.stitky.length ? <span className="text-ink-muted">{r.ai.stitky.join(" · ")}</span> : null}
                  </div>
                  {r.ai?.shrnuti && <p className="line-clamp-1 text-xs italic text-ink-muted" title={r.ai.shrnuti}>{r.ai.shrnuti}</p>}
                </div>

                {/* Vaha a akce */}
                <div className="flex shrink-0 flex-col items-end justify-between gap-1.5 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold tabular-nums text-ink-secondary" title="Jak moc nabídka určuje odhad (podobnost plochy, typu domu, stavu a polohy)">váha {String(r.vaha ?? 1).replace(".", ",")}×</span>
                    {canEdit && (
                      <select className="rounded-md border border-line bg-surface-card px-1 py-0.5" value={r.vahaRucne ?? ""} title="Ruční váha"
                        onChange={(e) => uprav(r, { vahaRucne: e.target.value === "" ? null : Number(e.target.value) })}>
                        <option value="">auto</option>
                        {[0.5, 1, 2, 3, 5].map((v) => <option key={v} value={v}>{String(v).replace(".", ",")}×</option>)}
                      </select>
                    )}
                  </div>
                  <span className="flex flex-wrap justify-end gap-2">
                    {r.url && !r.url.includes("/x/x/") && <a href={r.url} target="_blank" rel="noreferrer noopener" className="text-accent hover:underline">Inzerát ↗</a>}
                    {r.snimky[0] && <a href={`/api/snimek/${r.snimky[0].id}`} target="_blank" rel="noreferrer" className="text-accent hover:underline" title={`Screenshot z ${dateCz(r.snimky[0].createdAt)}`}>Snímek</a>}
                  </span>
                  {canEdit && (
                    <span className="flex gap-1">
                      {(r.lat == null || r.polohaRucne) && (
                        <button type="button" className="btn px-2 py-0.5 text-xs" onClick={() => setPolohaPro(r)}>{r.lat == null ? "Určit polohu" : "Poloha"}</button>
                      )}
                      <button type="button" className="btn px-2 py-0.5 text-xs" disabled={bezi} onClick={() => rozhodni([r.id], "VYRAZENO")}>Vyřadit</button>
                    </span>
                  )}
                </div>
              </li>
            ); })}
          </ul>
        )}
      </section>

      {/* Vyrazene: nemizi, drzi se tady a jdou vratit */}
      {(vyrazene.length > 0 || stareVyrazene.length > 0) && (
        <section className="card">
          <button type="button" onClick={() => setVyrazeneOtevrene((x) => !x)} aria-expanded={vyrazeneOtevrene}
            className="flex w-full items-center justify-between gap-2 text-left">
            <h2 className="font-semibold">Vyřazené nabídky <span className="text-ink-muted">({vyrazene.length + stareVyrazene.length})</span></h2>
            <span className="text-xs text-accent">{vyrazeneOtevrene ? "Skrýt" : "Zobrazit"}</span>
          </button>
          <p className="mt-0.5 text-xs text-ink-muted">Do odhadu nevstupují a sken je znovu nenavrhne. Kdykoli je vrátíš do návrhů.</p>
          {vyrazeneOtevrene && (
            <ul className="mt-3 divide-y divide-line/60 rounded-lg border border-dashed border-line text-ink-muted">
              {vyrazene.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                  {zakladRadku(r)}
                  {odkazy(r)}
                  {canEdit && <button type="button" className="btn px-2 py-0.5 text-xs" disabled={bezi} onClick={() => rozhodni([r.id], "NAVRH")}>Vrátit do návrhů</button>}
                </li>
              ))}
              {stareVyrazene.map((v) => (
                <li key={v.id} className="px-3 py-2 text-sm">
                  <span>{v.popis}</span>
                  <span className="block text-xs">vyřazeno {dateCz(v.kdy)}{v.duvod ? ` · ${v.duvod}` : ""} · starší záznam, údaje o nabídce se už nedochovaly</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {swipe && (
        <SwipeNavrhy propertyId={propertyId} navrhy={navrhy} najem={najem} vzdalenost={vzdalenost}
          onKonec={(zmeneno) => { setSwipe(false); if (zmeneno) router.refresh(); }} />
      )}

      {galerie && <Galerie polozky={galerie} onZavrit={() => setGalerie(null)} />}

      {/* Rucni poloha */}
      {polohaPro && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setPolohaPro(null)}>
          <div className="w-full max-w-2xl rounded-card border border-line bg-surface-card p-5 shadow-pop" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-1 font-semibold">Kde nabídka je?</h3>
            <p className="mb-3 text-sm text-ink-secondary">Klepni do mapy. Poloha se uloží hned a další sken ji nepřepíše.</p>
            <Mapa latitude={polohaPro.lat ?? poloha?.lat ?? null} longitude={polohaPro.lon ?? poloha?.lon ?? null} zoom={14} vyskaTrida="h-80"
              onZmena={(lat, lon) => {
                const r = polohaPro;
                setPolohaPro(null);
                akce(() => nastavPolohuInzeratu(propertyId, r.inzeratId, lat, lon));
              }} />
            <div className="mt-3 flex justify-end">
              <button type="button" className="btn" onClick={() => setPolohaPro(null)}>Zavřít</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
