import Link from "next/link";
import { page } from "@/lib/guard";
import { Nav } from "@/components/Nav";
import { Verze } from "@/components/Verze";
import { Badge, Card, Empty } from "@/components/Stat";
import { nactiPortfolio } from "@/lib/pohled";
import { PohledPrepinac } from "@/components/PohledPrepinac";
import { czk, czkCompact, dateCz, pct, STATUS_LABELS } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PropertiesPage() {
  const user = await page();
  const { pohled, analyses, maSpoluvlastnictvi } = await nactiPortfolio(user);

  return (
    <>
      <Nav user={user} verze={<Verze />} />
      <main className="mx-auto max-w-[1400px] space-y-5 p-6">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Nemovitosti</h1>
            <p className="mt-1 text-sm text-ink-secondary">Pořizovací ceny, dluhy a výnosnost jednotlivých bytů.</p>
          </div>
          <div className="flex items-center gap-2">
            {maSpoluvlastnictvi && <PohledPrepinac pohled={pohled} />}
            {user.role === "OWNER" && (
              <Link href="/properties/new" className="btn btn-primary no-print">Přidat nemovitost</Link>
            )}
          </div>
        </div>

        {analyses.length === 0 ? (
          <Card><Empty>Zatím žádné nemovitosti.</Empty></Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {analyses.map((a) => (
              <Link key={a.property.id} href={`/properties/${a.property.id}`} className="card transition-colors hover:border-accent/50">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">{a.property.name}</h2>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {a.property.street}, {a.property.city}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge tone={a.property.status === "RENTED" ? "good" : a.property.status === "VACANT" ? "warn" : "neutral"}>
                      {STATUS_LABELS[a.property.status]}
                    </Badge>
                    {a.podil < 1 && <Badge>podíl {Math.round(a.podil * 1000) / 10} %</Badge>}
                  </div>
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
                  <div>
                    <dt className="label">Pořizovací cena</dt>
                    <dd className="tabular-nums">{czkCompact(a.totalInvestment)}</dd>
                  </div>
                  <div>
                    <dt className="label">Tržní hodnota</dt>
                    <dd className="tabular-nums">
                      {czkCompact(a.currentValue)}
                      <span className={`ml-1.5 text-xs ${a.valueGain >= 0 ? "text-good" : "text-bad"}`}>
                        {a.valueGain >= 0 ? "+" : ""}{pct(a.valueGainPct, 0)}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt className="label">Zbývající dluh</dt>
                    <dd className="tabular-nums">{a.currentDebt > 0 ? czkCompact(a.currentDebt) : "bez úvěru"}</dd>
                  </div>
                  <div>
                    <dt className="label">Nájem</dt>
                    <dd className="tabular-nums">{a.monthlyRent ? `${czk(a.monthlyRent)}/měs.` : "—"}</dd>
                  </div>
                  <div>
                    <dt className="label">Čistý výnos</dt>
                    <dd className="font-medium tabular-nums">{pct(a.metrics.netYield)}</dd>
                  </div>
                  <div>
                    <dt className="label">Cash flow</dt>
                    <dd className={`font-medium tabular-nums ${a.metrics.cashFlowAnnual >= 0 ? "text-good" : "text-bad"}`}>
                      {czk(a.metrics.cashFlowAnnual / 12)}/měs.
                    </dd>
                  </div>
                </dl>

                {a.fixationAlert && (
                  <p className="mt-3 rounded-lg bg-warn/10 px-2.5 py-1.5 text-xs text-warn">
                    Konec fixace {dateCz(a.fixationAlert.fixationEnd)} — za {Math.round(a.fixationAlert.monthsLeft)} měsíců.
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
