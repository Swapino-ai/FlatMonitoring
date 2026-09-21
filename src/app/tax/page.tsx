import Link from "next/link";
import { page } from "@/lib/guard";
import { Nav } from "@/components/Nav";
import { Verze } from "@/components/Verze";
import { Card, Empty, Stat, StatGrid } from "@/components/Stat";
import { Napoveda } from "@/components/Napoveda";
import { loadProperties } from "@/lib/portfolio";
import { buildTaxReport } from "@/lib/taxReport";
import { czk, num, pct } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function TaxPage({ searchParams }: { searchParams: Promise<{ rok?: string }> }) {
  const user = await page();
  const { rok } = await searchParams;

  const currentYear = new Date().getFullYear();
  const year = Number(rok) || currentYear;
  const properties = await loadProperties();
  const report = buildTaxReport(properties, year);

  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);
  const { recommended, options, params } = report.computation;

  return (
    <>
      <Nav user={user} verze={<Verze />} />
      <main className="mx-auto max-w-[1400px] space-y-5 p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Podklad pro daňové přiznání {year}</h1>
            <p className="mt-1 text-sm text-ink-secondary">
              Příjmy z nájmu dle § 9 zákona o daních z příjmů — příloha č. 2 k přiznání k DPFO.
            </p>
          </div>
          <div className="flex gap-1 no-print">
            {years.map((y) => (
              <Link key={y} href={`/tax?rok=${y}`}
                className={`rounded-lg px-3 py-1.5 text-sm ${y === year ? "bg-accent text-white" : "border border-line text-ink-secondary hover:bg-surface-sunken"}`}>
                {y}
              </Link>
            ))}
          </div>
        </div>

        {report.incompleteYear && report.lines.length > 0 && (
          <p className="rounded-lg border border-warn/30 bg-warn/10 px-3 py-2.5 text-sm text-warn">
            Rok {year} ještě neskončil. Příjmy jsou zatím jen za uplynulou část roku, ale odpis se počítá celoroční —
            skutečný základ daně bude po prosinci vyšší. Jako definitivní podklad použij až uzavřený rok.
          </p>
        )}

        {report.lines.length === 0 ? (
          <Card><Empty>Za rok {year} nejsou evidovány žádné daňově relevantní pohyby.</Empty></Card>
        ) : (
          <>
            <StatGrid>
              <Stat label="Zdanitelné příjmy" value={czk(report.totals.rentalIncome)} sub="Nájemné bez záloh na služby" />
              <Stat term="pausal" label="Výhodnější varianta" value={recommended.method === "FLAT_RATE" ? "Paušál 30 %" : "Skutečné výdaje"}
                sub={`Uplatnitelné výdaje ${czk(recommended.expenses)}`} tone="good" />
              <Stat label="Základ daně" term="zakladDane" value={czk(recommended.taxBase)} sub={`Po slevě na poplatníka ${czk(recommended.credits)}`} />
              <Stat label="Daň k úhradě" value={czk(recommended.taxDue)}
                sub={`Efektivní sazba ${pct(recommended.effectiveRate)}`} tone={recommended.taxDue > 0 ? "warn" : "good"} />
            </StatGrid>

            <Card title="Porovnání obou variant">
              <div className="grid gap-4 md:grid-cols-2">
                {options.map((o) => {
                  const best = o.method === recommended.method;
                  return (
                    <div key={o.method} className={`rounded-card border p-4 ${best ? "border-good bg-good/5" : "border-line"}`}>
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-medium">{o.label}</h3>
                        {best && <span className="rounded bg-good/15 px-2 py-0.5 text-xs font-medium text-good">výhodnější</span>}
                      </div>
                      <table className="table-base mt-3">
                        <tbody>
                          <tr><td className="text-ink-secondary">Uplatněné výdaje</td><td className="num">{czk(o.expenses)}</td></tr>
                          <tr><td className="text-ink-secondary">Dílčí základ daně</td><td className="num">{czk(o.taxBase)}</td></tr>
                          <tr><td className="text-ink-secondary">Daň před slevami</td><td className="num">{czk(o.taxBeforeCredits)}</td></tr>
                          <tr><td className="text-ink-secondary">Sleva na poplatníka</td><td className="num">−{czk(o.credits)}</td></tr>
                          <tr><td className="font-medium">Daň k úhradě</td><td className="num font-semibold">{czk(o.taxDue)}</td></tr>
                        </tbody>
                      </table>
                      {o.note && <p className="mt-2.5 text-xs text-ink-muted">{o.note}</p>}
                    </div>
                  );
                })}
              </div>
              <p className="mt-4 rounded-lg bg-surface-sunken px-3 py-2.5 text-sm">
                Volbou <strong>{recommended.label.toLowerCase()}</strong> ušetříš{" "}
                <strong className="text-good">{czk(report.computation.savingVsAlternative)}</strong> oproti druhé variantě.
              </p>
            </Card>

            <Card title="Rozpis podle nemovitostí">
              <div className="table-scroll">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Nemovitost</th>
                      <th className="num">Příjmy z nájmu</th>
                      <th className="num">Provozní výdaje</th>
                      <th className="num"><Napoveda term="jistinaUroky">Úroky</Napoveda></th>
                      <th className="num"><Napoveda term="odpisy">Odpisy</Napoveda></th>
                      <th className="num">Dílčí výsledek</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.lines.map((l) => (
                      <tr key={l.id}>
                        <td className="font-medium">{l.name}</td>
                        <td className="num">{czk(l.rentalIncome)}</td>
                        <td className="num">{czk(l.deductibleExpenses)}</td>
                        <td className="num">{czk(l.loanInterest)}</td>
                        <td className="num">
                          {czk(l.depreciation)}
                          {l.depreciationOrdinal && <span className="ml-1 text-xs text-ink-muted">{l.depreciationOrdinal}. rok</span>}
                        </td>
                        <td className={`num font-medium ${l.result >= 0 ? "" : "text-bad"}`}>{czk(l.result)}</td>
                      </tr>
                    ))}
                    <tr className="bg-surface-sunken/60">
                      <td className="font-semibold">Celkem</td>
                      <td className="num font-semibold">{czk(report.totals.rentalIncome)}</td>
                      <td className="num font-semibold">{czk(report.totals.deductibleExpenses)}</td>
                      <td className="num font-semibold">{czk(report.totals.loanInterest)}</td>
                      <td className="num font-semibold">{czk(report.totals.depreciation)}</td>
                      <td className="num font-semibold">
                        {czk(report.totals.rentalIncome - report.totals.deductibleExpenses - report.totals.loanInterest - report.totals.depreciation)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {report.lines.some((l) => l.saleNote) && (
                <div className="mt-4 space-y-2">
                  {report.lines.filter((l) => l.saleNote).map((l) => (
                    <p key={l.id} className="rounded-lg bg-warn/10 px-3 py-2 text-sm text-warn">
                      <strong>{l.name}:</strong> {l.saleNote}
                    </p>
                  ))}
                </div>
              )}
            </Card>

            <Card title="Co vyplnit do přiznání">
              <ol className="list-inside list-decimal space-y-2 text-sm text-ink-secondary">
                <li>
                  Příloha č. 2, oddíl 2 — příjmy z nájmu dle § 9: <strong className="text-ink-primary">{czk(report.totals.rentalIncome)}</strong>
                </li>
                <li>
                  Výdaje {recommended.method === "FLAT_RATE" ? `paušálem ${params.flatRatePct} %` : "ve skutečné výši"}:{" "}
                  <strong className="text-ink-primary">{czk(recommended.expenses)}</strong>
                  {recommended.method === "FLAT_RATE" && ` (strop ${czk(params.flatRateExpenseCap)})`}
                </li>
                <li>
                  Dílčí základ daně dle § 9: <strong className="text-ink-primary">{czk(recommended.taxBase)}</strong>
                </li>
                <li>
                  Zálohy na služby ve výši {czk(report.totals.passThrough)} jsou průchozí položkou a do přiznání nevstupují,
                  pokud jsou řádně vyúčtovány.
                </li>
              </ol>
              <p className="mt-4 rounded-lg border border-line bg-surface-sunken px-3 py-2.5 text-xs text-ink-secondary">
                Aplikace počítá s progresivní sazbou {num(params.baseRate)} % do základu {czk(params.higherRateThreshold)} a{" "}
                {num(params.higherRate)} % nad ním. Výpočet vychází pouze z příjmů z nájmu — pokud máš i příjmy ze zaměstnání
                nebo podnikání, sečti dílčí základy a slevu na poplatníka uplatni jen jednou. Tohle je podklad, ne náhrada
                daňového poradce.
              </p>
            </Card>
          </>
        )}
      </main>
    </>
  );
}
