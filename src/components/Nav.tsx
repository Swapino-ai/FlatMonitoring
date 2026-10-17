"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

/** Jednoduche linkove ikony. Bez knihovny — je jich jen par a nemaji zvetsovat balicek. */
const IKONY: Record<string, string> = {
  prehled: "M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  nemovitosti: "M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M14 9h5a1 1 0 0 1 1 1v11M8 8h2M8 12h2M8 16h2M3 21h18",
  cashflow: "M3 7a2 2 0 0 1 2-2h13v4M3 7v11a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1H5a2 2 0 0 1-2-1zM16 14h2",
  trh: "M4 20V10M10 20V4M16 20v-8M22 20H2",
  uspory: "M19 5L5 19M7 7m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M17 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0",
  dane: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6",
  reporty: "M4 4h16v16H4zM8 16v-4M12 16V8M16 16v-6",
  sprava: "M4 6h9M19 6h1M4 12h3M13 12h7M4 18h11M21 18h-1M16 6m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M10 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M18 18m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0",
  vice: "M5 12h.01M12 12h.01M19 12h.01",
};

function Ikona({ nazev, trida = "h-[18px] w-[18px]" }: { nazev: string; trida?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`${trida} shrink-0`} fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={IKONY[nazev]} />
    </svg>
  );
}

const LINKS = [
  { href: "/", label: "Přehled", ikona: "prehled" },
  { href: "/properties", label: "Nemovitosti", ikona: "nemovitosti" },
  { href: "/cashflow", label: "Cash flow", ikona: "cashflow" },
  { href: "/market", label: "Trh", ikona: "trh" },
  { href: "/savings", label: "Úspory", ikona: "uspory" },
  { href: "/tax", label: "Daně", ikona: "dane" },
  { href: "/reports", label: "Reporty", ikona: "reporty" },
];

// Uzivatele i provoz jsou schovane pod Spravou — v hlavnim menu by stinily
// tomu, kvuli cemu se do aplikace chodi
const OWNER_LINKS = [{ href: "/sprava", label: "Správa", ikona: "sprava" }];

/** Ve spodni liste na telefonu jsou jen ctyri nejdulezitejsi, zbytek pod "Vice". */
const SPODNI = ["/", "/properties", "/cashflow", "/market"];

export function Nav({ user, verze }: { user: { name: string; role: string }; verze?: ReactNode }) {
  const pathname = usePathname();
  const [vice, setVice] = useState(false);

  // Po prechodu na jinou stranku se nabidka zavre
  useEffect(() => setVice(false), [pathname]);

  const vsechny = [...LINKS, ...(user.role === "OWNER" ? OWNER_LINKS : [])];
  const jeAktivni = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const spodni = vsechny.filter((l) => SPODNI.includes(l.href));
  const dalsi = vsechny.filter((l) => !SPODNI.includes(l.href));
  const dalsiAktivni = dalsi.some((l) => jeAktivni(l.href));

  return (
    <>
      <header className="no-print sticky top-0 z-20 bg-surface-card/90 shadow-[0_1px_0_rgb(var(--border)),0_6px_20px_rgba(15,27,51,0.05)] backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center gap-4 px-4 py-2.5 sm:px-6 lg:gap-6">
          <Link href="/" className="flex items-center gap-2.5 font-bold tracking-tight">
            <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-accent text-white">
              <Ikona nazev="nemovitosti" />
            </span>
            <span>F(a)latMonitoring</span>
          </Link>

          {/* Na velkych obrazovkach horni menu; na telefonu ho nahrazuje spodni lista */}
          <nav className="hidden flex-1 items-center gap-0.5 overflow-x-auto md:flex" aria-label="Hlavní navigace">
            {vsechny.map((l) => {
              const active = jeAktivni(l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-sm transition-colors ${
                    active
                      ? "bg-accent-soft font-semibold text-accent"
                      : "font-medium text-ink-secondary hover:bg-surface-sunken hover:text-ink-primary"
                  }`}
                >
                  <Ikona nazev={l.ikona} />
                  {l.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-3 text-sm md:ml-0">
            {verze}
            <span className="hidden items-center gap-2 text-ink-secondary lg:flex">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-sunken text-xs font-semibold text-ink-primary">
                {user.name.split(/\s+/).map((c) => c[0]).slice(0, 2).join("").toUpperCase()}
              </span>
              {user.name}
              {user.role === "PARTNER" && (
                <span className="rounded bg-surface-sunken px-1.5 py-0.5 text-xs text-ink-muted">jen čtení</span>
              )}
            </span>
            <form action="/api/logout" method="post">
              <button type="submit" className="text-ink-muted transition-colors hover:text-ink-primary">Odhlásit</button>
            </form>
          </div>
        </div>
      </header>

      {/* Spodni lista pro telefon. Fixni, s ohledem na spodni vyrez (iPhone). */}
      <nav
        className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface-card/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        aria-label="Hlavní navigace"
      >
        <ul className="flex items-stretch justify-around px-1 py-1.5">
          {spodni.map((l) => {
            const active = jeAktivni(l.href);
            return (
              <li key={l.href} className="flex-1">
                <Link
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-semibold transition-colors ${
                    active ? "text-accent" : "text-ink-muted"
                  }`}
                >
                  <Ikona nazev={l.ikona} trida="h-[22px] w-[22px]" />
                  {l.label}
                </Link>
              </li>
            );
          })}
          <li className="flex-1">
            <button
              type="button"
              onClick={() => setVice((v) => !v)}
              aria-expanded={vice}
              className={`flex w-full flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-semibold transition-colors ${
                vice || dalsiAktivni ? "text-accent" : "text-ink-muted"
              }`}
            >
              <Ikona nazev="vice" trida="h-[22px] w-[22px]" />
              Více
            </button>
          </li>
        </ul>
      </nav>

      {vice && (
        <div className="no-print fixed inset-0 z-20 md:hidden" onClick={() => setVice(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="absolute inset-x-3 rounded-2xl bg-surface-card p-2 shadow-pop"
            style={{ bottom: "calc(72px + env(safe-area-inset-bottom, 0px))" }}
            onClick={(e) => e.stopPropagation()}
          >
            {dalsi.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium ${
                  jeAktivni(l.href) ? "bg-accent-soft text-accent" : "text-ink-primary"
                }`}
              >
                <Ikona nazev={l.ikona} trida="h-5 w-5" />
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
