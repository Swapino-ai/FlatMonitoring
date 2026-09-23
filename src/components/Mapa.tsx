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
export function Mapa({ latitude, longitude, onZmena, vyska = 260, zoom = 17 }: {
  latitude: number | null;
  longitude: number | null;
  /** Kdyz je zadana, jde do mapy klepnout a posunout znacku. */
  onZmena?: (lat: number, lon: number) => void;
  vyska?: number;
  zoom?: number;
}) {
  const uzel = useRef<HTMLDivElement>(null);
  const mapa = useRef<LeafletMap | null>(null);
  const znacka = useRef<Marker | null>(null);
  const zmenaRef = useRef(onZmena);
  const [chyba, setChyba] = useState("");

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

      ikona.current = L.divIcon({
        className: "",
        html: '<span style="display:block;width:18px;height:18px;border-radius:9999px;background:rgb(var(--accent));box-shadow:0 0 0 3px #fff,0 1px 4px rgba(0,0,0,.4)"></span>',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });

      const m = L.map(uzel.current, { attributionControl: true })
        .setView(start, latitude != null ? zoom : 7);

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

      mapa.current = m;
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

  return (
    <div className="no-print">
      <div ref={uzel} style={{ height: vyska }} className="w-full overflow-hidden rounded-card border border-line" />
      {chyba
        ? <p className="mt-1 text-xs text-warn">{chyba}</p>
        : onZmena && <p className="mt-1 text-xs text-ink-muted">Klepnutím do mapy upřesníš polohu — našeptávač zná dům, ne který vchod.</p>}
    </div>
  );
}
