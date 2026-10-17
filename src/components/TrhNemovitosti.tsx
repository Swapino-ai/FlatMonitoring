"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { nastavOceneniPodle, nastavPolohuInzeratu, nastavSledovani, obnovNavrhy, rozhodniInzeraty, type TrhState } from "@/lib/trhActions";
import type { StatistikaNavrhu } from "@/lib/market/inzeraty";
import { czk, dateCz } from "@/lib/format";
import { Hlaska } from "./form";
import { Badge } from "./Stat";
import { Mapa, type BodOkoli } from "./Mapa";
import { VyvojChart } from "./charts";
import { SwipeNavrhy } from "./SwipeNavrhy";

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
  snimky: { id: string; createdAt: string }[];
}

export interface OdhadPanel {
  hodnota: number;
  perM2: number;
  pocet: number;
  rada: { datum: string; hodnota: number }[];
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
export function TrhNemovitosti({ propertyId, trhId, propojeni, canEdit, sledovat, poloha, radky, odhady, skenovatelne, stareVyrazene = [], diag }: {
  diag?: StatistikaNavrhu;
  propertyId: string;
  /** Nemovitost, jejiz nabidky se pouzivaji (pri propojenem oceneni jina nez propertyId) */
  trhId?: string;
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
  const [typ, setTyp] = useState<"SALE" | "RENT">("SALE");
  const [vybrane, setVybrane] = useState<Set<string>>(() => new Set(radky.filter((r) => r.stav === "NAVRH" && r.doporuceno).map((r) => r.id)));
  const [vyrazeneOtevrene, setVyrazeneOtevrene] = useState(false);
  const [polohaPro, setPolohaPro] = useState<RadekTrhu | null>(null);
  const [sken, setSken] = useState("");
  const [swipe, setSwipe] = useState(false);

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

  // Body do mapy: zarazene barevne, navrhy sede
  const body = useMemo<BodOkoli[]>(() => [...zarazene, ...navrhy].filter((r) => r.lat != null && r.lon != null).map((r) => ({
    lat: r.lat!, lon: r.lon!, url: r.url,
    druh: r.stav === "ZARAZENO" ? (r.dealType === "SALE" ? "PRODEJ" : "NAJEM") : "NAVRH",
    popis: [
      `${r.stav === "ZARAZENO" ? "Zařazeno" : "Návrh"}${r.disposition ? ` · ${r.disposition}` : ""}${r.areaM2 ? ` · ${r.areaM2} m²` : ""}`,
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
            d != null ? `${d.toFixed(1).replace(".", ",")} km` : r.lat == null ? "bez polohy" : null].filter(Boolean).join(" · ")}
          {" · "}na trhu od {dateCz(r.firstSeen)}
        </div>
        {r.stav === "NAVRH" && r.duvod && <div className="text-xs text-ink-muted">{r.duvod}</div>}
      </div>
    );
  };

  const odkazy = (r: RadekTrhu) => (
    <span className="flex shrink-0 items-center gap-2 text-xs">
      {r.url && !r.url.includes("/x/x/") && <a href={r.url} target="_blank" rel="noreferrer noopener" className="text-accent hover:underline">Inzerát ↗</a>}
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
              <>Oceňuje se stejně jako <a href={`/properties/${propojeni.podle.id}/trh`} className="font-semibold text-accent hover:underline">{propojeni.podle.name}</a>: sdílí jeho zařazené nabídky, odhad = medián za m² × plocha tohoto bytu. Rozhodnutí tady platí pro oba.</>
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
          <div className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">{odhad ? cena(odhad.hodnota) : "—"}</div>
          <p className="mt-1 text-sm text-ink-secondary">
            {odhad
              ? `Medián ${czk(odhad.perM2)}/m² z ${odhad.pocet} zařazených nabídek, které se objevily za poslední 2 měsíce (před nejnovější z nich).`
              : "Odhad vznikne, jakmile zařadíš první nabídku."}
          </p>
        </div>
        <div className="card">
          <div className="label mb-1">Vývoj odhadu, jak přibývají zařazené nabídky</div>
          {odhad && odhad.rada.length > 1
            ? <VyvojChart data={odhad.rada.map((b) => ({ datum: dateCz(b.datum), hodnota: b.hodnota }))} nazev={najem ? "Odhad nájmu" : "Odhad hodnoty"} kompaktni={!najem} />
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
                {diag.velikost > 0 && `, výrazně jiná plocha ${diag.velikost}`}
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
            {zarazene.map((r) => { const k = r.firstSeen > hraniceOkna ? 0 : 99; return (
              <li key={r.id} className={`flex flex-wrap items-center gap-3 px-3 py-2.5 ${r.zmizel ? "opacity-70" : ""}`}>
                <span className={`w-10 shrink-0 text-center text-xs ${k < 10 ? "font-semibold text-accent" : "text-ink-muted"}`}
                  title={k < 10 ? "Objevila se v posledních 2 měsících, počítá se do odhadu" : "Starší než 2 měsíce, do odhadu už nevstupuje"}>{k < 10 ? "v odhadu" : "starší"}</span>
                {zakladRadku(r)}
                {odkazy(r)}
                {canEdit && (
                  <span className="flex gap-1">
                    {r.lat == null || r.polohaRucne
                      ? <button type="button" className="btn px-2 py-0.5 text-xs" onClick={() => setPolohaPro(r)}>{r.lat == null ? "Určit polohu" : "Upravit polohu"}</button>
                      : null}
                    <button type="button" className="btn px-2 py-0.5 text-xs" disabled={bezi} onClick={() => rozhodni([r.id], "VYRAZENO")}>Vyřadit</button>
                  </span>
                )}
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
