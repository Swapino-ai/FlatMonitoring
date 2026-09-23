import { page } from "@/lib/guard";
import { Nav } from "@/components/Nav";
import { Verze } from "@/components/Verze";
import { Badge, Card, Empty, Stat, StatGrid } from "@/components/Stat";
import { Napoveda } from "@/components/Napoveda";
import { MarketComparisonChart } from "@/components/charts";
import { ScanButton } from "@/components/ScanButton";
import { prisma } from "@/lib/db";
import { analyzeProperty, loadProperties } from "@/lib/portfolio";
import { comparableStats } from "@/lib/market";
import { czk, czkCompact, dateCz, pct } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function MarketPage() {
  const user = await page();
  const properties = await loadProperties();
  const analyses = properties.filter((p) => p.status !== "SOLD").map((p) => analyzeProperty(p));

  const lastScans = await prisma.marketScan.findMany({
    orderBy: { runAt: "desc" },
    take: 6,
    include: { _count: { select: { listings: true } } },
  });

  const rows = await Promise.all(
    analyses.map(async (a) => {
      const p = a.property;
      const spolecne = {
        city: p.city, district: p.district, category: p.type,
        latitude: p.latitude, longitude: p.longitude,
        areaM2: p.areaM2, disposition: p.disposition,
      };
      const sale = await comparableStats({ ...spolecne, dealType: "SALE" as const });
      const rent = await comparableStats({ ...spolecne, dealType: "RENT" as const });

      const myPricePerM2 = a.totalInvestment / p.areaM2;
      const myRentPerM2 = a.monthlyRent / p.areaM2;

      return {
        id: p.id,
        name: p.name,
        city: p.city,
        areaM2: p.areaM2,
        myPricePerM2,
        myValuePerM2: a.currentValue / p.areaM2,
        marketPricePerM2: sale?.medianPricePerM2 ?? null,
        marketSample: sale?.count ?? 0,
        myRent: a.monthlyRent,
        myRentPerM2,
        marketRentPerM2: rent?.medianPricePerM2 ?? null,
        rentSample: rent?.count ?? 0,
        lastValuation: p.valuations[0] ?? null,
      };
    }),
  );

  const chartData = rows
    .filter((r) => r.marketPricePerM2 != null)
    .map((r) => ({ name: r.name, tvoje: Math.round(r.myPricePerM2), trh: Math.round(r.marketPricePerM2!) }));

  const lastScanAt = lastScans[0]?.runAt;
  const totalListings = lastScans.reduce((a, s) => a + s._count.listings, 0);

  return (
    <>
      <Nav user={user} verze={<Verze />} />
      <main className="mx-auto max-w-[1400px] space-y-5 p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Porovnání s trhem</h1>
            <p className="mt-1 text-sm text-ink-secondary">
              Měsíční sken nabídek ze Sreality a Bezrealitek. Jde o <strong>nabídkové</strong> ceny — realizované bývají o
              5–10 % nižší.
            </p>
          </div>
          {user.role === "OWNER" && <ScanButton disabled={properties.length === 0} />}
        </div>

        <StatGrid>
          <Stat label="Poslední sken" value={lastScanAt ? dateCz(lastScanAt) : "nikdy"}
            sub={lastScanAt ? `${totalListings} nabídek v posledních bězích` : "Spusť sken nebo nastav měsíční cron"} />
          <Stat label="Hodnota portfolia" value={czkCompact(analyses.reduce((a, x) => a + x.currentValue, 0))} />
          <Stat label="Pořízeno za" value={czkCompact(analyses.reduce((a, x) => a + x.totalInvestment, 0))} />
          <Stat label="Nerealizovaný zisk"
            value={czkCompact(analyses.reduce((a, x) => a + x.valueGain, 0))}
            tone={analyses.reduce((a, x) => a + x.valueGain, 0) >= 0 ? "good" : "bad"} />
        </StatGrid>

        {chartData.length > 0 && (
          <Card title="Tvoje pořizovací cena proti mediánu trhu (Kč/m²)">
            <MarketComparisonChart data={chartData} />
          </Card>
        )}

        <Card title="Srovnání po nemovitostech">
          <div className="table-scroll">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Nemovitost</th>
                  <th className="num">Pořízeno Kč/m²</th>
                  <th className="num">Aktuální odhad Kč/m²</th>
                  <th className="num"><Napoveda term="medianTrhu">Medián trhu Kč/m²</Napoveda></th>
                  <th className="num">Nájem Kč/m²</th>
                  <th className="num">Nájem trh Kč/m²</th>
                  <th><Napoveda term="vzorekNabidek">Vzorek</Napoveda></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const rentGap = r.marketRentPerM2 ? ((r.myRentPerM2 - r.marketRentPerM2) / r.marketRentPerM2) * 100 : null;
                  return (
                    <tr key={r.id}>
                      <td className="font-medium">{r.name}<div className="text-xs text-ink-muted">{r.city} · {r.areaM2} m²</div></td>
                      <td className="num">{czk(r.myPricePerM2)}</td>
                      <td className="num">{czk(r.myValuePerM2)}</td>
                      <td className="num">{r.marketPricePerM2 ? czk(r.marketPricePerM2) : <span className="text-ink-muted">—</span>}</td>
                      <td className="num">{r.myRent ? czk(r.myRentPerM2) : <span className="text-ink-muted">—</span>}</td>
                      <td className="num">
                        {r.marketRentPerM2 ? (
                          <>
                            {czk(r.marketRentPerM2)}
                            {rentGap != null && Math.abs(rentGap) > 5 && (
                              <div className={`text-xs ${rentGap < 0 ? "text-warn" : "text-good"}`}>
                                {rentGap < 0 ? `podnajímáš o ${pct(Math.abs(rentGap), 0)}` : `nad trhem o ${pct(rentGap, 0)}`}
                              </div>
                            )}
                          </>
                        ) : <span className="text-ink-muted">—</span>}
                      </td>
                      <td>
                        {r.marketSample >= 3 ? (
                          <Badge tone={r.marketSample >= 15 ? "good" : r.marketSample >= 7 ? "neutral" : "warn"}>
                            {r.marketSample} nabídek
                          </Badge>
                        ) : (
                          <span className="text-xs text-ink-muted">málo dat</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-ink-muted">
            Odhad se počítá jako medián ceny za m² u srovnatelných bytů (stejné město, dispozice, plocha ±25 %) za posledních
            60 dní. Při méně než 3 nabídkách se odhad nepočítá — raději žádné číslo než nedůvěryhodné.
          </p>
        </Card>

        <Card title="Historie skenů">
          {lastScans.length === 0 ? (
            <Empty>Sken ještě neproběhl. Spusť ho ručně, nebo nastav měsíční cron podle README.</Empty>
          ) : (
            <div className="table-scroll">
            <table className="table-base">
              <thead><tr><th>Kdy</th><th>Zdroj</th><th>Stav</th><th className="num">Nabídek</th><th>Poznámka</th></tr></thead>
              <tbody>
                {lastScans.map((s) => (
                  <tr key={s.id}>
                    <td className="tabular-nums text-ink-secondary">{dateCz(s.runAt)}</td>
                    <td>{s.source}</td>
                    <td>
                      <Badge tone={s.status === "OK" ? "good" : s.status === "PARTIAL" ? "warn" : "bad"}>{s.status}</Badge>
                    </td>
                    <td className="num">{s._count.listings}</td>
                    <td className="max-w-md truncate text-xs text-ink-muted" title={s.message ?? ""}>{s.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </Card>
      </main>
    </>
  );
}
