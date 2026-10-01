/**
 * Sdilena sada linkovych ikon. Bez knihovny — je jich jen par a nemaji
 * zvetsovat balicek. Vsechny maji stejny obrys, aby vedle sebe pusobily jako jedna.
 */
const CESTY: Record<string, string> = {
  pero: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
  kopie: "M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1",
  trend: "M3 17l6-6 4 4 8-8M15 7h6v6",
  historie: "M12 7v5l3 2M3 12a9 9 0 1 0 3-6.7M3 4v4h4",
  dokument: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6",
  kos: "M4 7h16M10 11v6M14 11v6M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M9 7V4h6v3",
  blesk: "M13 2L4 14h7l-1 8 9-12h-7z",
  plamen: "M12 22c4 0 7-3 7-7 0-3-2-5-3-7-1 2-2 3-4 3 0-3-1-6-4-9 0 4-3 6-3 10 0 5 3 10 7 10z",
  kapka: "M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z",
  teplomer: "M14 14.8V4a2 2 0 0 0-4 0v10.8a4 4 0 1 0 4 0z",
  wifi: "M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01",
  stit: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  budova: "M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M14 9h5a1 1 0 0 1 1 1v11M8 8h2M8 12h2M8 16h2M3 21h18",
  kufr: "M3 8h18v12H3zM8 8V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v3M3 13h18",
  odpad: "M5 7h14l-1.5 13a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1zM3 7h18M9 7V4h6v3M10 11v6M14 11v6",
  tri: "M5 12h.01M12 12h.01M19 12h.01",
  kalendar: "M4 6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 10h16M8 3v4M16 3v4",
  penize: "M3 7a2 2 0 0 1 2-2h13v4M3 7v11a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1H5a2 2 0 0 1-2-1zM16 14h2",
  sipkaNahoru: "M7 17L17 7M9 7h8v8",
  sipkaDolu: "M17 7L7 17M15 17H7V9",
  pozor: "M12 9v4M12 17h.01M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  ok: "M5 12l5 5L20 7",
  uklid: "M20 4l-8 8M12 12l-7 1-2 8 8-2 1-7zM8 17l2-4",
  zelen: "M12 21v-5M7 16h10c2-1 3-3 3-5a4.5 4.5 0 0 0-3.5-4.4A5 5 0 0 0 7.5 7 4.5 4.5 0 0 0 4 11c0 2 1 4 3 5z",
  vytah: "M4 3h16v18H4zM12 3v18M7.5 10l1.5-3 1.5 3M13.5 14l1.5 3 1.5-3",
  schody: "M3 20h5v-4h4v-4h4V8h5",
  zarovka: "M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z",
  klic: "M15 7a4 4 0 1 1-1 7.9L9 20H6v-3l1-1h2v-2l1.1-1.1A4 4 0 0 1 15 7zM16.5 8.5h.01",
  naradi: "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z",
  televize: "M3 6h18v12H3zM8 21h8M12 18v3",
  kamera: "M3 8h13v9H3zM16 11l5-3v9l-5-3",
  parkovani: "M5 3h14v18H5zM10 17V8h3a2.5 2.5 0 0 1 0 5h-3",
  najemce: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
};

export type NazevIkony = keyof typeof CESTY;

export function Ikona({ nazev, trida = "h-[18px] w-[18px]" }: { nazev: NazevIkony; trida?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`${trida} shrink-0`} fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={CESTY[nazev]} />
    </svg>
  );
}

/** Ikona druhu sluzby — pri pohledu na seznam se druh pozna driv, nez se precte. */
export const IKONA_SLUZBY: Record<string, NazevIkony> = {
  ELECTRICITY: "blesk",
  GAS: "plamen",
  WATER: "kapka",
  HEATING: "teplomer",
  INTERNET: "wifi",
  INSURANCE: "stit",
  SVJ_FEE: "budova",
  MANAGEMENT: "kufr",
  WASTE: "odpad",
  OTHER: "tri",
};
