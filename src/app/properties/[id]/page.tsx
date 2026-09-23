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
import { RentHistory } from "@/components/RentHistory";
import { RentScanButton } from "@/components/RentScanButton";
import { Mapa } from "@/components/Mapa";
import { ServiceManager } from "@/components/ServiceManager";
import { TransactionManager } from "@/components/TransactionManager";
import { analyzeProperty, loadProperty } from "@/lib/portfolio";
import { nasobitel, podilUzivatele } from "@/lib/ownership";
import { aktualniPohled } from "@/lib/ownership.server";
import { prisma } from "@/lib/db";
import { OwnerManager } from "@/components/OwnerManager";
import { PohledPrepinac } from "@/components/PohledPrepinac";
import { amortizationSchedule, loanYearBreakdown } from "@/lib/finance";
import { depreciationInputPrice, depreciationSchedule } from "@/lib/tax";
import { categoryLabel, SERVICE_TYPES } from "@/lib/categories";
import { czk, czkCompact, dateCz, num, pct, STATUS_LABELS } from "@/lib/format";
import { NEMOVITOST_MAP, nazevNemovitosti } from "@/lib/catalogs";
import { okruhProTyp } from "@/lib/geo";

export const dynamic = "force-dynamic";

export default async function PropertyDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await page();
  const { id } = await params;
  const property = await loadProperty(id);
  if (!property) notFound();

  const pohled = await aktualniPohled();
  const podil = nasobitel(pohled, property.owners, user.id);
  const a = analyzeProperty(property, new Date(), podil);
  const year = new Date().getFullYear();

  const uzivatele = user.role === "OWNER"
    ? await prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, email: true } })
    : [];
  const mujPodil = podilUzivatele(property.owners, user.id);

  const activeLoans = property.loans.filter((l) => l.isActive);
  const amortByYear = activeLoans.length
    ? buildAmortization(activeLoans)
    : [];

  const lzeOdepisovat = NEMOVITOST_MAP.get(property.type)?.odpisovaSkupina !== null;
  const depSchedule = !lzeOdepisovat ? [] : depreciationSchedule({
    inputPrice: depreciationInputPrice(property),
    group: property.depreciationGroup,
    method: property.depreciationMethod as "STRAIGHT" | "ACCELERATED",
    startYear: property.depreciationStart ?? new Date(property.purchaseDate).getFullYear(),
  });

  // Když ocenění chybí, chceme umět říct proč — hádat "asi málo nabídek" je
  // k ničemu, když skutečná příčina je chybějící poloha nebo kraj.
  const duvodBezOceneni = property.valuations.length > 0 ? null : await (async () => {
    const maPolohu = property.latitude != null && property.longitude != null;
    if (!NEMOVITOST_MAP.get(property.type)?.srealityCesta) {
      return `Tenhle druh nemovitosti se na Sreality neskenuje — hodnotu zadej ručně.`;
    }
    const od = new Date();
    od.setDate(od.getDate() - 60);
    const vObci = await prisma.marketListing.count({
      where: { dealType: "SALE", category: property.type, scrapedAt: { gte: od }, city: property.city },
    });
    const vKraji = property.region
      ? await prisma.marketListing.count({
          where: { dealType: "SALE", category: property.type, scrapedAt: { gte: od }, region: property.region },
        })
      : 0;

    if (vObci + vKraji === 0) {
      return "Sken zatím pro tenhle druh nemovitosti nic nenašel. Spusť sken trhu, nebo zadej hodnotu ručně.";
    }
    if (!maPolohu && !property.region) {
      return `Nabídky v databázi jsou (${vObci + vKraji}), ale nejde je spárovat: nemovitost nemá uloženou polohu ani kraj. `
        + "Otevři úpravy, vyber adresu z našeptávače — doplní se obojí.";
    }
    if (!maPolohu && vKraji > 0 && vObci === 0) {
      return `Nabídky jsou jen z okolí kraje (${vKraji}), ne přímo z obce. Bez souřadnic je k nemovitosti nepřiřadíme — `
        + "vyber adresu z našeptávače a spusť sken znovu.";
    }
    return `V okolí je ${vObci + vKraji} nabídek, ale po zúžení na srovnatelnou plochu a dispozici jich zbylo míň než tři. `
      + "Odhad z toho nedělám — radši žádný než klamavý.";
  })();

  // Odhady najmu z nocniho skenu — vlastni dotaz, at je loadProperty lehky
  const odhadyNajmu = await prisma.rentEstimate.findMany({
    where: { propertyId: property.id },
    orderBy: { date: "desc" },
    take: 60,
  });
  // Proti trhu porovnavame cely najem, ne jen podil prihlaseneho vlastnika
  const smluvniNajem = property.leases.find((l) => l.isActive)?.rentMonthly ?? 0;

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
            {property.district && ` · ${property.district}`} · {nazevNemovitosti(property.type)}
            {property.disposition && ` · ${property.disposition}`} · {property.areaM2} m²
            {property.floor != null && ` · ${property.floor}. patro`}
            {property.buildYear && ` · rok ${property.buildYear}`}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            {property.owners.some((o) => o.share < 100) && <PohledPrepinac pohled={pohled} />}
            {user.role === "OWNER" && (
              <Link href={`/properties/${property.id}/edit`} className="btn no-print">Upravit</Link>
            )}
          </div>
          </div>
        </div>

        {/* Klíčová čísla a poloha vedle sebe — dlaždice roztažené přes celou
            šířku působí prázdně a mapa patří k adrese, ne až pod finance. */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
          <div className="grid grid-cols-2 gap-3 content-start">
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
          </div>

          <Card title="Poloha" action={
            property.latitude != null && property.longitude != null ? (
              <a href={`https://mapy.cz/zakladni?x=${property.longitude}&y=${property.latitude}&z=17`}
                target="_blank" rel="noreferrer noopener" className="text-xs text-accent">Otevřít v Mapy.cz →</a>
            ) : user.role === "OWNER" ? (
              <Link href={`/properties/${property.id}/edit`} className="text-xs text-accent">Doplnit adresu →</Link>
            ) : null
          }>
            {property.latitude != null && property.longitude != null ? (
              <>
                <Mapa latitude={property.latitude} longitude={property.longitude} vyskaTrida="h-48 lg:h-56" />
                <p className="mt-2 text-xs text-ink-muted">
                  Podle téhle polohy se hledá srovnání — od {okruhProTyp(property.type)} km dál,
                  dokud není dost nabídek.
                </p>
              </>
            ) : (
              <p className="rounded-lg bg-surface-sunken px-3 py-2.5 text-sm text-ink-secondary">
                Nemovitost nemá uloženou polohu — byla založená dřív, než přibyl našeptávač adres.
                Otevři úpravy, vyber adresu z našeptávače a srovnání se pak bude hledat
                podle vzdálenosti místo podle názvu čtvrti.
              </p>
            )}
          </Card>
        </div>

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

          <Card title="Spoluvlastníci">
            <OwnerManager
              propertyId={property.id}
              owners={property.owners}
              uzivatele={uzivatele}
              canEdit={user.role === "OWNER"}
            />
            {mujPodil < 1 && (
              <p className="mt-3 rounded-lg bg-surface-sunken px-3 py-2 text-xs text-ink-secondary">
                Tvůj podíl je {Math.round(mujPodil * 1000) / 10} %. V pohledu
                <strong> Můj podíl</strong> se všechny částky krátí na tuhle část; poměrové ukazatele
                jako výnos nebo LTV zůstávají stejné.
              </p>
            )}
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

        <Card title="Tržní nájem — noční sken trhu"
          action={<Link href="/market" className="text-xs text-accent">Sken trhu →</Link>}>
          <RentHistory odhady={odhadyNajmu} smluvniNajem={smluvniNajem} areaM2={property.areaM2} />
          {user.role === "OWNER" && <RentScanButton propertyId={property.id} />}
        </Card>

        {amortByYear.length > 0 && (
          <Card title="Umořování úvěru — kolik jde na jistinu a kolik bance">
            <AmortizationChart data={amortByYear} />
          </Card>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={lzeOdepisovat
            ? `Odpisový plán — ${property.depreciationMethod === "STRAIGHT" ? "rovnoměrné" : "zrychlené"} odpisování, ${property.depreciationGroup}. skupina`
            : "Odpisy"}>
            {!lzeOdepisovat && (
              <p className="rounded-lg bg-surface-sunken px-3 py-2.5 text-sm text-ink-secondary">
                {NEMOVITOST_MAP.get(property.type)?.upozorneni
                  ?? "Tenhle druh nemovitosti se neodepisuje."}
              </p>
            )}
            {lzeOdepisovat && (<>
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
            </>)}
          </Card>

          <Card title="Ocenění" action={<Link href="/market" className="text-xs text-accent">Sken trhu →</Link>}>
            <ValuationManager
              propertyId={property.id}
              valuations={property.valuations}
              areaM2={property.areaM2}
              canEdit={user.role === "OWNER"}
            />
            {duvodBezOceneni && (
              <p className="mt-3 rounded-lg bg-warn/10 px-3 py-2.5 text-sm text-warn">{duvodBezOceneni}</p>
            )}
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
