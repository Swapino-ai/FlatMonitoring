/**
 * Kostra stranky pro dobu, nez dojdou data ze serveru.
 * Bez ni prohlizec drzi starou stranku a navigace vypada jako zamrznuti.
 */

export function Pruh({ w = "w-full", h = "h-4" }: { w?: string; h?: string }) {
  return <div className={`${w} ${h} animate-pulse rounded bg-surface-sunken`} />;
}

export function KostraStatu() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="card space-y-2">
          <Pruh w="w-24" h="h-3" />
          <Pruh w="w-32" h="h-7" />
          <Pruh w="w-40" h="h-3" />
        </div>
      ))}
    </div>
  );
}

export function KostraKarty({ vyska = "h-64" }: { vyska?: string }) {
  return (
    <div className="card space-y-3">
      <Pruh w="w-48" h="h-4" />
      <div className={`${vyska} animate-pulse rounded-lg bg-surface-sunken`} />
    </div>
  );
}

export function KostraTabulky({ radku = 5 }: { radku?: number }) {
  return (
    <div className="card space-y-3">
      <Pruh w="w-40" h="h-4" />
      {Array.from({ length: radku }).map((_, i) => (
        <div key={i} className="flex gap-3">
          <Pruh w="w-1/3" />
          <Pruh w="w-1/4" />
          <Pruh w="w-1/5" />
          <Pruh w="w-1/6" />
        </div>
      ))}
    </div>
  );
}

export function KostraStranky({ nadpis, children }: { nadpis: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-[1400px] space-y-5 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-muted">{nadpis}</h1>
        <div className="mt-2"><Pruh w="w-64" h="h-3" /></div>
      </div>
      {children}
    </main>
  );
}
