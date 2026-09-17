import { page } from "@/lib/guard";
import { Nav } from "@/components/Nav";
import { Card, Empty, Stat, StatGrid } from "@/components/Stat";
import { CashFlowChart, ExpenseBreakdownChart } from "@/components/charts";
import { loadProperties } from "@/lib/portfolio";
import { cashFlowSeries, expenseBreakdown } from "@/lib/series";
import { categoryLabel } from "@/lib/categories";
import { czk, dateCz } from "@/lib/format";
import { sum } from "@/lib/finance";

export const dynamic = "force-dynamic";

export default async function CashFlowPage() {
  const user = await page();
  const properties = await loadProperties();
  const year = new Date().getFullYear();

  const series = cashFlowSeries(properties, 12);
  const expenses = expenseBreakdown(properties, year).map((e) => ({ kategorie: categoryLabel(e.kategorie), castka: e.castka }));

  const totalIncome = sum(series.map((s) => s.prijmy));
  const totalExpense = sum(series.map((s) => s.vydaje));
  const net = totalIncome - totalExpense;
  const best = series.reduce((a, b) => (b.cisty > a.cisty ? b : a), series[0]);
  const worst = series.reduce((a, b) => (b.cisty < a.cisty ? b : a), series[0]);

  const recent = properties
    .flatMap((p) => p.transactions.map((t) => ({ ...t, propertyName: p.name })))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 25);

  return (
    <>
      <Nav user={user} />
      <main className="mx-auto max-w-[1400px] space-y-5 p-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cash flow</h1>
          <p className="mt-1 text-sm text-ink-secondary">
            Skutečné peněžní toky za posledních 12 měsíců. Průchozí zálohy na služby se nezapočítávají.
          </p>
        </div>

        {series.every((s) => !s.prijmy && !s.vydaje) ? (
          <Card><Empty>Zatím žádné zaúčtované transakce.</Empty></Card>
        ) : (
          <>
            <StatGrid>
              <Stat label="Příjmy za 12 měsíců" value={czk(totalIncome)} />
              <Stat label="Výdaje za 12 měsíců" value={czk(totalExpense)} />
              <Stat label="Čistý tok" value={czk(net)} tone={net >= 0 ? "good" : "bad"}
                sub={`${czk(net / 12)} měsíčně`} />
              <Stat label="Nejsilnější / nejslabší měsíc"
                value={`${best?.period ?? "—"} / ${worst?.period ?? "—"}`}
                sub={best && worst ? `${czk(best.cisty)} vs ${czk(worst.cisty)}` : undefined} />
            </StatGrid>

            <Card title="Měsíční vývoj">
              <CashFlowChart data={series} />
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card title={`Struktura výdajů ${year}`}>
                {expenses.length ? <ExpenseBreakdownChart data={expenses} /> : <Empty>Žádné výdaje v roce {year}.</Empty>}
              </Card>

              <Card title="Poslední pohyby">
                <div className="max-h-96 overflow-y-auto">
                  <table className="table-base">
                    <thead><tr><th>Datum</th><th>Nemovitost</th><th>Kategorie</th><th className="num">Částka</th></tr></thead>
                    <tbody>
                      {recent.map((t) => (
                        <tr key={t.id}>
                          <td className="tabular-nums text-ink-secondary">{dateCz(t.date)}</td>
                          <td className="text-ink-secondary">{t.propertyName}</td>
                          <td>{categoryLabel(t.category)}</td>
                          <td className={`num font-medium ${t.amount >= 0 ? "text-good" : ""}`}>{czk(t.amount)}</td>
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
