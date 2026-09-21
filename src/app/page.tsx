import Link from "next/link";
import { page } from "@/lib/guard";
import { Nav } from "@/components/Nav";
import { Verze } from "@/components/Verze";
import { Badge, Card, Empty, Stat, StatGrid } from "@/components/Stat";
import { CashFlowChart, EquityChart, YieldBarChart } from "@/components/charts";
import { analyzeProperty, loadProperties, summarize } from "@/lib/portfolio";
import { cashFlowSeries, equitySeries } from "@/lib/series";
import { findBundleOpportunities, summarizeSavings } from "@/lib/savings";
import { czk, czkCompact, dateCz, pct, STATUS_LABELS } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const user = await page();
  const properties = await loadProperties();
  const analyses = properties.map((p) => analyzeProperty(p));
  const s = summarize(analyses);
  const savings = summarizeSavings(findBundleOpportunities(properties));

  const equity = equitySeries(properties);
  const cashflow = cashFlowSeries(properties);
  const yields = analyses
    .filter((a) => a.property.status !== "SOLD")
    .map((a) => ({ name: a.property.name, vynos: Number(a.metrics.netYield.toFixed(2)) }))
    .sort((a, b) => b.vynos - a.vynos);

  const alerts = analyses.filter((a) => a.fixationAlert).map((a) => a.fixationAlert!);

  return (
    <>
      <Nav user={user} verze={<Verze />} />
      <main className="mx-auto max-w-[1400px] space-y-5 p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Přehled portfolia</h1>
            <p className="mt-1 text-sm text-ink-secondary">
              {s.count} {s.count === 1 ? "nemovitost" : s.count < 5 ? "nemovitosti" : "nemovitostí"} · {Math.round(s.totalAreaM2)} m² ·
              obsazenost {pct(s.occupancyPct, 0)}
            </p>
          </div>
          <Link href="/reports" className="btn no-print">Vygenerovat PDF report</Link>
        </div>

        {properties.length === 0 ? (
          <Card>
            <Empty>
              Zatím žádné nemovitosti. Spusť <code className="rounded bg-surface-sunken px-1.5 py-0.5">npm run db:seed</code> pro
              ukázková data, nebo přidej byt v sekci Nemovitosti.
            </Empty>
          </Card>
        ) : (
          <>
            <StatGrid>
              <Stat
                label="Tržní hodnota"
                value={czkCompact(s.currentValue)}
                sub={`Pořízeno za ${czkCompact(s.totalInvestment)}`}
              />
              <Stat
                label="Vlastní kapitál"
                value={czkCompact(s.equity)}
                sub={`Dluh ${czkCompact(s.totalDebt)} · LTV ${pct(s.ltv, 0)}`}
                tone={s.ltv > 80 ? "warn" : "neutral"}
              />
              <Stat
                label="Měsíční cash flow"
                value={czk(s.monthlyCashFlow)}
                sub={`Ročně ${czkCompact(s.annualCashFlow)} po splátkách`}
                tone={s.annualCashFlow >= 0 ? "good" : "bad"}
              />
              <Stat
                label="Čistý výnos"
                value={pct(s.avgNetYield)}
                sub={`Hrubý ${pct(s.avgGrossYield)} · CoC ${pct(s.avgCashOnCash)}`}
                hint="NOI dělené celkovými pořizovacími náklady"
              />
            </StatGrid>

            {(alerts.length > 0 || savings.totalIdentifiedSaving > 1000) && (
              <div className="grid gap-3 md:grid-cols-2">
                {alerts.length > 0 && (
                  <Card title="Blíží se konec fixace">
                    <ul className="space-y-2 text-sm">
                      {alerts.map((a, i) => (
                        <li key={i} className="flex items-center justify-between gap-3">
                          <span className="text-ink-secondary">{a.lender}</span>
                          <span className="flex items-center gap-2">
                            <Badge tone={a.monthsLeft <= 3 ? "bad" : "warn"}>
                              za {Math.round(a.monthsLeft)} měs.
                            </Badge>
                            <span className="tabular-nums text-ink-muted">{dateCz(a.fixationEnd)}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 text-xs text-ink-muted">
                      Refinancování řeš 6 měsíců předem — banky si na poslední chvíli nechají zaplatit.
                    </p>
                  </Card>
                )}
                {savings.totalIdentifiedSaving > 1000 && (
                  <Card title="Identifikované úspory" action={<Link href="/savings" className="text-xs text-accent">Detail →</Link>}>
                    <div className="text-2xl font-semibold tabular-nums text-good">
                      {czk(savings.totalIdentifiedSaving)}<span className="text-sm font-normal text-ink-muted"> / rok</span>
                    </div>
                    <p className="mt-2 text-sm text-ink-secondary">
                      {pct(savings.savingPct, 0)} z ročních nákladů na služby.
                      {savings.topOpportunity && ` Největší prostor: ${savings.topOpportunity.typeLabel}.`}
                    </p>
                  </Card>
                )}
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              <Card title="Hodnota portfolia a zbývající dluh">
                {equity.length > 1 ? <EquityChart data={equity} /> : <Empty>Málo dat pro graf vývoje.</Empty>}
              </Card>
              <Card title="Měsíční cash flow za posledních 12 měsíců">
                {cashflow.some((c) => c.prijmy || c.vydaje) ? (
                  <CashFlowChart data={cashflow} />
                ) : (
                  <Empty>Zatím žádné zaúčtované transakce.</Empty>
                )}
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-5">
              <Card title="Čistý výnos podle nemovitosti" className="lg:col-span-2">
                {yields.length > 0 ? <YieldBarChart data={yields} average={s.avgNetYield} /> : <Empty>—</Empty>}
              </Card>

              <Card title="Nemovitosti" className="lg:col-span-3">
                <div className="overflow-x-auto">
                  <table className="table-base">
                    <thead>
                      <tr>
                        <th>Nemovitost</th>
                        <th>Stav</th>
                        <th className="num">Hodnota</th>
                        <th className="num">Dluh</th>
                        <th className="num">Nájem/měs.</th>
                        <th className="num">Čistý výnos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analyses.map((a) => (
                        <tr key={a.property.id} className="transition-colors hover:bg-surface-sunken/60">
                          <td>
                            <Link href={`/properties/${a.property.id}`} className="font-medium hover:text-accent">
                              {a.property.name}
                            </Link>
                            <div className="text-xs text-ink-muted">
                              {a.property.city} · {a.property.disposition} · {a.property.areaM2} m²
                            </div>
                          </td>
                          <td>
                            <Badge tone={a.property.status === "RENTED" ? "good" : a.property.status === "VACANT" ? "warn" : "neutral"}>
                              {STATUS_LABELS[a.property.status]}
                            </Badge>
                          </td>
                          <td className="num">{czkCompact(a.currentValue)}</td>
                          <td className="num">{a.currentDebt > 0 ? czkCompact(a.currentDebt) : "—"}</td>
                          <td className="num">{a.monthlyRent ? czk(a.monthlyRent) : "—"}</td>
                          <td className="num font-medium">{pct(a.metrics.netYield)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          </>
        )}
      </main>
    </>
  );
}
