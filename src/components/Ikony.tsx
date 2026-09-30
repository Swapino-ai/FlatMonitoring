/**
 * Sdilena sada linkovych ikon. Bez knihovny — je jich jen par a nemaji
 * zvetsovat balicek. Vsechny maji stejny obrys, aby vedle sebe pusobily jako jedna.
 */
const CESTY: Record<string, string> = {
  pero: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
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
