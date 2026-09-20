/**
 * Tiskova verze reportu. Zamerne bez navigace — tuhle stranku renderuje
 * headless Chromium do PDF (src/lib/pdf.ts), a zaroven ji lze vytisknout z prohlizece.
 */
import { page } from "@/lib/guard";
import { Card } from "@/components/Stat";
import { EquityChart, CashFlowChart, YieldBarChart, ExpenseBreakdownChart } from "@/components/charts";
import { analyzeProperty, loadProperties, summarize } from "@/lib/portfolio";
import { cashFlowSeries, equitySeries, expenseBreakdown } from "@/lib/series";
import { findBundleOpportunities, summarizeSavings } from "@/lib/savings";
import { buildTaxReport } from "@/lib/taxReport";
import { PrintTrigger } from "@/components/PrintTrigger";
import { categoryLabel } from "@/lib/categories";
import { czk, czkCompact, dateCz, num, pct, STATUS_LABELS } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ReportPage({ searchParams }: { searchParams: Promise<{ rok?: string; sekce?: string; tisk?: string }> }) {
  await page();
  const { rok, sekce, tisk } = await searchParams;
  const year = Number(rok) || new Date().getFullYear();
  const sections = new Set((sekce ?? "prehled,nemovitosti,cashflow,uspory,dane").split(","));

  const properties = await loadProperties();
  const analyses = properties.map((p) => analyzeProperty(p));
  const s = summarize(analyses);
  const equity = equitySeries(properties);
  const cashflow = cashFlowSeries(properties);
  const expenses = expenseBreakdown(properties, year).map((e) => ({ kategorie: categoryLabel(e.kategorie), castka: e.castka }));
  const opportunities = findBundleOpportunities(properties);
  const savings = summarizeSavings(opportunities);
  const tax = buildTaxReport(properties, year);

  const yields = analyses
    .filter((a) => a.property.status !== "SOLD")
    .map((a) => ({ name: a.property.name, vynos: Number(a.metrics.netYield.toFixed(2)) }))
    .sort((a, b) => b.vynos - a.vynos);

  return (
    <main className="mx-auto max-w-[1100px] space-y-6 p-8" data-report-ready="true">
      <PrintTrigger active={tisk === "1"} />
      <header className="flex items-end justify-between gap-4 border-b border-line pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-xs font-bold text-white">FM</span>
            <span className="text-sm font-medium text-ink-secondary">FlatMonitoring</span>
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Report nemovitostního portfolia</h1>
          <p className="mt-1 text-sm text-ink-secondary">
            Stav k {dateCz(new Date())} · daňový rok {year}
          </p>
        </div>
        <div className="text-right text-sm">
          <div className="text-ink-muted">Hodnota portfolia</div>
          <div className="text-2xl font-semibold tabular-nums">{czkCompact(s.currentValue)}</div>
        </div>
      </header>

      {sections.has("prehled") && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Souhrn</h2>

          <div className="grid grid-cols-4 gap-3">
            <Kpi label="Nemovitostí" value={String(s.count)} sub={`${num(s.totalAreaM2)} m² · obsazenost ${pct(s.occupancyPct, 0)}`} />
            <Kpi label="Vlastní kapitál" value={czkCompact(s.equity)} sub={`Dluh ${czkCompact(s.totalDebt)} · LTV ${pct(s.ltv, 0)}`} />
            <Kpi label="Roční cash flow" value={czkCompact(s.annualCashFlow)} sub={`${czk(s.monthlyCashFlow)} měsíčně`} />
            <Kpi label="Čistý výnos" value={pct(s.avgNetYield)} sub={`Hrubý ${pct(s.avgGrossYield)} · CoC ${pct(s.avgCashOnCash)}`} />
          </div>

          <Card title="Vývoj hodnoty a dluhu">
            {equity.length > 1 ? <EquityChart data={equity} /> : <p className="text-sm text-ink-muted">Málo dat.</p>}
          </Card>

          <div className="grid grid-cols-2 gap-4">
            <Card title="Čistý výnos podle nemovitosti">
              <YieldBarChart data={yields} average={s.avgNetYield} />
            </Card>
            <Card title={`Struktura výdajů ${year}`}>
              {expenses.length ? <ExpenseBreakdownChart data={expenses.slice(0, 8)} /> : <p className="text-sm text-ink-muted">—</p>}
            </Card>
          </div>
        </section>
      )}

      {sections.has("nemovitosti") && (
        <section className="print-break space-y-4">
          <h2 className="text-lg font-semibold">Nemovitosti</h2>
          <Card>
            <table className="table-base">
              <thead>
                <tr>
                  <th>Nemovitost</th><th>Stav</th>
                  <th className="num">Pořizovací cena</th><th className="num">Tržní hodnota</th>
                  <th className="num">Dluh</th><th className="num">Nájem/měs.</th>
                  <th className="num">Čistý výnos</th><th className="num">IRR</th>
                </tr>
              </thead>
              <tbody>
                {analyses.map((a) => (
                  <tr key={a.property.id}>
                    <td className="font-medium">
                      {a.property.name}
                      <div className="text-xs text-ink-muted">{a.property.street}, {a.property.city} · {a.property.disposition} · {a.property.areaM2} m²</div>
                    </td>
                    <td className="text-ink-secondary">{STATUS_LABELS[a.property.status]}</td>
                    <td className="num">{czk(a.totalInvestment)}</td>
                    <td className="num">{czk(a.currentValue)}</td>
                    <td className="num">{a.currentDebt > 0 ? czk(a.currentDebt) : "—"}</td>
                    <td className="num">{a.monthlyRent ? czk(a.monthlyRent) : "—"}</td>
                    <td className="num">{pct(a.metrics.netYield)}</td>
                    <td className="num">{a.irr != null ? pct(a.irr) : "—"}</td>
                  </tr>
                ))}
                <tr className="bg-surface-sunken/60">
                  <td className="font-semibold" colSpan={2}>Celkem</td>
                  <td className="num font-semibold">{czk(s.totalInvestment)}</td>
                  <td className="num font-semibold">{czk(s.currentValue)}</td>
                  <td className="num font-semibold">{czk(s.totalDebt)}</td>
                  <td className="num font-semibold">{czk(s.annualGrossRent / 12)}</td>
                  <td className="num font-semibold">{pct(s.avgNetYield)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </Card>

          {analyses.filter((a) => a.fixationAlert).length > 0 && (
            <Card title="Blížící se konec fixace">
              <ul className="space-y-1.5 text-sm">
                {analyses.filter((a) => a.fixationAlert).map((a) => (
                  <li key={a.property.id} className="flex justify-between">
                    <span>{a.property.name} — {a.fixationAlert!.lender}</span>
                    <span className="tabular-nums">{dateCz(a.fixationAlert!.fixationEnd)} (za {Math.round(a.fixationAlert!.monthsLeft)} měs.)</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>
      )}

      {sections.has("cashflow") && (
        <section className="print-break space-y-4">
          <h2 className="text-lg font-semibold">Cash flow za posledních 12 měsíců</h2>
          <Card><CashFlowChart data={cashflow} /></Card>
        </section>
      )}

      {sections.has("uspory") && opportunities.length > 0 && (
        <section className="print-break space-y-4">
          <h2 className="text-lg font-semibold">Příležitosti k úsporám</h2>
          <Card title={`Identifikovaná úspora ${czk(savings.totalIdentifiedSaving)} ročně (${pct(savings.savingPct, 0)} nákladů na služby)`}>
            <table className="table-base">
              <thead>
                <tr><th>Služba</th><th className="num">Jednotek</th><th className="num">Dodavatelů</th>
                  <th className="num">Roční náklad</th><th className="num">Možná úspora</th></tr>
              </thead>
              <tbody>
                {opportunities.map((o) => (
                  <tr key={o.type}>
                    <td className="font-medium">{o.typeLabel}</td>
                    <td className="num">{o.propertyCount}</td>
                    <td className="num">{o.providerCount}</td>
                    <td className="num">{czk(o.totalAnnual)}</td>
                    <td className="num font-medium text-good">{o.totalSavingAnnual > 0 ? czk(o.totalSavingAnnual) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="mt-4 space-y-1.5 text-sm text-ink-secondary">
              {opportunities.slice(0, 3).map((o) => (
                <li key={o.type}><strong className="text-ink-primary">{o.typeLabel}:</strong> {o.recommendation}</li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      {sections.has("dane") && tax.lines.length > 0 && (
        <section className="print-break space-y-4">
          <h2 className="text-lg font-semibold">Daňový podklad {year} — § 9 ZDP</h2>
          {tax.incompleteYear && (
            <p className="rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">
              Rok {year} dosud neskončil — příjmy jsou za uplynulou část roku, odpis je celoroční. Čísla jsou orientační
              do uzávěrky roku.
            </p>
          )}
          <Card title={`Výhodnější varianta: ${tax.computation.recommended.label}`}>
            <table className="table-base">
              <thead>
                <tr><th>Nemovitost</th><th className="num">Příjmy</th><th className="num">Výdaje</th>
                  <th className="num">Úroky</th><th className="num">Odpisy</th><th className="num">Výsledek</th></tr>
              </thead>
              <tbody>
                {tax.lines.map((l) => (
                  <tr key={l.id}>
                    <td className="font-medium">{l.name}</td>
                    <td className="num">{czk(l.rentalIncome)}</td>
                    <td className="num">{czk(l.deductibleExpenses)}</td>
                    <td className="num">{czk(l.loanInterest)}</td>
                    <td className="num">{czk(l.depreciation)}</td>
                    <td className="num font-medium">{czk(l.result)}</td>
                  </tr>
                ))}
                <tr className="bg-surface-sunken/60">
                  <td className="font-semibold">Celkem</td>
                  <td className="num font-semibold">{czk(tax.totals.rentalIncome)}</td>
                  <td className="num font-semibold">{czk(tax.totals.deductibleExpenses)}</td>
                  <td className="num font-semibold">{czk(tax.totals.loanInterest)}</td>
                  <td className="num font-semibold">{czk(tax.totals.depreciation)}</td>
                  <td className="num font-semibold">
                    {czk(tax.totals.rentalIncome - tax.totals.deductibleExpenses - tax.totals.loanInterest - tax.totals.depreciation)}
                  </td>
                </tr>
              </tbody>
            </table>

            <div className="mt-4 grid grid-cols-2 gap-4">
              {tax.computation.options.map((o) => (
                <div key={o.method} className={`rounded-card border p-3 ${o.method === tax.computation.recommended.method ? "border-good" : "border-line"}`}>
                  <div className="text-sm font-medium">{o.label}</div>
                  <table className="table-base mt-2">
                    <tbody>
                      <tr><td className="text-ink-secondary">Výdaje</td><td className="num">{czk(o.expenses)}</td></tr>
                      <tr><td className="text-ink-secondary">Základ daně</td><td className="num">{czk(o.taxBase)}</td></tr>
                      <tr><td className="font-medium">Daň</td><td className="num font-semibold">{czk(o.taxDue)}</td></tr>
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </Card>
        </section>
      )}

      <footer className="border-t border-line pt-4 text-xs text-ink-muted">
        Vygenerováno aplikací FlatMonitoring {dateCz(new Date())}. Údaje vychází z vlastní evidence a nabídkových cen z
        veřejných inzertních portálů. Daňová část je podkladem pro přiznání, nenahrazuje daňového poradce.
      </footer>
    </main>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-card border border-line p-4">
      <div className="label">{label}</div>
      <div className="mt-1.5 text-xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-ink-secondary">{sub}</div>}
    </div>
  );
}
