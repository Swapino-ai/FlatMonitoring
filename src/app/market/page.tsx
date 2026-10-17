import { page } from "@/lib/guard";
import { Nav } from "@/components/Nav";
import { Verze } from "@/components/Verze";
import { Badge, Card, Empty, Stat, StatGrid } from "@/components/Stat";
import { Napoveda } from "@/components/Napoveda";
import { MarketComparisonChart } from "@/components/charts";
import { ScanButton } from "@/components/ScanButton";
import { prisma } from "@/lib/db";
import { analyzeProperty, loadProperties } from "@/lib/portfolio";
import Link from "next/link";
import { cenaVJednotce, jednotkaOdhadu, odhadNaM2, odhadZeZarazenych, vahaZarazeni } from "@/lib/market/zarazeni";
import { OKNO_ODHADU } from "@/lib/market/inzeraty";
import { denISO } from "@/lib/format";
import { czk, czkCompact, dateCz, pct } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function MarketPage() {
  const user = await page();
  const properties = await loadProperties();
  const analyses = properties.filter((p) => p.status !== "SOLD").map((p) => analyzeProperty(p));

  // Posledni behy skenu z deniku
  const lastScans = await prisma.scanRun.findMany({ orderBy: { startedAt: "desc" }, take: 8 });
  // Novy system: zarazene a navrzene nabidky po nemovitostech
  const zarazeni = await prisma.zarazeniInzeratu.findMany({
    where: { stav: { in: ["ZARAZENO", "NAVRH"] } },
    include: { inzerat: { select: { dealType: true, price: true, pricePerM2: true, firstSeenAt: true, areaM2: true, city: true, latitude: true, longitude: true, parametry: true } } },
  });

  const rows = analyses.map((a) => {
    const p = a.property;
    const moje = zarazeni.filter((z) => z.propertyId === (p.oceneniPodle ?? p.id));
    // Garaze za kus, ostatni za m²; vysledek vzdy prevedeny na Kc/m²
    const { zaKus, plocha } = jednotkaOdhadu(p.type, p.areaM2);
    const odhad = (d: "SALE" | "RENT") => odhadNaM2(odhadZeZarazenych(
      moje.filter((z) => z.stav === "ZARAZENO" && z.inzerat.dealType === d)
        .map((z) => ({ datum: denISO(z.inzerat.firstSeenAt), pricePerM2: cenaVJednotce(z.inzerat, zaKus), vaha: vahaZarazeni(p, z, z.inzerat) })),
      plocha, OKNO_ODHADU,
    ), zaKus, p.areaM2);
    const sale = odhad("SALE");
    const rent = odhad("RENT");
    return {
      id: p.id,
      name: p.name,
      city: p.city,
      areaM2: p.areaM2,
      sledovat: p.sledovatTrh,
      navrhuProdej: moje.filter((z) => z.stav === "NAVRH" && z.inzerat.dealType === "SALE").length,
      navrhuNajem: moje.filter((z) => z.stav === "NAVRH" && z.inzerat.dealType === "RENT").length,
      myPricePerM2: a.totalInvestment / p.areaM2,
      myValuePerM2: a.currentValue / p.areaM2,
      marketPricePerM2: sale?.perM2 ?? null,
      marketMedianPerM2: sale?.median.perM2 ?? null,
      marketSample: sale?.pocet ?? 0,
      myRent: a.monthlyRent,
      myRentPerM2: a.monthlyRent / p.areaM2,
      marketRentPerM2: rent?.perM2 ?? null,
      rentMedianPerM2: rent?.median.perM2 ?? null,
      rentSample: rent?.pocet ?? 0,
    };
  });

  const chartData = rows
    .filter((r) => r.marketPricePerM2 != null)
    .map((r) => ({ name: r.name, tvoje: Math.round(r.myPricePerM2), trh: Math.round(r.marketPricePerM2!) }));

  const lastScanAt = lastScans[0]?.startedAt;
  const totalListings = lastScans.reduce((a, s) => a + s.listingsFound, 0);

  return (
    <>
      <Nav user={user} verze={<Verze />} />
      <main className="mx-auto max-w-[1400px] space-y-5 p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Porovnání s trhem</h1>
            <p className="mt-1 text-sm text-ink-secondary">
              Odhady z nabídek ze Sreality, které jsi u nemovitosti zařadil (vážený průměr z nabídek za poslední 2 měsíce). Jde o <strong>nabídkové</strong> ceny —
              realizované bývají o 5–10 % nižší. Kliknutím na nemovitost otevřeš její ocenění a trh.
            </p>
          </div>
          {user.role === "OWNER" && <ScanButton disabled={properties.length === 0} />}
        </div>

        <StatGrid>
          <Stat label="Poslední sken" value={lastScanAt ? dateCz(lastScanAt) : "nikdy"}
            sub={lastScanAt ? `${totalListings} nabídek v posledních bězích` : "Zapni u nemovitosti Sledovat trh"} />
          <Stat label="Hodnota portfolia" value={czkCompact(analyses.reduce((a, x) => a + x.currentValue, 0))} />
          <Stat label="Pořízeno za" value={czkCompact(analyses.reduce((a, x) => a + x.totalInvestment, 0))} />
          <Stat label="Nerealizovaný zisk"
            value={czkCompact(analyses.reduce((a, x) => a + x.valueGain, 0))}
            tone={analyses.reduce((a, x) => a + x.valueGain, 0) >= 0 ? "good" : "bad"} />
        </StatGrid>

        {chartData.length > 0 && (
          <Card title="Tvoje pořizovací cena proti trhu (Kč/m²)">
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
                  <th className="num"><Napoveda term="medianTrhu">Trh Kč/m²</Napoveda></th>
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
                      <td className="font-medium">
                        <Link href={`/properties/${r.id}/trh${r.navrhuProdej === 0 && r.navrhuNajem > 0 ? "?typ=RENT" : ""}`} className="text-accent hover:underline">{r.name}</Link>
                        <div className="text-xs text-ink-muted">
                          {r.city} · {r.areaM2} m²
                          {!r.sledovat && " · trh se nesleduje"}
                          {r.navrhuProdej + r.navrhuNajem > 0 && (
                            <span className="ml-1 font-medium text-accent">
                              · ke kontrole {[r.navrhuProdej > 0 && `${r.navrhuProdej} prodej`, r.navrhuNajem > 0 && `${r.navrhuNajem} nájem`].filter(Boolean).join(" + ")}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="num">{czk(r.myPricePerM2)}</td>
                      <td className="num">{czk(r.myValuePerM2)}</td>
                      <td className="num">
                        {r.marketPricePerM2 ? (
                          <>
                            {czk(r.marketPricePerM2)}
                            {r.marketMedianPerM2 != null && <div className="text-xs text-ink-muted">medián {czk(r.marketMedianPerM2)}</div>}
                          </>
                        ) : <span className="text-ink-muted">—</span>}
                      </td>
                      <td className="num">{r.myRent ? czk(r.myRentPerM2) : <span className="text-ink-muted">—</span>}</td>
                      <td className="num">
                        {r.marketRentPerM2 ? (
                          <>
                            {czk(r.marketRentPerM2)}
                            {r.rentMedianPerM2 != null && <div className="text-xs text-ink-muted">medián {czk(r.rentMedianPerM2)}</div>}
                            {rentGap != null && Math.abs(rentGap) > 5 && (
                              <div className={`text-xs ${rentGap < 0 ? "text-warn" : "text-good"}`}>
                                {rentGap < 0 ? `podnajímáš o ${pct(Math.abs(rentGap), 0)}` : `nad trhem o ${pct(rentGap, 0)}`}
                              </div>
                            )}
                          </>
                        ) : <span className="text-ink-muted">—</span>}
                      </td>
                      <td>
                        <Link href={`/properties/${r.id}/trh`} className="inline-flex items-center gap-1.5">
                          {r.marketSample > 0 || r.rentSample > 0 ? (
                            <Badge tone={r.marketSample >= 7 ? "good" : r.marketSample >= 3 ? "neutral" : "warn"}>
                              {r.marketSample} prodej · {r.rentSample} nájem
                            </Badge>
                          ) : (
                            <span className="text-xs text-ink-muted">nic zařazeno</span>
                          )}
                          <span className="text-xs text-accent">Ocenění →</span>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-ink-muted">
            Trh = vážený průměr (pod ním vážený medián) ceny za m² z nabídek zařazených u nemovitosti, které se objevily za poslední 2 měsíce. Vzorek ukazuje, z kolika zařazených
            nabídek číslo vzniklo.
          </p>
        </Card>

        <Card title="Poslední běhy skenu">
          {lastScans.length === 0 ? (
            <Empty>Sken ještě neproběhl. Zapni u nemovitosti „Sledovat trh“ a spusť sken.</Empty>
          ) : (
            <div className="table-scroll">
            <table className="table-base">
              <thead><tr><th>Kdy</th><th>Nemovitost</th><th>Typ</th><th>Stav</th><th className="num">Nabídek</th><th>Výsledek</th></tr></thead>
              <tbody>
                {lastScans.map((s) => (
                  <tr key={s.id}>
                    <td className="tabular-nums text-ink-secondary">{dateCz(s.startedAt)}</td>
                    <td>{s.propertyId ? <Link href={`/properties/${s.propertyId}/trh`} className="text-accent hover:underline">{s.propertyName}</Link> : s.propertyName}</td>
                    <td>{s.dealType === "SALE" ? "prodej" : "nájem"}</td>
                    <td><Badge tone={s.status === "OK" ? "good" : s.status === "SELHALO" ? "bad" : "warn"}>{s.status}</Badge></td>
                    <td className="num">{s.listingsFound}</td>
                    <td className="max-w-md truncate text-xs text-ink-muted" title={s.message ?? s.result ?? ""}>{s.message ?? s.result}</td>
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
