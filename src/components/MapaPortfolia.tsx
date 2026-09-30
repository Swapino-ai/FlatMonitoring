"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import { ikonaDomecek } from "@/lib/mapaIkona";

export interface BodMapy {
  id: string;
  nazev: string;
  adresa: string;
  lat: number;
  lon: number;
  stav: string;
  neobsazeno: boolean;
  hodnota: string;
  vynos: string;
  cashflow: string;
  cashflowKladny: boolean;
}

/** Texty z databaze jdou do HTML popisku, proto se escapuji. */
function esc(t: string): string {
  return t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function popisek(b: BodMapy, sOdkazem: boolean): string {
  return `
    <div class="fm-tip-t">${esc(b.nazev)}</div>
    <div class="fm-tip-a">${esc(b.adresa)}</div>
    <div class="fm-tip-s ${b.neobsazeno ? "warn" : "ok"}">${esc(b.stav)}</div>
    <dl class="fm-tip-g">
      <div><dt>Hodnota</dt><dd>${esc(b.hodnota)}</dd></div>
      <div><dt>Čistý výnos</dt><dd>${esc(b.vynos)}</dd></div>
      <div><dt>Cash flow / rok</dt><dd class="${b.cashflowKladny ? "ok" : "bad"}">${esc(b.cashflow)}</dd></div>
    </dl>
    ${sOdkazem
      ? `<a class="fm-tip-btn" href="/properties/${encodeURIComponent(b.id)}">Otevřít nemovitost →</a>`
      : `<div class="fm-tip-h">Klikni pro detail</div>`}`;
}

/**
 * Mapa Mapy.cz se vsemi nemovitostmi.
 *
 * Vyrez se nastavi tak, aby byly videt vsechny, ale s velkym okrajem a bez
 * dalsiho priblizeni — u jedne nemovitosti nebo dvou vedle sebe by jinak mapa
 * skoncila na urovni jednotlivych domu a nebylo by poznat, kde to je.
 *
 * Mys: po najeti se ukaze popisek, klik otevre nemovitost.
 * Dotyk: mys neexistuje, prvni klepnuti proto otevre popisek s tlacitkem.
 */
export function MapaPortfolia({ body, vyskaTrida = "h-72 lg:h-[26rem]" }: {
  body: BodMapy[];
  vyskaTrida?: string;
}) {
  const uzel = useRef<HTMLDivElement>(null);
  const mapa = useRef<LeafletMap | null>(null);
  const router = useRouter();
  const [chyba, setChyba] = useState("");

  useEffect(() => {
    if (!uzel.current || mapa.current || body.length === 0) return;
    let zruseno = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (zruseno || !uzel.current) return;

      const kontejner = uzel.current as HTMLDivElement & { _leaflet_id?: number };
      if (kontejner._leaflet_id != null) delete kontejner._leaflet_id;

      // Bez mysi neni "najeti" — rozhoduje schopnost hoveru, ne sirka obrazovky
      const dotyk = window.matchMedia("(hover: none)").matches;

      const m = L.map(uzel.current, {
        attributionControl: true,
        // Kolecko priblizuje mapu tam, kde mys existuje. Na dotyku kolecko neni
        // a jeden prst musi dal posouvat stranku.
        scrollWheelZoom: !dotyk,
        // Na telefonu by jeden prst chytil mapu a stranka by prestala jit posouvat
        dragging: !dotyk,
      });

      L.tileLayer("/api/mapa/dlazdice/{z}/{x}/{y}", {
        minZoom: 0,
        maxZoom: 19,
        // Podminky Mapy.cz vyzaduji viditelne uvedeni zdroje
        attribution: '<a href="https://mapy.cz/" target="_blank" rel="noreferrer noopener">Mapy.cz</a>',
      })
        .on("tileerror", () => setChyba("Dlaždice mapy se nenačetly — zkontroluj MAPY_API_KEY."))
        .addTo(m);

      // Neobsazena nemovitost je oranzova — na mape je videt, ktera nevydelava.
      // Barva neni jedina informace: popisek rika stav slovy.
      const ikonaBezna = ikonaDomecek(L);
      const ikonaVolna = ikonaDomecek(L, "var(--status-warning)");

      for (const b of body) {
        const z = L.marker([b.lat, b.lon], {
          icon: b.neobsazeno ? ikonaVolna : ikonaBezna,
          title: b.nazev,
          riseOnHover: true,
        }).addTo(m);

        if (dotyk) {
          z.bindPopup(popisek(b, true), { className: "fm-tip", offset: [0, -34], closeButton: false, maxWidth: 260 });
        } else {
          z.bindTooltip(popisek(b, false), {
            className: "fm-tip",
            direction: "top",
            offset: [0, -40],
            opacity: 1,
          });
          z.on("click", () => router.push(`/properties/${b.id}`));
        }
      }

      // Okraj 64 px kolem vsech bodu a strop priblizeni. Bez stropu by jedna
      // nemovitost zaostrila mapu na uroven domu a nebylo by poznat, kde je.
      const hranice = L.latLngBounds(body.map((b) => [b.lat, b.lon] as [number, number]));
      m.fitBounds(hranice, { padding: [64, 64], maxZoom: 14 });

      if (zruseno) { m.remove(); return; }
      mapa.current = m;
      setTimeout(() => mapa.current?.invalidateSize(), 0);
    })();

    return () => {
      zruseno = true;
      mapa.current?.remove();
      mapa.current = null;
    };
    // Mapa se stavi jednou; body prichazi ze serveru a mezi vykreslenimi se nemeni
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="no-print">
      <div ref={uzel} className={`w-full overflow-hidden rounded-xl border border-line ${vyskaTrida}`} />
      {chyba && <p className="mt-1 text-xs text-warn">{chyba}</p>}
    </div>
  );
}
