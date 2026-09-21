"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const LINKS = [
  { href: "/", label: "Přehled" },
  { href: "/properties", label: "Nemovitosti" },
  { href: "/cashflow", label: "Cash flow" },
  { href: "/market", label: "Trh" },
  { href: "/savings", label: "Úspory" },
  { href: "/tax", label: "Daně" },
  { href: "/reports", label: "Reporty" },
];

const OWNER_LINKS = [{ href: "/users", label: "Uživatelé" }];

export function Nav({ user, verze }: { user: { name: string; role: string }; verze?: ReactNode }) {
  const pathname = usePathname();

  return (
    <header className="no-print sticky top-0 z-20 border-b border-line bg-surface-card/85 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] items-center gap-6 px-6 py-3">
        <Link href="/" className="flex items-center gap-2.5 font-semibold">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-xs font-bold text-white">FM</span>
          <span className="hidden sm:inline">FlatMonitoring</span>
        </Link>

        <nav className="flex flex-1 items-center gap-0.5 overflow-x-auto">
          {[...LINKS, ...(user.role === "OWNER" ? OWNER_LINKS : [])].map((l) => {
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  active ? "bg-surface-sunken font-medium text-ink-primary" : "text-ink-secondary hover:text-ink-primary"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3 text-sm">
          <span className="hidden lg:inline">{verze}</span>
          <span className="hidden text-ink-secondary md:inline">
            {user.name}
            {user.role === "PARTNER" && (
              <span className="ml-2 rounded bg-surface-sunken px-1.5 py-0.5 text-xs text-ink-muted">jen čtení</span>
            )}
          </span>
          <form action="/api/logout" method="post">
            <button type="submit" className="text-ink-muted transition-colors hover:text-ink-primary">Odhlásit</button>
          </form>
        </div>
      </div>
    </header>
  );
}
