"use client";

import { useEffect, useRef, useState } from "react";
import type { DivIcon, Map as LeafletMap, Marker } from "leaflet";
import "leaflet/dist/leaflet.css";

/**
 * Mapa Mapy.cz. Bud jen ukazuje polohu nemovitosti, nebo necha uzivatele
 * klepnutim urcit misto presne — naseptavac zna dum, ne ktery vchod.
 *
 * Leaflet sahá na window, takze se nacita az v prohlizeci.
 */
export function Mapa({ latitude, longitude, onZmena, vyskaTrida = "h-56 sm:h-72", zoom = 17 }: {
  latitude: number | null;
  longitude: number | null;
  /** Kdyz je zadana, jde do mapy klepnout a posunout znacku. */
  onZmena?: (lat: number, lon: number) => void;
  /** Vyska jako trida, at je na telefonu nizsi nez na monitoru. */
  vyskaTrida?: string;
  zoom?: number;
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

  // Leaflet hleda obrazek znacky na ceste, ktera po sestaveni neexistuje.
  // Vlastni znacka z CSS ten problem obchazi a drzi vzhled aplikace.
  const ikona = useRef<DivIcon | null>(null);

  useEffect(() => {
    if (!uzel.current || mapa.current) return;
    let zruseno = false;

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

      // Domecek v kapce — na mapovem podkladu je poznat na prvni pohled,
      // bily kotouc kolem drzi kontrast i nad tmavou zastavbou.
      ikona.current = L.divIcon({
        className: "",
        html: `
          <svg width="34" height="44" viewBox="0 0 34 44" xmlns="http://www.w3.org/2000/svg">
            <path d="M17 43C17 43 32 26.5 32 17A15 15 0 1 0 2 17c0 9.5 15 26 15 26z"
              fill="rgb(var(--accent))" stroke="#fff" stroke-width="2.5"
              style="filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))"/>
            <circle cx="17" cy="16.5" r="9.5" fill="#fff"/>
            <path d="M17 10.5l6.5 5.5v6.5h-4.3v-4h-4.4v4H10.5V16z"
              fill="rgb(var(--accent))"/>
          </svg>`,
        iconSize: [34, 44],
        // Spicka kapky ukazuje na misto, ne jeji stred
        iconAnchor: [17, 43],
      });

      const naDotyk = L.Browser.mobile;
      setDotykove(naDotyk);

      const m = L.map(uzel.current, {
        attributionControl: true,
        // Kolecko mysi by na dlouhe strance misto scrollovani priblizovalo mapu
        scrollWheelZoom: false,
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

      // Leaflet si pamatuje velikost z okamziku vzniku. Kdyz kontejner mezitim
      // dostane jine rozmery (rozbaleni karty, nacteni pisma), zustane mapa
      // seda nebo posunuta — tohle ji prepocita.
      setTimeout(() => mapa.current?.invalidateSize(), 0);
    })();

    return () => {
      zruseno = true;
      mapa.current?.remove();
      mapa.current = null;
      znacka.current = null;
    };
    // Mapa se staví jednou; na změnu souřadnic reaguje efekt níž
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
