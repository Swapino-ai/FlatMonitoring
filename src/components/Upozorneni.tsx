import Link from "next/link";
import type { Upozorneni as Polozka } from "@/lib/upozorneni";
import { Ikona, type NazevIkony } from "./Ikony";

const BARVY = {
  bad: "bg-bad/10 text-bad",
  warn: "bg-warn/15 text-warn",
  info: "bg-accent-soft text-accent",
};
const VIDET = 5;

function Radek({ u }: { u: Polozka }) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${BARVY[u.uroven]}`}>
        <Ikona nazev={u.ikona as NazevIkony} trida="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{u.text}</div>
        {u.detail && <div className="truncate text-xs text-ink-muted">{u.detail}</div>}
      </div>
      <Link href={u.href} className="btn shrink-0 py-1.5 text-xs">{u.akce} →</Link>
    </li>
  );
}

/** Lista "Čeká na tebe" na hlavni strance: co je potreba udelat, nejdulezitejsi nahore. */
export function Upozorneni({ polozky }: { polozky: Polozka[] }) {
  const navic = polozky.slice(VIDET);
  return (
    <section className="card" aria-label="Co čeká na vyřízení">
      <div className="flex items-center gap-2">
        <h2 className="card-title">Čeká na tebe</h2>
        <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-white">{polozky.length}</span>
      </div>
      <ul className="divide-y divide-line/70">
        {polozky.slice(0, VIDET).map((u) => <Radek key={u.klic} u={u} />)}
      </ul>
      {navic.length > 0 && (
        <details>
          <summary className="cursor-pointer py-1.5 text-xs text-accent hover:underline">Zobrazit další ({navic.length})</summary>
          <ul className="divide-y divide-line/70">{navic.map((u) => <Radek key={u.klic} u={u} />)}</ul>
        </details>
      )}
    </section>
  );
}
