"use client";

import { useEffect, useRef, useState } from "react";
import type { DivIcon, LayerGroup, Map as LeafletMap, Marker } from "leaflet";
import "leaflet/dist/leaflet.css";
import { ikonaDomecek } from "@/lib/mapaIkona";

/**
 * Mapa Mapy.cz. Bud jen ukazuje polohu nemovitosti, nebo necha uzivatele
 * klepnutim urcit misto presne — naseptavac zna dum, ne ktery vchod.
 *
 * Leaflet sahá na window, takze se nacita az v prohlizeci.
 */
export interface BodOkoli {
  lat: number; lon: number;
  druh: "PRODEJ" | "NAJEM";
  /** Radky popisu v okne po klepnuti. */
  popis: string[];
  url?: string | null;
}

const ZADNE_OKOLI: BodOkoli[] = [];
const BARVY_OKOLI = { PRODEJ: "#7c3aed", NAJEM: "#0d9488" } as const;

export function Mapa({ latitude, longitude, onZmena, vyskaTrida = "h-56 sm:h-72", zoom = 17, okoli = ZADNE_OKOLI }: {
  latitude: number | null;
  longitude: number | null;
  /** Kdyz je zadana, jde do mapy klepnout a posunout znacku. */
  onZmena?: (lat: number, lon: number) => void;
  /** Vyska jako trida, at je na telefonu nizsi nez na monitoru. */
  vyskaTrida?: string;
  zoom?: number;
  /** Srovnatelne nabidky, ze kterych vznikl odhad; jdou zapnout a vypnout po druzich. */
  okoli?: BodOkoli[];
}) {
  const uzel = useRef<HTMLDivElement>(null);
  const mapa = useRef<LeafletMap | null>(null);
  const znacka = useRef<Marker | null>(null);
  const zmenaRef = useRef(onZmena);
  const [chyba, setChyba] = useState("");
  // Na dotykovem zarizeni mapa nejdriv nereaguje — jinak by pri scrollovani
  // stranky chytila prst a uzivatel by uvizl uprostred mapy.
  const [aktivni, setAktivni] = useState(false);
  const [dotykove, setDotykove] = useState(false);

  // Handler drzime v ref, at prekresleni mapy nezavisi na identite funkce
  useEffect(() => { zmenaRef.current = onZmena; }, [onZmena]);

  const ikona = useRef<DivIcon | null>(null);
  const vrstvaOkoli = useRef<LayerGroup | null>(null);
  const [pripravena, setPripravena] = useState(false);
  const [druhy, setDruhy] = useState({ PRODEJ: true, NAJEM: true });
  const pocty = {
    PRODEJ: okoli.filter((b) => b.druh === "PRODEJ").length,
    NAJEM: okoli.filter((b) => b.druh === "NAJEM").length,
  };
  const oknaVychozi = useRef(true);

  useEffect(() => {
    if (!uzel.current || mapa.current) return;
    let zruseno = false;
    let pozorovatel: ResizeObserver | undefined;

    (async () => {
      const L = (await import("leaflet")).default;
      if (zruseno || !uzel.current) return;

      // Bez souradnic zacneme nad stredem Cech a pockame, az uzivatel klepne
      const start: [number, number] = latitude != null && longitude != null
        ? [latitude, longitude]
        : [49.8, 15.5];

      // Pojistka pro kontejner, ktery zbyl oznaceny po drivejsi neuklizene
      // mape — bez toho by Leaflet hodil "Map container is already initialized"
      // a mapa by se neukazala vubec.
      const kontejner = uzel.current as HTMLDivElement & { _leaflet_id?: number };
      if (kontejner._leaflet_id != null) delete kontejner._leaflet_id;

      ikona.current = ikonaDomecek(L);

      const naDotyk = L.Browser.mobile;
      setDotykove(naDotyk);

      const m = L.map(uzel.current, {
        attributionControl: true,
        // Na pocitaci kolecko priblizuje; na telefonu se zapne az klepnutim,
        // jinak by mapa chytala prst pri posouvani stranky
        scrollWheelZoom: !naDotyk,
        // Na telefonu se posouvani zapne az klepnutim do mapy
        dragging: !naDotyk,
      }).setView(start, latitude != null ? zoom : 7);

      L.tileLayer("/api/mapa/dlazdice/{z}/{x}/{y}", {
        minZoom: 0,
        maxZoom: 19,
        // Podminky Mapy.cz vyzaduji viditelne uvedeni zdroje
        attribution: '<a href="https://mapy.cz/" target="_blank" rel="noreferrer noopener">Mapy.cz</a>',
      })
        .on("tileerror", () => setChyba("Dlaždice mapy se nenačetly — zkontroluj MAPY_API_KEY."))
        .addTo(m);

      if (latitude != null && longitude != null) {
        znacka.current = L.marker([latitude, longitude], { icon: ikona.current }).addTo(m);
      }

      if (zmenaRef.current) {
        m.on("click", (e: { latlng: { lat: number; lng: number } }) => {
          const { lat, lng } = e.latlng;
          if (znacka.current) znacka.current.setLatLng([lat, lng]);
          else znacka.current = L.marker([lat, lng], { icon: ikona.current! }).addTo(m);
          zmenaRef.current?.(lat, lng);
        });
      }

      // Odchod ze stranky behem stavby: mapu je potreba uklidit tady, jinak
      // v kontejneru zustane Leafletova znacka "tady uz mapa je" a pristi
      // vykresleni tise selze — mapa se pak uz nikdy neukaze.
      if (zruseno) { m.remove(); return; }

      mapa.current = m;
      setPripravena(true);

      // Leaflet si pamatuje velikost z okamziku vzniku. Kdyz kontejner mezitim
      // dostane jine rozmery (rozbaleni karty, nacteni pisma), zustane mapa
      // seda nebo posunuta — tohle ji prepocita.
      setTimeout(() => mapa.current?.invalidateSize(), 0);
      // Kazda zmena rozmeru kontejneru (rozbaleni karty, prepnuti zalozky,
      // nacteni pisma) mapu prepocita; jednorazovy prepocet nestaci.
      if (typeof ResizeObserver !== "undefined") {
        pozorovatel = new ResizeObserver(() => mapa.current?.invalidateSize());
        pozorovatel.observe(m.getContainer());
      }
    })();

    return () => {
      zruseno = true;
      pozorovatel?.disconnect();
      mapa.current?.remove();
      mapa.current = null;
      znacka.current = null;
    };
    // Mapa se staví jednou; na změnu souřadnic reaguje efekt níž
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Srovnatelne nabidky: kolecka podle druhu, v okne po klepnuti popis a odkaz
  useEffect(() => {
    const m = mapa.current;
    if (!m || !pripravena) return;
    let zruseno = false;
    import("leaflet").then(({ default: L }) => {
      if (zruseno || !mapa.current) return;
      vrstvaOkoli.current?.remove();
      const skupina = L.layerGroup();
      for (const b of okoli) {
        if (!druhy[b.druh]) continue;
        const kolo = L.circleMarker([b.lat, b.lon], {
          radius: 7, color: "#ffffff", weight: 2, fillColor: BARVY_OKOLI[b.druh], fillOpacity: 0.9,
        });
        const uzel = document.createElement("div");
        uzel.style.fontSize = "12px";
        for (const [i, r] of b.popis.entries()) {
          const radek = document.createElement(i === 0 ? "strong" : "div");
          radek.textContent = r;
          uzel.appendChild(radek);
        }
        if (b.url && !b.url.includes("/x/x/")) {
          const a = document.createElement("a");
          a.href = b.url; a.target = "_blank"; a.rel = "noreferrer noopener"; a.textContent = "Otevřít inzerát →";
          a.style.display = "block"; a.style.marginTop = "4px";
          uzel.appendChild(a);
        }
        kolo.bindPopup(uzel).addTo(skupina);
      }
      skupina.addTo(mapa.current);
      vrstvaOkoli.current = skupina;
      // Poprve zaberou mapou vsechny nabidky i nemovitost
      if (oknaVychozi.current && okoli.length > 0) {
        oknaVychozi.current = false;
        const body: [number, number][] = okoli.map((b) => [b.lat, b.lon]);
        if (latitude != null && longitude != null) body.push([latitude, longitude]);
        mapa.current.fitBounds(L.latLngBounds(body), { padding: [32, 32], maxZoom: 16 });
      }
    });
    return () => { zruseno = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [okoli, druhy, pripravena]);

  // Vyber z naseptavace posune znacku i vyrez
  useEffect(() => {
    const m = mapa.current;
    if (!m || latitude == null || longitude == null) return;
    m.setView([latitude, longitude], Math.max(m.getZoom(), zoom));
    if (znacka.current) znacka.current.setLatLng([latitude, longitude]);
    else {
      import("leaflet").then(({ default: L }) => {
        if (mapa.current && ikona.current) znacka.current = L.marker([latitude, longitude], { icon: ikona.current }).addTo(mapa.current);
      });
    }
  }, [latitude, longitude, zoom]);

  function aktivuj() {
    setAktivni(true);
    mapa.current?.dragging.enable();
    mapa.current?.scrollWheelZoom.enable();
  }

  return (
    <div className="no-print">
      <div className="relative">
        <div ref={uzel} className={`w-full overflow-hidden rounded-card border border-line ${vyskaTrida}`} />

        {/* Dokud uzivatel mapu nezapne, prst nad ni scrolluje stranku */}
        {dotykove && !aktivni && (
          <button
            type="button"
            onClick={aktivuj}
            className="absolute inset-0 z-[500] flex items-end justify-center rounded-card bg-transparent pb-4"
            aria-label="Aktivovat mapu"
          >
            <span className="rounded-full bg-surface-card/95 px-3 py-1.5 text-xs font-medium shadow">
              Klepnutím aktivuješ mapu
            </span>
          </button>
        )}
      </div>
      {okoli.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="text-ink-muted">Srovnatelné nabídky, ze kterých vznikl odhad:</span>
          {(["PRODEJ", "NAJEM"] as const).map((d) => pocty[d] > 0 && (
            <label key={d} className="flex cursor-pointer items-center gap-1.5">
              <input type="checkbox" checked={druhy[d]} onChange={(e) => setDruhy((x) => ({ ...x, [d]: e.target.checked }))}
                className="h-3.5 w-3.5 rounded border-line accent-accent" />
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: BARVY_OKOLI[d] }} aria-hidden />
              {d === "PRODEJ" ? "Prodej" : "Nájem"} ({pocty[d]})
            </label>
          ))}
        </div>
      )}
      {chyba
        ? <p className="mt-1 text-xs text-warn">{chyba}</p>
        : onZmena && (
          <p className="mt-1 text-xs text-ink-muted">
            {dotykove && !aktivni
              ? "Nejdřív mapu aktivuj, pak klepnutím určíš polohu."
              : "Klepnutím do mapy upřesníš polohu — našeptávač zná dům, ne který vchod."}
          </p>
        )}
    </div>
  );
}
