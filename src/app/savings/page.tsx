import { page } from "@/lib/guard";
import { Nav } from "@/components/Nav";
import { Verze } from "@/components/Verze";
import { Badge, Card, Empty, Stat, StatGrid } from "@/components/Stat";
import { Napoveda } from "@/components/Napoveda";
import { nactiPortfolio } from "@/lib/pohled";
import { findBundleOpportunities, summarizeSavings } from "@/lib/savings";
import { czk, dateCz, pct } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SavingsPage() {
  const user = await page();
  const { properties } = await nactiPortfolio(user);
  const opportunities = findBundleOpportunities(properties);
  const s = summarizeSavings(opportunities);

  return (
    <>
      <Nav user={user} verze={<Verze />} />
      <main className="mx-auto max-w-[1400px] space-y-5 p-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Kde ušetřit</h1>
          <p className="mt-1 text-sm text-ink-secondary">
            Sjednocení dodavatelů napříč byty a hromadná poptávka jako jeden kontrakt.
          </p>
        </div>

        {opportunities.length === 0 ? (
          <Card><Empty>Zatím nejsou evidovány služby, ze kterých by šlo počítat úspory.</Empty></Card>
        ) : (
          <>
            <StatGrid>
              <Stat label="Roční náklady na služby" value={czk(s.totalAnnualServiceCost)} />
              <Stat label="Identifikovaná úspora" value={czk(s.totalIdentifiedSaving)} tone="good"
                sub={`${pct(s.savingPct, 0)} současných nákladů`} />
              <Stat label="Měsíčně" value={czk(s.totalIdentifiedSaving / 12)} tone="good" />
              <Stat label="Největší prostor" value={s.topOpportunity?.typeLabel ?? "—"}
                sub={s.topOpportunity ? `${czk(s.topOpportunity.totalSavingAnnual)} / rok` : undefined} />
            </StatGrid>

            <div className="space-y-4">
              {opportunities.map((o) => (
                <Card key={o.type} title={o.typeLabel}
                  action={
                    <span className={`text-sm font-semibold tabular-nums ${o.totalSavingAnnual > 0 ? "text-good" : "text-ink-muted"}`}>
                      {o.totalSavingAnnual > 0 ? `úspora až ${czk(o.totalSavingAnnual)}/rok` : "bez zjištěného prostoru"}
                    </span>
                  }>
                  <div className="grid gap-5 lg:grid-cols-3">
                    <div className="lg:col-span-2 space-y-3">
                      <p className="text-sm text-ink-secondary">{o.recommendation}</p>

                      <table className="table-base">
                        <thead>
                          <tr><th>Dodavatel</th><th className="num">Jednotek</th><th className="num">Průměr / měs.</th></tr>
                        </thead>
                        <tbody>
                          {o.providers.map((p) => (
                            <tr key={p.name}>
                              <td>
                                {p.name}
                                {p.avgMonthly <= o.bestUnitMonthly * 1.02 && (
                                  <span className="ml-2"><Badge tone="good">nejlepší cena</Badge></span>
                                )}
                              </td>
                              <td className="num">{p.count}</td>
                              <td className="num">{czk(p.avgMonthly)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {o.lockedUntil.length > 0 && (
                        <div className="rounded-lg bg-surface-sunken px-3 py-2.5 text-xs">
                          <span className="font-medium">Vázáno smlouvou:</span>{" "}
                          {o.lockedUntil.map((l) => `${l.property} do ${dateCz(l.until)}`).join(" · ")}
                        </div>
                      )}
                    </div>

                    <div className="space-y-2.5 rounded-card bg-surface-sunken p-4 text-sm">
                      <Line label="Dnes platíš ročně" value={czk(o.totalAnnual)} />
                      <Line label={<Napoveda term="sjednoceni">Sjednocením na nejlepší cenu</Napoveda>} value={czk(o.levelDownSavingAnnual)} tone="good" />
                      <Line label={<Napoveda term="objemovaSleva">Objemovou slevou navíc</Napoveda>} value={czk(o.bundleSavingAnnual)} tone="good" />
                      <div className="border-t border-line pt-2.5">
                        <Line label="Celkem úspora" value={czk(o.totalSavingAnnual)} tone="good" strong />
                      </div>
                      <p className="pt-1 text-xs text-ink-muted">
                        {o.negotiableNow} z {o.propertyCount} jednotek lze přesmluvnit hned.
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            <Card title="Jak s tím jednat">
              <ol className="list-inside list-decimal space-y-1.5 text-sm text-ink-secondary">
                <li>Sesbírej smlouvy a poslední vyúčtování za všechny jednotky do jednoho balíku.</li>
                <li>Poptávku pošli jako jeden kontrakt na celý objem — ne jako {opportunities[0]?.propertyCount ?? "několik"} samostatných.</li>
                <li>Nabídku konkurence použij jako páku u stávajícího dodavatele; přechod stojí čas, sleva ne.</li>
                <li>Jednotky vázané smlouvou zařaď do balíku s odloženou účinností k datu, kdy vazba končí.</li>
                <li>Odhad objemové slevy je vyjednávací výchozí bod, ne příslib — výsledek zapiš zpět do evidence služeb.</li>
              </ol>
            </Card>
          </>
        )}
      </main>
    </>
  );
}

function Line({ label, value, tone, strong }: { label: React.ReactNode; value: string; tone?: "good"; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-ink-secondary">{label}</span>
      <span className={`tabular-nums ${tone === "good" ? "text-good" : "text-ink-primary"} ${strong ? "font-semibold" : ""}`}>{value}</span>
    </div>
  );
}
