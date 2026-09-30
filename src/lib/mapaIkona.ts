import type { DivIcon } from "leaflet";

type Leaflet = typeof import("leaflet");

/**
 * Domecek v kapce — na mapovem podkladu je poznat na prvni pohled, bily
 * kotouc kolem drzi kontrast i nad tmavou zastavbou.
 *
 * Leaflet hleda obrazek znacky na ceste, ktera po sestaveni neexistuje;
 * znacka z SVG ten problem obchazi a drzi vzhled aplikace.
 *
 * Barva je CSS promenna, ne pevna hodnota, aby ikona sledovala svetly i tmavy rezim.
 */
export function ikonaDomecek(L: Leaflet, barva = "var(--accent)"): DivIcon {
  return L.divIcon({
    className: "",
    html: `
      <svg width="34" height="44" viewBox="0 0 34 44" xmlns="http://www.w3.org/2000/svg">
        <path d="M17 43C17 43 32 26.5 32 17A15 15 0 1 0 2 17c0 9.5 15 26 15 26z"
          fill="rgb(${barva})" stroke="#fff" stroke-width="2.5"
          style="filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))"/>
        <circle cx="17" cy="16.5" r="9.5" fill="#fff"/>
        <path d="M17 10.5l6.5 5.5v6.5h-4.3v-4h-4.4v4H10.5V16z" fill="rgb(${barva})"/>
      </svg>`,
    iconSize: [34, 44],
    // Spicka kapky ukazuje na misto, ne jeji stred
    iconAnchor: [17, 43],
  });
}
