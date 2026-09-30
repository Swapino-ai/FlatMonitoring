import Link from "next/link";
import { notFound } from "next/navigation";
import { page } from "@/lib/guard";
import { srovnejPlatnost } from "@/lib/platnost";
import { Nav } from "@/components/Nav";
import { Verze } from "@/components/Verze";
import { Badge, Card, Empty, Stat, StatGrid } from "@/components/Stat";
import { AmortizationChart } from "@/components/charts";
import { Napoveda } from "@/components/Napoveda";
import { LoanManager } from "@/components/LoanManager";
import { LeaseManager } from "@/components/LeaseManager";
import { Mapa } from "@/components/Mapa";
import { Hero, Kondice, type Kontrola } from "@/components/Kondice";
import { ServiceManager } from "@/components/ServiceManager";
import { TransactionManager } from "@/components/TransactionManager";
import { analyzeProperty, loadProperty } from "@/lib/portfolio";
import { nasobitel, podilUzivatele } from "@/lib/ownership";
import { aktualniPohled } from "@/lib/ownership.server";
import { prisma } from "@/lib/db";
import { OwnerManager } from "@/components/OwnerManager";
import { Listy } from "@/components/Listy";
import { SbalitelnaKarta } from "@/components/SbalitelnaKarta";
import { KatastrKarta, type JednotkaVolba } from "@/components/KatastrKarta";
import { UrcitPolohu } from "@/components/UrcitPolohu";
import { ZalohyVCase } from "@/components/ZalohyVCase";
import { casovaOsa, porovnejProNemovitost, type NajemVstup, type SluzbaVstup } from "@/lib/zalohy";
import { VyuctovaniNajemce, VyuctovaniSluzeb, type NajemRadek, type VyuctovaniRadek } from "@/components/Vyuctovani";
import type { SluzbaVyuctovani } from "@/lib/vyuctovani";
import { PohledPrepinac } from "@/components/PohledPrepinac";
import { amortizationSchedule, loanYearBreakdown } from "@/lib/finance";
import { depreciationInputPrice, depreciationSchedule } from "@/lib/tax";
import { categoryLabel, nazevDruhu } from "@/lib/categories";
import { nactiTypySluzeb } from "@/lib/typySluzeb";
import { czk, czkCompact, dateCz, num, pct, STATUS_LABELS } from "@/lib/format";
import { NEMOVITOST_MAP, nazevNemovitosti } from "@/lib/catalogs";
import { okruhProTyp } from "@/lib/geo";

export const dynamic = "force-dynamic";

export default async function PropertyDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await page();
  const { id } = await params;
  await srovnejPlatnost();
  const typy = await nactiTypySluzeb();
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

  // Katastr se nacita zvlast — v prehledech portfolia by jen zdrzoval
  const katastr = await prisma.cadastreRecord.findUnique({ where: { propertyId: property.id } });

  // Nejnovejsi odhad najmu — patri nahoru vedle hodnoty, ne az pod finance
  const nejnovejsiNajem = await prisma.rentEstimate.findFirst({
    where: { propertyId: property.id },
    orderBy: { date: "desc" },
  });

  // Zalohy najemce proti nakladum na preuctovane sluzby, i s historii:
  // ceny a zalohy se v case meni a minulost se pri uprave neprepisuje.
  const [zmenyNakladu, zmenyZaloh] = await Promise.all([
    prisma.serviceCostChange.findMany({ where: { service: { propertyId: property.id } }, orderBy: { validFrom: "asc" } }),
    prisma.leaseAdvanceChange.findMany({ where: { lease: { propertyId: property.id } }, orderBy: { validFrom: "asc" } }),
  ]);
  const historieNakladu: Record<string, typeof zmenyNakladu> = {};
  for (const z of zmenyNakladu) (historieNakladu[z.serviceId] ??= []).push(z);
  const historieZaloh: Record<string, typeof zmenyZaloh> = {};
  for (const z of zmenyZaloh) (historieZaloh[z.leaseId] ??= []).push(z);

  // Vyuctovani od dodavatelu s odecty; obdobi jsou dny bez casu
  const vyuctovaniDb = await prisma.serviceSettlement.findMany({
    where: { service: { propertyId: property.id } },
    include: { readings: true },
    orderBy: { periodFrom: "asc" },
  });
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const vyuctovani: VyuctovaniRadek[] = vyuctovaniDb.map((v) => ({
    id: v.id, serviceId: v.serviceId, od: iso(v.periodFrom), do: iso(v.periodTo),
    naklad: v.totalCost, zalohyDodavateli: v.supplierAdvances,
    rezim: v.splitMode === "READINGS" ? "READINGS" : "DAYS",
    jednotka: v.readingUnit, spotrebaVlastnik: v.ownerConsumption,
    odecty: Object.fromEntries(v.readings.map((o) => [o.leaseId, o.consumption])),
    cisloFaktury: v.invoiceNo, poznamka: v.notes,
  }));
  // Soubory k vyuctovanim (na Google Disku) podle id vyuctovani
  const diskPripojen = (await prisma.googleConnection.count()) > 0;
  const dokumentyDb = vyuctovani.length
    ? await prisma.dokument.findMany({
      where: { settlementId: { in: vyuctovani.map((v) => v.id) } }, orderBy: { createdAt: "desc" },
    })
    : [];
  const dokumentyVyuctovani: Record<string, { id: string; name: string; mime: string; size: number; kategorie: string; rok: number | null; note: string | null; createdAt: Date }[]> = {};
  for (const d of dokumentyDb) (dokumentyVyuctovani[d.settlementId!] ??= []).push(d);

  const najmyVyuctovani: NajemRadek[] = property.leases.map((n) => ({
    id: n.id, nazev: n.tenantName, od: iso(new Date(n.startDate)), do: n.endDate ? iso(new Date(n.endDate)) : null,
    utilitiesMonthly: n.utilitiesMonthly,
    historieZaloh: (historieZaloh[n.id] ?? []).map((z) => ({ validFrom: z.validFrom, amount: z.amount })),
    tenantStreet: n.tenantStreet, tenantCity: n.tenantCity, tenantZip: n.tenantZip, tenantAccount: user.role === "OWNER" ? n.tenantAccount : null,
  }));
  const sluzbyVyuctovani: SluzbaVyuctovani[] = property.services.map((sl) => ({
    id: sl.id, nazev: nazevDruhu(typy, sl.type), dodavatel: sl.provider, prectena: sl.chargedToTenant,
    vyuctovani: vyuctovani.filter((v) => v.serviceId === sl.id),
  }));

  const sluzbyVstup: SluzbaVstup[] = property.services.map((sl) => ({
    ...sl,
    historie: (historieNakladu[sl.id] ?? []).map((z) => ({ validFrom: z.validFrom, monthlyCost: z.monthlyCost, annualCost: z.annualCost })),
  }));
  const najmyVstup: NajemVstup[] = property.leases.map((n) => ({
    ...n,
    historie: (historieZaloh[n.id] ?? []).map((z) => ({ validFrom: z.validFrom, amount: z.amount })),
  }));

  const zalohy = porovnejProNemovitost(najmyVstup, sluzbyVstup);
  const zalohyNesedi = zalohy != null && zalohy.stav !== "sedi";

  // Casova osa za kazdou smlouvu, i ukoncenou; platna prvni, pak od nejnovejsi
  const osy = najmyVstup
    .map((n) => casovaOsa(n, sluzbyVstup))
    .filter((o): o is NonNullable<typeof o> => o != null)
    .sort((a, b) => Number(b.jeAktivni) - Number(a.jeAktivni) || b.od.getTime() - a.od.getTime());

  // Kondice: par tvrdych otazek, na ktere chce clovek odpoved bez pocitani
  const kontroly: Kontrola[] = [];
  kontroly.push(a.metrics.cashFlowAnnual >= 0
    ? { nazev: "Cash flow", stav: "dobra", detail: `kladné, ${czk(a.metrics.cashFlowAnnual / 12)} měsíčně` }
    : { nazev: "Cash flow", stav: "spatna", detail: `záporné, doplácíš ${czk(Math.abs(a.metrics.cashFlowAnnual) / 12)} měsíčně` });

  if (a.currentDebt > 0) {
    kontroly.push(a.metrics.dscr >= 1.2
      ? { nazev: "Krytí splátky", stav: "dobra", detail: `DSCR ${a.metrics.dscr.toFixed(2)} — nájem splátku pokrývá s rezervou` }
      : a.metrics.dscr >= 1
        ? { nazev: "Krytí splátky", stav: "pozor", detail: `DSCR ${a.metrics.dscr.toFixed(2)} — bez rezervy, výpadek nájmu zabolí` }
        : { nazev: "Krytí splátky", stav: "spatna", detail: `DSCR ${a.metrics.dscr.toFixed(2)} — nájem na splátku nestačí` });
    kontroly.push(a.metrics.ltv <= 80
      ? { nazev: "Zadlužení", stav: "dobra", detail: `LTV ${pct(a.metrics.ltv)}` }
      : { nazev: "Zadlužení", stav: "pozor", detail: `LTV ${pct(a.metrics.ltv)} — nad 80 % je refinancování dražší` });
  }

  kontroly.push(property.status === "RENTED"
    ? { nazev: "Obsazenost", stav: "dobra", detail: "pronajato" }
    : { nazev: "Obsazenost", stav: property.status === "VACANT" ? "spatna" : "pozor",
        detail: STATUS_LABELS[property.status].toLowerCase() + " — bez nájmu běží náklady dál" });

  if (zalohy) {
    const kc = (n: number) => `${Math.round(n).toLocaleString("cs-CZ")} Kč`;
    kontroly.push(
      zalohy.stav === "sedi"
        ? { nazev: "Zálohy nájemce", stav: "dobra", detail: `sedí se službami, ${kc(zalohy.zalohy)} měsíčně` }
        : zalohy.stav === "nedoplaci"
          ? { nazev: "Zálohy nájemce", stav: "pozor", detail: `nekryjí služby, doplácíš ${kc(-zalohy.rozdil)} měsíčně` }
          : zalohy.stav === "preplaci"
            ? { nazev: "Zálohy nájemce", stav: "pozor", detail: `vyšší než služby o ${kc(zalohy.rozdil)} měsíčně, počítej s vyúčtováním` }
            : { nazev: "Zálohy nájemce", stav: "pozor", detail: "služby nejsou označené k přeúčtování, nejdou ověřit" },
    );
  }

  if (a.fixationAlert) {
    kontroly.push({
      nazev: "Fixace", stav: a.fixationAlert.monthsLeft <= 6 ? "spatna" : "pozor",
      detail: `u ${a.fixationAlert.lender} končí za ${Math.round(a.fixationAlert.monthsLeft)} měsíců — poptej refinancování`,
    });
  }

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

        <Listy klic={`nemovitost:${property.id}`} listy={[
          {
            id: "prehled",
            nazev: "Přehled",
            obsah: (<>
            <SbalitelnaKarta klic="poloha" title="Poloha" action={
            property.latitude != null && property.longitude != null ? (
              <a href={`https://mapy.cz/zakladni?x=${property.longitude}&y=${property.latitude}&z=17`}
                target="_blank" rel="noreferrer noopener" className="text-xs text-accent">Otevřít v Mapy.cz →</a>
            ) : user.role === "OWNER" ? (
              <Link href={`/properties/${property.id}/edit`} className="text-xs text-accent">Upravit adresu →</Link>
            ) : null
          }>
            {property.latitude != null && property.longitude != null ? (
              <>
                <Mapa latitude={property.latitude} longitude={property.longitude} vyskaTrida="h-64 lg:h-80" />
                <p className="mt-2 text-xs text-ink-muted">
                  {property.scanRadiusKm
                    ? `Srovnání se hledá v pevném okruhu ${property.scanRadiusKm} km.`
                    : `Podle téhle polohy se hledá srovnání — od ${okruhProTyp(property.type)} km dál, dokud není dost nabídek.`}
                  {property.excludedCities && ` Nezapočítává se: ${property.excludedCities}.`}
                </p>
              </>
            ) : (
              <div className="space-y-3 rounded-xl bg-surface-sunken px-4 py-3.5">
                <p className="text-sm text-ink-secondary">
                  Adresa je uložená, ale chybí k ní souřadnice — nemovitost vznikla dřív, než přibyl
                  našeptávač adres. Bez nich se nedá zobrazit mapa ani hledat srovnání podle vzdálenosti.
                </p>
                {user.role === "OWNER" && <UrcitPolohu propertyId={property.id} />}
              </div>
            )}
          </SbalitelnaKarta>
          {/* Dvě čísla, kvůli kterým se sem chodí: co to má cenu a co to nese.
              Hero je jen jedno — dvě stejně velká by spolu soupeřila. */}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <Hero
              label="Odhadní tržní hodnota"
              hodnota={czkCompact(a.currentValue)}
              tone={a.valueGain >= 0 ? "good" : "bad"}
              doplnek={(() => {
                // Z kolika nabídek odhad vznikl — bez toho je číslo neprůhledné
                const v = property.valuations[0];
                const vzorek = v?.sampleSize ?? null;
                return (<>
                  {czk(a.currentValue / property.areaM2)}/m² · zdroj {valuationSourceLabel(a.valuationSource)}
                  {vzorek != null && (
                    <> · z {vzorek} {vzorek === 1 ? "nabídky" : vzorek < 5 ? "nabídek" : "nabídek"}
                      {v?.confidence === "RUCNI" && (
                        <span className="ml-1.5 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                          ručně upraveno
                        </span>
                      )}
                      {v?.confidence === "KVALIFIKOVANY" && (
                        <span className="ml-1.5 rounded bg-good/15 px-1.5 py-0.5 text-[10px] font-medium text-good"
                          title="Všechny srovnatelné nabídky jsou přímo z této obce">
                          kvalifikovaný odhad
                        </span>
                      )}
                    </>
                  )}
                  <span className="ml-2 block font-medium text-ink-primary sm:ml-0 sm:mt-0.5">
                    {a.valueGain >= 0 ? "+" : ""}{czkCompact(a.valueGain)} ({pct(a.valueGainPct)}) za {a.yearsHeld.toFixed(1)} roku
                  </span>
                </>);
              })()}
              vedle={
                <Link href={`/properties/${property.id}/trh`}
                  className="btn no-print whitespace-nowrap">Ocenění a trh →</Link>
              }
            />

            <div className="card">
              <div className="label">Tržní nájem</div>
              <div className="mt-1 text-3xl font-semibold leading-none tracking-tight">
                {nejnovejsiNajem ? `${czk(nejnovejsiNajem.monthlyRent)}/měs.` : "—"}
              </div>
              {nejnovejsiNajem ? (
                <div className="mt-2 text-sm text-ink-secondary">
                  {smluvniNajem > 0 ? (
                    <>
                      Tvůj {czk(smluvniNajem)}
                      {(() => {
                        const r = ((smluvniNajem - nejnovejsiNajem.monthlyRent) / nejnovejsiNajem.monthlyRent) * 100;
                        if ((nejnovejsiNajem.sampleSize ?? 0) < 3) return " · odhad z málo nabídek, neporovnávej";
                        if (r < -8) return ` · ${pct(Math.abs(r), 0)} pod trhem, ročně ${czk((nejnovejsiNajem.monthlyRent - smluvniNajem) * 12)}`;
                        if (r > 8) return ` · ${pct(r, 0)} nad trhem`;
                        return " · odpovídá trhu";
                      })()}
                    </>
                  ) : "Zatím nepronajato"}
                  <span className="block text-xs text-ink-muted">
                    {nejnovejsiNajem.sampleSize} nabídek · {dateCz(nejnovejsiNajem.date)}
                  </span>
                </div>
              ) : (
                <p className="mt-2 text-sm text-ink-secondary">
                  Odhad zatím nevznikl. Sken běží každou noc; ručně ho pustíš níž u tržního nájmu.
                </p>
              )}
            </div>
          </div>

          {/* Výkonnost a kondice vedle sebe — čísla i verdikt na jedné obrazovce */}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="grid grid-cols-2 gap-3 content-start">
              <Stat label="Čistý výnos" term="cistyVynos" value={pct(a.metrics.netYield)}
                sub={`Hrubý ${pct(a.metrics.grossYield)} · cap rate ${pct(a.metrics.capRate)}`}
                tone={a.metrics.netYield >= 4 ? "good" : a.metrics.netYield >= 2 ? "neutral" : "warn"} />
              <Stat label="IRR od pořízení" term="irr" value={a.irr != null ? pct(a.irr) : "—"}
                sub={a.estimatedYears.length ? `${a.estimatedYears.length} let odhadnuto z modelu` : "Ze skutečných toků"}
                tone={(a.irr ?? 0) >= 5 ? "good" : "neutral"} />
              <Stat label="Cash flow / rok" term="cashFlow" value={czkCompact(a.metrics.cashFlowAnnual)}
                sub={`${czk(a.metrics.cashFlowAnnual / 12)} měsíčně`}
                tone={a.metrics.cashFlowAnnual >= 0 ? "good" : "bad"} />
              <Stat label="Vlastní kapitál" value={czkCompact(a.metrics.equity)}
                sub={a.currentDebt > 0 ? `LTV ${pct(a.metrics.ltv)} · dluh ${czkCompact(a.currentDebt)}` : "Bez dluhu"}
                tone={a.metrics.ltv > 80 ? "warn" : "good"} />
            </div>

            <Kondice kontroly={kontroly} />
          </div>

          {property.notes && (
            <Card title="Poznámky"><p className="text-sm text-ink-secondary">{property.notes}</p></Card>
          )}
            </>),
          },
          {
            id: "katastr",
            nazev: "Katastr",
            obsah: (<>
            {/* Odkaz vede na úvodní stránku Nahlížení, ne hlouběji: adresy
                uvnitř aplikace ČÚZK mění a ověřit je nejde, protože Nahlížení
                je za ochranou proti robotům. Identifikátory k vyhledání jsou
                na kartě ke zkopírování. */}
            <SbalitelnaKarta klic="katastr" title="Katastr nemovitostí" action={
              <a href="https://nahlizenidokn.cuzk.gov.cz/" target="_blank" rel="noreferrer noopener"
                className="text-xs text-accent">Nahlížení do KN →</a>
            }>
              <KatastrKarta
                propertyId={property.id}
                canEdit={user.role === "OWNER"}
                adresa={`${property.street}, ${property.city}`}
                data={katastr && {
                  obecNazev: katastr.obecNazev,
                  castObceNazev: katastr.castObceNazev,
                  katastralniUzemiKod: katastr.katastralniUzemiKod,
                  katastralniUzemiNazev: katastr.katastralniUzemiNazev,
                  lvCislo: katastr.lvCislo,
                  typStavby: katastr.typStavby,
                  cisloDomovni: katastr.cisloDomovni,
                  zpusobVyuziti: katastr.zpusobVyuziti,
                  zpusobyOchrany: katastr.zpusobyOchrany,
                  parcely: katastr.parcely,
                  parcelaId: katastr.parcelaId,
                  jednotky: (katastr.jednotky as JednotkaVolba[] | null) ?? [],
                  cisloJednotky: katastr.cisloJednotky,
                  nahlizeniOdkaz: katastr.nahlizeniOdkaz,
                  nactenoKdy: katastr.nactenoKdy,
                }}
              />
            </SbalitelnaKarta>
            </>),
          },
          {
            id: "najem",
            nazev: "Nájem",
            pocet: property.leases.length,
            varovani: zalohyNesedi,
            obsah: (<>
            <SbalitelnaKarta klic="najem" title="Nájem a nájemci">
              <LeaseManager typy={typy} propertyId={property.id} leases={property.leases}
                nemovitost={{ nazev: property.name, adresa: `${property.street}, ${property.zip} ${property.city}` }}
                pronajimatele={property.owners.map((o) => ({
                  name: o.user.name,
                  adresa: [o.user.street, [o.user.zip, o.user.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
                }))} canEdit={user.role === "OWNER"}
                services={sluzbyVstup} porovnani={zalohy} historie={historieZaloh} />
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
            </SbalitelnaKarta>
            <SbalitelnaKarta klic="zalohy-v-case" title="Zálohy a služby v čase" vychoziSbalena={!zalohyNesedi}
              shrnuti={zalohy ? (zalohyNesedi ? "nesedí" : "sedí") : undefined}>
              <ZalohyVCase osy={osy} />
            </SbalitelnaKarta>
            </>),
          },
          {
            id: "sluzby",
            nazev: "Služby",
            pocet: property.services.length,
            varovani: zalohyNesedi,
            obsah: (<>
            <SbalitelnaKarta klic="sluzby" title="Služby a dodavatelé" action={<Link href="/savings" className="text-xs text-accent">Kde ušetřit →</Link>}>
              <ServiceManager typy={typy} propertyId={property.id} services={property.services} canEdit={user.role === "OWNER"}
                porovnani={zalohy} historie={historieNakladu} />
            </SbalitelnaKarta>
            </>),
          },
          {
            id: "vyuctovani",
            nazev: "Vyúčtování",
            pocet: vyuctovani.length || undefined,
            obsah: (<>
            <SbalitelnaKarta klic="vyuctovani-sluzeb" title="Vyúčtování služeb od dodavatelů">
              <VyuctovaniSluzeb typy={typy} dokumenty={dokumentyVyuctovani} diskPripojen={diskPripojen} services={property.services.map((sl) => ({ id: sl.id, type: sl.type, provider: sl.provider, chargedToTenant: sl.chargedToTenant }))}
                leases={najmyVyuctovani} vyuctovani={vyuctovani} canEdit={user.role === "OWNER"} />
            </SbalitelnaKarta>
            <SbalitelnaKarta klic="vyuctovani-najemce" title="Vyúčtování pro nájemce" vychoziSbalena>
              <VyuctovaniNajemce nemovitost={property.name} adresaNemovitosti={`${property.street}, ${property.zip} ${property.city}`}
                leases={najmyVyuctovani} services={sluzbyVyuctovani} />
            </SbalitelnaKarta>
            </>),
          },
          {
            id: "finance",
            nazev: "Finance",
            obsah: (<>
            <SbalitelnaKarta klic="kalkulace" title="Pořizovací kalkulace">
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
            </SbalitelnaKarta>
            <SbalitelnaKarta klic="dluh" title="Dluh a zajištění">
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
            </SbalitelnaKarta>
          {amortByYear.length > 0 && (
            <SbalitelnaKarta klic="amortizace" title="Umořování úvěru — kolik jde na jistinu a kolik bance">
              <AmortizationChart data={amortByYear} />
            </SbalitelnaKarta>
          )}

            <SbalitelnaKarta klic="spoluvlastnici" title="Spoluvlastníci">
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
            </SbalitelnaKarta>
            </>),
          },
          {
            id: "pohyby",
            nazev: "Pohyby",
            pocet: property.transactions.length,
            obsah: (<>
          <SbalitelnaKarta klic="pohyby" title="Pohyby">
            <TransactionManager propertyId={property.id} transactions={recentTx} canEdit={user.role === "OWNER"} />
            {property.transactions.length > recentTx.length && (
              <p className="mt-3 text-xs text-ink-muted">
                Zobrazeno posledních {recentTx.length} z {property.transactions.length} pohybů.{" "}
                <Link href="/cashflow" className="text-accent">Všechny v Cash flow →</Link>
              </p>
            )}
          </SbalitelnaKarta>
            </>),
          },
          {
            id: "trh",
            nazev: "Trh",
            obsah: (<>
            <SbalitelnaKarta klic="oceneni" title="Ocenění a trh" action={
              <Link href={`/properties/${property.id}/trh`} className="text-xs text-accent">Otevřít →</Link>
            }>
              <table className="table-base">
                <tbody>
                  <Row label="Odhad hodnoty" value={property.valuations[0] ? czk(property.valuations[0].value) : "—"}
                    note={property.valuations[0]
                      ? `z ${property.valuations[0].sampleSize ?? "?"} nabídek · ${dateCz(property.valuations[0].date)}`
                      : "zatím nevznikl"} />
                  <Row label="Odhad nájmu" value={nejnovejsiNajem ? `${czk(nejnovejsiNajem.monthlyRent)}/měs.` : "—"}
                    note={nejnovejsiNajem ? `z ${nejnovejsiNajem.sampleSize ?? "?"} nabídek` : "zatím nevznikl"} />
                </tbody>
              </table>
              <p className="mt-3 text-xs text-ink-muted">
                Historie ocenění, srovnatelné nabídky, ruční korekce a postup, jak odhad vzniká —
                všechno na vlastní stránce, ať tady nestíní výkonnosti.
              </p>
            </SbalitelnaKarta>
            </>),
          },
          {
            id: "dane",
            nazev: "Daně",
            obsah: (<>
            {/* Odpisy jsou daňová administrativa, ne výkonnost — karta se
                otevírá sbalená, kdo je zrovna řeší, rozklikne si je. */}
            <SbalitelnaKarta
              klic="odpisy"
              vychoziSbalena
              title={lzeOdepisovat
                ? `Odpisy — ${property.depreciationMethod === "STRAIGHT" ? "rovnoměrné" : "zrychlené"}, ${property.depreciationGroup}. skupina`
                : "Odpisy"}
              shrnuti={lzeOdepisovat ? `letos ${czk(a.depreciationThisYear)}` : "neodepisuje se"}
            >
  <div>
                {!lzeOdepisovat ? (
                  <p className="rounded-lg bg-surface-sunken px-3 py-2.5 text-sm text-ink-secondary">
                    {NEMOVITOST_MAP.get(property.type)?.upozorneni
                      ?? "Tenhle druh nemovitosti se neodepisuje."}
                  </p>
                ) : (<>
                  <p className="mb-3 text-xs text-ink-secondary">
                    Vstupní cena {czk(depreciationInputPrice(property))} (bez podílu na pozemku). Uplatňuje se jen při
                    skutečných výdajích, ne při paušálu.
                  </p>
                  <div className="table-scroll max-h-64 overflow-y-auto">
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
              </div>
            </SbalitelnaKarta>
            </>),
          },
        ]} />

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
