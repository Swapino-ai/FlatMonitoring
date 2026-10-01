import { Ikona } from "./Ikony";
import { popisPorovnani, type PorovnaniZaloh } from "@/lib/zalohy";

/**
 * Trvale upozorneni, jestli zalohy najemce sedi se sluzbami. Neni to jen hlaska
 * po ulozeni: nesoulad vznikne i tim, ze se zmeni cena sluzby, a to se pozna
 * u jine karty nez ta, kterou clovek zrovna edituje.
 *
 * Kdyz vse sedi, ukaze se jen tichy radek — potvrzeni je taky informace.
 */
export function ZalohyUpozorneni({ porovnani }: { porovnani: PorovnaniZaloh | null }) {
  if (!porovnani) return null;
  const p = popisPorovnani(porovnani);

  if (p.tone === "good") {
    return (
      <p className="mb-3 flex items-center gap-2 text-sm text-good">
        <Ikona nazev="ok" trida="h-4 w-4" />
        <span><b className="font-semibold">{p.nadpis}.</b> <span className="text-ink-secondary">{p.text}</span></span>
      </p>
    );
  }

  if (p.tone === "info") {
    return (
      <div className="mb-3 flex items-start gap-3 rounded-xl bg-accent-soft/70 px-4 py-3 text-sm" role="status">
        <Ikona nazev="najemce" trida="mt-0.5 h-[18px] w-[18px] text-accent" />
        <div className="min-w-0">
          <div className="font-semibold">{p.nadpis}</div>
          <p className="mt-0.5 text-ink-secondary">{p.text}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-3 flex items-start gap-3 rounded-xl bg-warn/15 px-4 py-3 text-sm" role="status">
      <Ikona nazev="pozor" trida="mt-0.5 h-[18px] w-[18px] text-warn" />
      <div className="min-w-0">
        <div className="font-semibold">{p.nadpis}</div>
        <p className="mt-0.5 text-ink-secondary">{p.text}</p>
      </div>
    </div>
  );
}
