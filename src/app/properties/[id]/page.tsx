import Link from "next/link";
import { notFound } from "next/navigation";
import { page } from "@/lib/guard";
import { Nav } from "@/components/Nav";
import { Verze } from "@/components/Verze";
import { Badge, Card, Empty, Stat, StatGrid } from "@/components/Stat";
import { AmortizationChart } from "@/components/charts";
import { ValuationManager } from "@/components/ValuationManager";
import { Napoveda } from "@/components/Napoveda";
import { LoanManager } from "@/components/LoanManager";
import { LeaseManager } from "@/components/LeaseManager";
import { ServiceManager } from "@/components/ServiceManager";
import { TransactionManager } from "@/components/TransactionManager";
import { analyzeProperty, loadProperty } from "@/lib/portfolio";
import { amortizationSchedule, loanYearBreakdown } from "@/lib/finance";
import { depreciationInputPrice, depreciationSchedule } from "@/lib/tax";
import { categoryLabel, SERVICE_TYPES } from "@/lib/categories";
import { czk, czkCompact, dateCz, num, pct, STATUS_LABELS } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PropertyDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await page();
  const { id } = await params;
  const property = await loadProperty(id);
  if (!property) notFound();

  const a = analyzeProperty(property);
  const year = new Date().getFullYear();

  const activeLoans = property.loans.filter((l) => l.isActive);
  const amortByYear = activeLoans.length
    ? buildAmortization(activeLoans)
    : [];

  const depSchedule = depreciationSchedule({
    inputPrice: depreciationInputPrice(property),
    group: property.depreciationGroup,
    method: property.depreciationMethod as "STRAIGHT" | "ACCELERATED",
    startYear: property.depreciationStart ?? new Date(property.purchaseDate).getFullYear(),
  });

  const recentTx = [...property.transactions]
    .sort((x, y) => new Date(y.date).getTime() - new Date(x.date).getTime())
    .slice(0, 12);

  return (
    <>
      <Nav user={user} verze={<Verze />} />
      <main className="mx-auto max-w-[1400px] space-y-5 p-6">
        <div>
          <Link href="/properties" className="text-sm text-ink-muted hover:text-ink-primary">← Nemovitosti</Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{property.name}</h1>
            <Badge tone={property.status === "RENTED" ? "good" : property.status === "VACANT" ? "warn" : "neutral"}>
              {STATUS_LABELS[property.status]}
            </Badge>
          </div>
          <div className="mt-2 flex items-start justify-between gap-4">
          <p className="text-sm text-ink-secondary">
            {property.street}, {property.zip} {property.city}
            {property.district && ` · ${property.district}`} · {property.disposition} · {property.areaM2} m²
            {property.floor != null && ` · ${property.floor}. patro`}
            {property.buildYear && ` · rok ${property.buildYear}`}
          </p>
          {user.role === "OWNER" && (
            <Link href={`/properties/${property.id}/edit`} className="btn no-print shrink-0">Upravit</Link>
          )}
          </div>
        </div>

        <StatGrid>
          <Stat label="Tržní hodnota" value={czkCompact(a.currentValue)}
            sub={`${czk(a.currentValue / property.areaM2)}/m² · zdroj ${valuationSourceLabel(a.valuationSource)}`}
            tone={a.valueGain >= 0 ? "good" : "bad"} />
          <Stat label="Zhodnocení" value={`${a.valueGain >= 0 ? "+" : ""}${czkCompact(a.valueGain)}`}
            sub={`${pct(a.valueGainPct)} za ${a.yearsHeld.toFixed(1)} roku`}
            tone={a.valueGain >= 0 ? "good" : "bad"} />
          <Stat label="Čistý výnos" term="cistyVynos" value={pct(a.metrics.netYield)}
            sub={`Hrubý ${pct(a.metrics.grossYield)} · cap rate ${pct(a.metrics.capRate)}`} />
          <Stat label="IRR od pořízení" term="irr" value={a.irr != null ? pct(a.irr) : "—"}
            sub={a.estimatedYears.length ? `${a.estimatedYears.length} let odhadnuto z modelu` : "Ze skutečných toků"}
            tone={(a.irr ?? 0) >= 5 ? "good" : "neutral"} />
        </StatGrid>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="Pořizovací kalkulace">
            <table className="table-base">
              <tbody>
                <Row label="Kupní cena" value={czk(property.purchasePrice)} />
                <Row label="Vedlejší náklady pořízení" value={czk(property.acquisitionCosts)} />
                <Row label="Rekonstrukce" value={czk(property.renovationCosts)} />
                <Row label="Celková investice" value={czk(a.totalInvestment)} strong />
                <Row term="vstupniCena" label="Z toho podíl na pozemku" value={czk(property.landShareValue)} muted note="neodepisuje se" />
                <Row term="vlastniKapital" label="Vlastní vložený kapitál" value={czk(a.equityInvested)} />
                <Row label="Datum pořízení" value={dateCz(property.purchaseDate)} />
              </tbody>
            </table>
          </Card>

          <Card title="Dluh a zajištění">
            <LoanManager propertyId={property.id} loans={property.loans} canEdit={user.role === "OWNER"} />
            {activeLoans.length > 0 && (
              <div className="mt-4 border-t border-line pt-3">
                <table className="table-base">
                  <tbody>
                    <Row term="ltv" label="LTV" value={pct(a.metrics.ltv)} />
                    <Row term="dscr" label="DSCR" value={isFinite(a.metrics.dscr) ? num(a.metrics.dscr, 2) : "—"}
                      note={a.metrics.dscr < 1.2 ? "pod bankovním limitem 1,2" : "zdravé krytí"} />
                    <Row term="jistinaUroky" label={`Úroky ${year}`} value={czk(a.annualInterest)} note="daňově uznatelné" />
                  </tbody>
                </table>
                {a.fixationAlert && (
                  <p className="mt-2 rounded-lg bg-warn/10 px-2.5 py-1.5 text-xs text-warn">
                    Fixace u {a.fixationAlert.lender} končí za {Math.round(a.fixationAlert.monthsLeft)} měsíců — začni poptávat refinancování.
                  </p>
                )}
              </div>
            )}
          </Card>

          <Card title="Nájem a nájemci">
            <LeaseManager propertyId={property.id} leases={property.leases} canEdit={user.role === "OWNER"} />
            <div className="mt-4 border-t border-line pt-3">
              <table className="table-base">
                <tbody>
                  <Row label="Provozní náklady / rok" value={czk(a.annualOperatingExpenses)} />
                  <Row term="nakladovost" label="Nákladovost" value={pct(a.metrics.expenseRatio)} note="podíl na nájmu" />
                  <Row term="breakeven" label="Breakeven nájem" value={`${czk(a.metrics.breakevenRentMonthly)}/měs.`}
                    note="při něm je cash flow nulový" />
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {amortByYear.length > 0 && (
          <Card title="Umořování úvěru — kolik jde na jistinu a kolik bance">
            <AmortizationChart data={amortByYear} />
          </Card>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={`Odpisový plán — ${property.depreciationMethod === "STRAIGHT" ? "rovnoměrné" : "zrychlené"} odpisování, ${property.depreciationGroup}. skupina`}>
            <p className="mb-3 text-xs text-ink-secondary">
              Vstupní cena {czk(depreciationInputPrice(property))} (bez podílu na pozemku). Uplatňuje se jen při
              skutečných výdajích, ne při paušálu.
            </p>
            <div className="max-h-64 overflow-y-auto">
              <table className="table-base">
                <thead><tr><th>Rok</th><th className="num">Odpis</th><th className="num">Odepsáno</th><th className="num">Zůstatková cena</th></tr></thead>
                <tbody>
                  {depSchedule.slice(0, 12).map((r) => (
                    <tr key={r.year} className={r.year === year ? "bg-accent/5" : ""}>
                      <td>{r.year}{r.year === year && <span className="ml-1.5 text-xs text-accent">letos</span>}</td>
                      <td className="num">{czk(r.amount)}</td>
                      <td className="num text-ink-secondary">{czk(r.cumulative)}</td>
                      <td className="num text-ink-secondary">{czk(r.residual)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Ocenění" action={<Link href="/market" className="text-xs text-accent">Sken trhu →</Link>}>
            <ValuationManager
              propertyId={property.id}
              valuations={property.valuations}
              areaM2={property.areaM2}
              canEdit={user.role === "OWNER"}
            />
          </Card>

          <Card title="Služby a dodavatelé" action={<Link href="/savings" className="text-xs text-accent">Kde ušetřit →</Link>}>
            <ServiceManager propertyId={property.id} services={property.services} canEdit={user.role === "OWNER"} />
          </Card>
        </div>

        <Card title="Pohyby">
          <TransactionManager propertyId={property.id} transactions={recentTx} canEdit={user.role === "OWNER"} />
          {property.transactions.length > recentTx.length && (
            <p className="mt-3 text-xs text-ink-muted">
              Zobrazeno posledních {recentTx.length} z {property.transactions.length} pohybů.{" "}
              <Link href="/cashflow" className="text-accent">Všechny v Cash flow →</Link>
            </p>
          )}
        </Card>

        {property.notes && (
          <Card title="Poznámky"><p className="text-sm text-ink-secondary">{property.notes}</p></Card>
        )}
      </main>
    </>
  );
}

function Row({ label, value, strong, muted, note, term }: {
  label: string; value: React.ReactNode; strong?: boolean; muted?: boolean; note?: string; term?: string;
}) {
  return (
    <tr>
      <td className={`${muted ? "text-ink-muted" : "text-ink-secondary"}`}>
        {term ? <Napoveda term={term}>{label}</Napoveda> : label}
        {note && <span className="ml-1.5 text-xs text-ink-muted">({note})</span>}
      </td>
      <td className={`num ${strong ? "font-semibold" : ""}`}>{value}</td>
    </tr>
  );
}

function valuationSourceLabel(s: string): string {
  return { MANUAL: "ruční", EXPERT: "znalec", MARKET_SCAN: "sken trhu", INDEX: "index", PURCHASE_PRICE: "pořizovací cena" }[s] ?? s;
}

function buildAmortization(loans: { principal: number; interestRate: number; termMonths: number; startDate: Date; monthlyPayment: number }[]) {
  const byYear = new Map<number, { jistina: number; uroky: number; zustatek: number }>();

  for (const l of loans) {
    const rows = amortizationSchedule(l.principal, l.interestRate, l.termMonths, new Date(l.startDate), l.monthlyPayment);
    for (const r of rows) {
      const y = r.date.getFullYear();
      const cur = byYear.get(y) ?? { jistina: 0, uroky: 0, zustatek: 0 };
      cur.jistina += r.principal;
      cur.uroky += r.interest;
      cur.zustatek = r.balance;
      byYear.set(y, cur);
    }
  }

  return [...byYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rok, v]) => ({ rok, jistina: Math.round(v.jistina), uroky: Math.round(v.uroky), zustatek: Math.round(v.zustatek) }));
}
