import Link from "next/link";
import { notFound } from "next/navigation";
import { page } from "@/lib/guard";
import { srovnejPlatnost } from "@/lib/platnost";
import { Nav } from "@/components/Nav";
import { Verze } from "@/components/Verze";
import { VyvojChart } from "@/components/charts";
import { Badge, Card, Empty, Stat, StatGrid } from "@/components/Stat";
import { AmortizationChart } from "@/components/charts";
import { Napoveda } from "@/components/Napoveda";
import { LoanManager } from "@/components/LoanManager";
import { LeaseManager } from "@/components/LeaseManager";
import type { Nabidka } from "@/components/Comparables";
import { Mapa, type BodOkoli } from "@/components/Mapa";
import { Hero, Kondice, type Kontrola } from "@/components/Kondice";
import { ServiceManager } from "@/components/ServiceManager";
import { TransactionManager } from "@/components/TransactionManager";
import { analyzeProperty, loadProperty, mujMesicniTok } from "@/lib/portfolio";
import { nasobitel, podilNaUveru, podilUzivatele } from "@/lib/ownership";
import { aktualniPohled } from "@/lib/ownership.server";
import { prisma } from "@/lib/db";
import { synchronizujSvjKdyzJeCas } from "@/lib/svj";
import { sluzbyProNajemce } from "@/lib/vyuctovaniNajemce";
import { DRUH_MERAKU_MAP, merakySluzby } from "@/lib/meraky";
import { after } from "next/server";
import { odhadNemovitosti } from "@/lib/market/inzeraty";
import { OwnerManager } from "@/components/OwnerManager";
import { Listy } from "@/components/Listy";
import { SbalitelnaKarta } from "@/components/SbalitelnaKarta";
import { KatastrKarta, type JednotkaVolba } from "@/components/KatastrKarta";
import { UrcitPolohu } from "@/components/UrcitPolohu";
import { ZalohyVCase } from "@/components/ZalohyVCase";
import { casovaOsa, porovnejProNemovitost, type NajemVstup, type PolozkaZalohy, type SluzbaVstup } from "@/lib/zalohy";
import { VyuctovaniSluzeb, type NajemRadek, type VyuctovaniRadek } from "@/components/Vyuctovani";
import { VyuctovaniNajemceKarta, type NajemceNajem, type VydanoRadek } from "@/components/VyuctovaniNajemceKarta";
import { cisloNajemce } from "@/lib/najemci";
import { PravidelnePlatby } from "@/components/PravidelnePlatby";
import { nactiNavrhPlatby, nactiZauctovanePlatby } from "@/lib/pravidelnePlatbyData";
import { prehledPlateb } from "@/lib/pravidelnePlatby";
import { prumernyMesicniTok, tokAktualnihoMesice, tokyNemovitosti } from "@/lib/series";
import { pronajimatelNemovitosti, pronajimatelZRef } from "@/lib/provozovatel";
import { nactiStrany } from "@/lib/strany";
import type { SnapshotVyuctovani } from "@/lib/vyuctovaniVydane";
import type { SluzbaVyuctovani } from "@/lib/vyuctovani";
import { amortizationSchedule, loanYearBreakdown } from "@/lib/finance";
import { depreciationInputPrice, depreciationSchedule } from "@/lib/tax";
import { categoryLabel, nazevDruhu } from "@/lib/categories";
import { nactiTypySluzeb } from "@/lib/typySluzeb";
import { czk, czkCompact, dateCz, denISO, num, pct, STATUS_LABELS } from "@/lib/format";
import { NEMOVITOST_MAP, nazevNemovitosti } from "@/lib/catalogs";
import { okruhProTyp } from "@/lib/geo";

export const dynamic = "force-dynamic";

export default async function PropertyDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await page();
  const { id } = await params;
  const jeMajitel = user.role === "OWNER";

  // Vsechny dotazy jsou na sobe nezavisle (klicem je id z adresy), takze bezi najednou.
  // Predtim sly jeden za druhym — kazdy pridaval sitovou odezvu k databazi.
  const [
    , typy, property, pohled, strany, diskPripojen, katastr, nejnovejsiNajem,
    zmenyNakladu, zmenyZaloh, vyuctovaniDb, dokumentyDb, vydanaDb, dokumentyVydanych,
    najemciVsi, dokumentySmluv, uzivatele, stavVyuctovani, navrhPlateb, zauctovanePlatby, historieNajmu,
    odhadProdej, odhadNajem,
  ] = await Promise.all([
    srovnejPlatnost(),
    nactiTypySluzeb(),
    loadProperty(id),
    aktualniPohled(),
    nactiStrany(),
    prisma.googleConnection.count().then((n) => n > 0),
    // Katastr se nacita zvlast — v prehledech portfolia by jen zdrzoval
    prisma.cadastreRecord.findUnique({ where: { propertyId: id } }),
    // Nejnovejsi odhad najmu — patri nahoru vedle hodnoty, ne az pod finance
    prisma.rentEstimate.findFirst({ where: { propertyId: id }, orderBy: { date: "desc" } }),
    // Zalohy najemce proti nakladum na sluzby, i s historii
    prisma.serviceCostChange.findMany({ where: { service: { propertyId: id } }, orderBy: { validFrom: "asc" } }),
    prisma.leaseAdvanceChange.findMany({ where: { lease: { propertyId: id } }, orderBy: { validFrom: "asc" } }),
    // Vyuctovani od dodavatelu s odecty; obdobi jsou dny bez casu
    prisma.serviceSettlement.findMany({
      where: { service: { propertyId: id } }, include: { readings: true }, orderBy: { periodFrom: "asc" },
    }),
    // Soubory na Google Disku: k vyuctovanim sluzeb, k vydanym vyuctovanim a ke smlouvam
    prisma.dokument.findMany({ where: { propertyId: id, settlementId: { not: null } }, orderBy: { createdAt: "desc" } }),
    // Vyuctovani vydana najemcum — jen pro majitele (obsahuje cisla uctu)
    jeMajitel ? prisma.tenantStatement.findMany({ where: { propertyId: id }, orderBy: { issuedAt: "desc" } }) : Promise.resolve([]),
    jeMajitel
      ? prisma.dokument.findMany({ where: { propertyId: id, statementId: { not: null } }, orderBy: { createdAt: "desc" } })
      : Promise.resolve([]),
    jeMajitel ? prisma.tenant.findMany({ orderBy: { cislo: "asc" } }) : Promise.resolve([]),
    prisma.dokument.findMany({
      where: { propertyId: id, leaseId: { not: null }, kategorie: { in: ["NAJEMNI_SMLOUVA", "PREDAVACI_PROTOKOL"] } },
      orderBy: { createdAt: "desc" },
    }),
    jeMajitel ? prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, email: true } }) : Promise.resolve([]),
    // Posledni vyuctovani platne smlouvy (odkdy se scita zamerny rozdil zaloh)
    prisma.tenantStatement.findMany({
      where: { propertyId: id, status: { not: "STORNO" } }, select: { leaseId: true, periodTo: true },
    }),
    // Navrh pravidelnych plateb (najem, zalohy, sluzby) k zauctovani
    nactiNavrhPlatby(id),
    nactiZauctovanePlatby(id),
    // Historie odhadu najmu pro graf vyvoje
    prisma.rentEstimate.findMany({ where: { propertyId: id }, orderBy: { date: "asc" }, select: { date: true, monthlyRent: true } }),
    // Zive ze zarazenych nabidek: vazeny prumer (ulozeny) i vazeny median
    odhadNemovitosti(id, "SALE"),
    odhadNemovitosti(id, "RENT"),
  ]);
  if (!property) notFound();

  const podil = nasobitel(pohled, property.owners, user.id);
  // Meraky se stavy: spotreba najemcu do vyuctovani podle odectu
  // Stavy ze SVJ jednou za mesic, az po odeslani stranky (nebrzdi ji)
  after(() => synchronizujSvjKdyzJeCas(id));
  const merakyVyuctovani = (await prisma.merak.findMany({ where: { propertyId: id }, include: { stavy: true } })).map((m) => ({
    id: m.id, druh: m.druh, nazev: m.nazev, aktivni: m.aktivni, dvoutarif: m.dvoutarif, nahrazujeId: m.nahrazujeId, nulovani: m.nulovani,
    stavy: m.stavy.map((x) => ({ datum: denISO(x.datum), hodnota: x.hodnota, hodnota2: x.hodnota2, vynulovanoPo: x.vynulovanoPo })),
  }));
  // Na trhu ceka ke schvaleni: navrhy k zarazeni a mozne shody stejneho bytu (u propojeneho oceneni u korene)
  const korenTrhu = property.oceneniPodle ?? property.id;
  const [navrhuTrhu, shodTrhu] = await Promise.all([
    prisma.zarazeniInzeratu.count({ where: { propertyId: korenTrhu, stav: "NAVRH" } }),
    prisma.shodaInzeratu.count({ where: { stav: "NAVRH", OR: [
      { inzerat: { zarazeni: { some: { propertyId: korenTrhu, stav: { in: ["NAVRH", "ZARAZENO"] } } } } },
      { drivejsi: { zarazeni: { some: { propertyId: korenTrhu, stav: { in: ["NAVRH", "ZARAZENO"] } } } } },
    ] } }),
  ]);
  const ceka = { trh: navrhuTrhu + shodTrhu };
  const a = analyzeProperty(property, new Date(), podil, (l) => podilNaUveru(pohled, l, property.owners, user.id));
  const year = new Date().getFullYear();

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

  // Ceny a zalohy se v case meni a minulost se pri uprave neprepisuje.
  const historieNakladu: Record<string, typeof zmenyNakladu> = {};
  for (const z of zmenyNakladu) (historieNakladu[z.serviceId] ??= []).push(z);
  const historieZaloh: Record<string, typeof zmenyZaloh> = {};
  for (const z of zmenyZaloh) (historieZaloh[z.leaseId] ??= []).push(z);

  const iso = (d: Date) => denISO(d);
  const vyuctovani: VyuctovaniRadek[] = vyuctovaniDb.map((v) => ({
    id: v.id, serviceId: v.serviceId, od: iso(v.periodFrom), do: iso(v.periodTo),
    naklad: v.totalCost, zalohyDodavateli: v.supplierAdvances,
    rezim: v.splitMode === "READINGS" ? "READINGS" : "DAYS",
    jednotka: v.readingUnit, spotrebaVlastnik: v.ownerConsumption,
    odecty: Object.fromEntries(v.readings.map((o) => [o.leaseId, o.consumption])),
    cisloFaktury: v.invoiceNo, poznamka: v.notes,
    batchId: v.batchId, batchPocet: v.batchId ? vyuctovaniDb.filter((x) => x.batchId === v.batchId).length : undefined,
  }));
  const dokumentyVyuctovani: Record<string, { id: string; name: string; mime: string; size: number; kategorie: string; rok: number | null; note: string | null; createdAt: Date }[]> = {};
  for (const d of dokumentyDb) (dokumentyVyuctovani[d.settlementId!] ??= []).push(d);

  const vydana: VydanoRadek[] = vydanaDb.map((x) => ({
    id: x.id, cislo: x.cislo, leaseId: x.leaseId, tenantId: x.tenantId,
    od: iso(x.periodFrom), do: iso(x.periodTo), result: x.result, status: x.status as VydanoRadek["status"],
    issuedAt: iso(x.issuedAt), sentAt: x.sentAt ? iso(x.sentAt) : null, sentVia: x.sentVia,
    dueDate: x.dueDate ? iso(x.dueDate) : null, settledAt: x.settledAt ? iso(x.settledAt) : null,
    settledNote: x.settledNote, stornoReason: x.stornoReason,
    snapshot: x.snapshot as unknown as SnapshotVyuctovani,
    dokumenty: dokumentyVydanych.filter((d) => d.statementId === x.id),
  }));
  const najemciDb = najemciVsi;
  // Pronajimatel na dokladech: provozovatel nemovitosti (bez nej vlastnik s nejvetsim podilem)
  const pronajimatelVyuct: SnapshotVyuctovani["pronajimatel"] = pronajimatelNemovitosti(property);
  // Na smlouve jde vybrat jineho pronajimatele (uzivatele aplikace nebo provozovatele)
  const pronajimatelPodleSmlouvy: Record<string, SnapshotVyuctovani["pronajimatel"]> = Object.fromEntries(
    property.leases.map((l) => [l.id, pronajimatelZRef(l.landlordRef, strany, pronajimatelVyuct)]),
  );
  const stranyVyber = jeMajitel
    ? [
      ...Object.entries(strany.operators).map(([id, p]) => ({ value: `o:${id}`, nazev: p.name, skupina: "Provozovatelé" })),
      ...Object.entries(strany.users).map(([id, p]) => ({ value: `u:${id}`, nazev: p.name, skupina: "Uživatelé aplikace" })),
    ]
    : [];
  // Nájemci z databáze k výběru ve formuláři smlouvy (jen majitel; obsahují kontakty a účty)
  const najemciVyber = najemciVsi.map((t) => ({
    id: t.id, cislo: cisloNajemce(t.cislo), name: t.name, email: t.email, phone: t.phone,
    street: t.street, city: t.city, zip: t.zip, account: t.account,
  }));
  const najmyProNajemce: NajemceNajem[] = property.leases.map((n) => {
    const t = najemciDb.find((x) => x.id === n.tenantId);
    return {
      id: n.id, nazev: t?.name ?? n.tenantName, od: iso(new Date(n.startDate)), do: n.endDate ? iso(new Date(n.endDate)) : null,
      utilitiesMonthly: n.utilitiesMonthly,
      historieZaloh: (historieZaloh[n.id] ?? []).map((z) => ({ validFrom: z.validFrom, amount: z.amount, items: z.items as PolozkaZalohy[] | null })),
      advanceItems: n.advanceItems as PolozkaZalohy[] | null,
      tenantId: n.tenantId, cislo: t ? cisloNajemce(t.cislo) : null,
      email: t?.email ?? n.tenantEmail, phone: t?.phone ?? n.tenantPhone,
      adresa: [t?.street ?? n.tenantStreet, [t?.zip ?? n.tenantZip, t?.city ?? n.tenantCity].filter(Boolean).join(" ")].filter(Boolean).join(", "),
      ucet: t?.account ?? n.tenantAccount,
      pronajimatel: pronajimatelPodleSmlouvy[n.id],
    };
  });

  // Soubory ke smlouvam (sken smlouvy, predavaci protokol) na Google Disku
  const dokumentyPodleSmlouvy: Record<string, typeof dokumentySmluv> = {};
  for (const d of dokumentySmluv) (dokumentyPodleSmlouvy[d.leaseId!] ??= []).push(d);

  const najmyVyuctovani: NajemRadek[] = property.leases.map((n) => ({
    id: n.id, nazev: n.tenantName, od: iso(new Date(n.startDate)), do: n.endDate ? iso(new Date(n.endDate)) : null,
    utilitiesMonthly: n.utilitiesMonthly,
    historieZaloh: (historieZaloh[n.id] ?? []).map((z) => ({ validFrom: z.validFrom, amount: z.amount })),
    tenantStreet: n.tenantStreet, tenantCity: n.tenantCity, tenantZip: n.tenantZip, tenantAccount: user.role === "OWNER" ? n.tenantAccount : null,
  }));
  // Pruvodce vyuctovanim pro najemce: sluzby se skupinami, platnosti a meraky
  const sluzbyVyuctovani = sluzbyProNajemce(
    property.services, vyuctovani, typy, merakyVyuctovani,
    merakySluzby, (d) => DRUH_MERAKU_MAP.get(d)?.jednotka ?? null, (t) => nazevDruhu(typy, t),
  );

  const sluzbyVstup: SluzbaVstup[] = property.services.map((sl) => ({
    ...sl,
    historie: (historieNakladu[sl.id] ?? []).map((z) => ({ validFrom: z.validFrom, monthlyCost: z.monthlyCost, annualCost: z.annualCost })),
  }));
  const najmyVstup: NajemVstup[] = property.leases.map((n) => ({
    ...n,
    advanceItems: n.advanceItems as PolozkaZalohy[] | null,
    historie: (historieZaloh[n.id] ?? []).map((z) => ({ validFrom: z.validFrom, amount: z.amount, items: z.items as PolozkaZalohy[] | null })),
  }));

  // Zamerny rozdil zaloh se scita od posledniho vydaneho vyuctovani platne smlouvy
  const platnaSmlouva = property.leases.find((l) => l.isActive);
  const posledniKonec = platnaSmlouva
    ? stavVyuctovani.filter((x) => x.leaseId === platnaSmlouva.id).reduce<Date | null>((a, x) => (!a || x.periodTo > a ? x.periodTo : a), null)
    : null;
  const odDataRozdilu = posledniKonec ? new Date(posledniKonec.getTime() + 24 * 3600 * 1000) : null;
  const zalohy = porovnejProNemovitost(najmyVstup, sluzbyVstup, new Date(), odDataRozdilu);
  const zalohyNesedi = zalohy != null && zalohy.stav !== "sedi" && zalohy.stav !== "zamerne";

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
        : zalohy.stav === "zamerne"
          ? { nazev: "Zálohy nájemce", stav: "dobra", detail: `záměrně ${zalohy.rozdil > 0 ? "nad" : "pod"} náklady o ${kc(Math.abs(zalohy.rozdil))} měsíčně` }
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

  // Zakladni prehled pohybu. Platby zapsane jako zaplacene v Pravidelnych platbach
  // (zdroj EVIDENCE) se pricitaji; ty zaucotovane jako pohyb uz v pohybech jsou.
  const evidovane = navrhPlateb.filter((p) => p.zaplaceno?.zdroj === "EVIDENCE")
    .map((p) => ({ datum: p.zaplaceno!.datum, castka: (p.castka >= 0 ? 1 : -1) * p.zaplaceno!.castka }));
  const letos = String(new Date().getFullYear());
  const vse = [
    ...property.transactions.map((t) => ({ datum: denISO(t.date), castka: t.amount })),
    ...evidovane,
  ];
  const souctyPohybu = {
    prijmy: vse.filter((x) => x.castka > 0).reduce((a, x) => a + x.castka, 0),
    vydaje: -vse.filter((x) => x.castka < 0).reduce((a, x) => a + x.castka, 0),
    letos: vse.filter((x) => x.datum.startsWith(letos)).reduce((a, x) => a + x.castka, 0),
  };
  const naUctu = souctyPohybu.prijmy - souctyPohybu.vydaje;
  const dluhyPlateb = prehledPlateb(navrhPlateb);

  // Mesicni cash flow majitele: pravidelne platby (najem a zalohy od najemce, platby sluzeb
  // dodavatelum) podle predpisu, u zaplacenych podle skutecne zaplacene castky, plus ostatni
  // pohyby (opravy, pojisteni, splatky...). Kauce se nepocita (neni prijem ani naklad).
  const toky = tokyNemovitosti(navrhPlateb, property.transactions);
  const prumer = prumernyMesicniTok(toky);
  // Stejny podil jako u ostatnich cisel nemovitosti (pohled spoluvlastnika)
  // Splatky uveru ale nese ten, komu uver patri
  const podilSplatek = a.podilSplatek;
  const mujTok = (t: { mesicne: number; rozpad?: Record<string, number> }) => mujMesicniTok(a, t);
  const skutecnyCashflow = prumer ? { ...prumer, mesicne: mujTok(prumer) } : null;
  const tentoMesic = tokAktualnihoMesice(toky);

  // Rady pro grafy vyvoje trhu: posledni zaznam dne, od nejstarsiho
  const rada = (zaznamy: { date: Date; hodnota: number }[]) => {
    const poDnech = new Map<string, number>();
    for (const z of [...zaznamy].sort((x, y) => x.date.getTime() - y.date.getTime())) poDnech.set(denISO(z.date), z.hodnota);
    return [...poDnech.entries()].map(([d, hodnota]) => ({ datum: dateCz(d), hodnota }));
  };
  const vyvojNajmu = rada(historieNajmu.map((h) => ({ date: h.date, hodnota: h.monthlyRent })));
  const vyvojHodnoty = rada(property.valuations.map((v) => ({ date: v.date, hodnota: v.value })));
  const zmenaProcent = (r: { hodnota: number }[]) =>
    r.length > 1 && r[0].hodnota ? ((r[r.length - 1].hodnota - r[0].hodnota) / r[0].hodnota) * 100 : null;

  // Srovnatelne nabidky z posledniho oceneni (prodej) a odhadu najmu pro mapu
  const okoliNabidek = (() => {
    const body: BodOkoli[] = [];
    let bezSouradnic = 0;
    const pridej = (druh: BodOkoli["druh"], zdroj: unknown) => {
      if (!Array.isArray(zdroj)) return;
      for (const n of zdroj as Nabidka[]) {
        if (n.latitude == null || n.longitude == null) { bezSouradnic++; continue; }
        body.push({
          lat: n.latitude, lon: n.longitude, druh, url: n.url,
          popis: [
            `${druh === "PRODEJ" ? "Prodej" : "Nájem"}${n.disposition ? ` ${n.disposition}` : ""}${n.areaM2 ? ` · ${n.areaM2} m²` : ""}`,
            druh === "PRODEJ" ? `${czk(n.price)} · ${czk(n.pricePerM2)}/m²` : `${czk(n.price)}/měs. · ${czk(n.pricePerM2)}/m²`,
            ...(n.vzdalenostKm != null ? [`${String(n.vzdalenostKm).replace(".", ",")} km od nemovitosti`] : []),
          ],
        });
      }
    };
    pridej("PRODEJ", property.valuations.find((v) => v.comparables != null)?.comparables);
    pridej("NAJEM", nejnovejsiNajem?.comparables);
    return { body, bezSouradnic };
  })();

  const recentTx = [...property.transactions]
    .sort((x, y) => new Date(y.date).getTime() - new Date(x.date).getTime());

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
            {property.operator && ` · provozovatel ${property.operator.name}`}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            {user.role === "OWNER" && (
              <Link href={`/properties/${property.id}/edit`} className="btn no-print">Upravit</Link>
            )}
          </div>
          </div>
        </div>

        {pohled === "moje" && podil === 0 && (
          <div className="rounded-card border border-warn/40 bg-warn/10 px-4 py-3 text-sm">
            <strong>Tuhle nemovitost nevlastníš</strong> — tvůj podíl je 0 %, takže v pohledu <strong>Můj podíl</strong> jsou
            všechny částky nulové. Pro skutečná čísla přepni nahoře na <strong>Celé portfolio</strong>
            {property.owners.length > 0 && <>, případně uprav spoluvlastníky na záložce Přehled</>}.
          </div>
        )}

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
                <Mapa latitude={property.latitude} longitude={property.longitude} vyskaTrida="h-64 lg:h-80" okoli={okoliNabidek.body} />
                <p className="mt-2 text-xs text-ink-muted">
                  {property.scanRadiusKm
                    ? `Srovnání se hledá v pevném okruhu ${property.scanRadiusKm} km.`
                    : `Podle téhle polohy se hledá srovnání — od ${okruhProTyp(property.type)} km dál, dokud není dost nabídek.`}
                  {property.excludedCities && ` Nezapočítává se: ${property.excludedCities}.`}
                  {okoliNabidek.bezSouradnic > 0 && ` ${okoliNabidek.bezSouradnic} srovnatelných nabídek nemá uloženou polohu (starší sken), objeví se po dalším skenu.`}
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
                // Tri radky: za m² a odkud odhad je; median pro srovnani; zisk od koupe
                const v = property.valuations[0];
                const vzorek = v?.sampleSize ?? null;
                const zNabidek = v?.source === "VYBER" && vzorek != null;
                return (
                  <div className="space-y-1.5">
                    <div>
                      {czk(a.currentValue / property.areaM2)}/m² · {zNabidek
                        ? <>průměr z {vzorek} {vzorek === 1 ? "vybrané nabídky" : "vybraných nabídek"}</>
                        : <>zdroj: {valuationSourceLabel(a.valuationSource).toLowerCase()}</>}
                      {v?.confidence === "RUCNI" && <span className="ml-1.5 rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-medium">ručně upraveno</span>}
                    </div>
                    {zNabidek && odhadProdej && (
                      <div className="text-xs opacity-80" title="Vážený medián: polovina nabídek (podle váhy) je levnější, polovina dražší — méně ho ovlivní jedna extrémní nabídka">
                        Medián {czkCompact(odhadProdej.median.hodnota * podil)} ({czk(odhadProdej.median.perM2)}/m²)
                      </div>
                    )}
                    <div className="font-semibold text-ink-primary">
                      {a.valueGain >= 0 ? "+" : ""}{czkCompact(a.valueGain)} ({pct(a.valueGainPct)}) od koupě · {a.yearsHeld.toFixed(1).replace(".", ",")} roku
                    </div>
                  </div>
                );
              })()}
              vedle={
                <Link href={`/properties/${property.id}/trh`}
                  className="btn no-print whitespace-nowrap">Ocenění a trh →</Link>
              }
            />

            <div className="card">
              <div className="flex items-start justify-between gap-2">
                <div className="label">Tržní nájem</div>
                {nejnovejsiNajem && (nejnovejsiNajem.sampleSize ?? 0) < 3 && <Badge tone="warn">málo nabídek</Badge>}
              </div>
              <div className="mt-1 text-3xl font-semibold leading-none tracking-tight tabular-nums">
                {nejnovejsiNajem ? <>{czk(nejnovejsiNajem.monthlyRent)}<span className="text-base font-normal text-ink-muted">/měs.</span></> : "—"}
              </div>
              {nejnovejsiNajem?.source === "VYBER" && odhadNajem && (
                <div className="mt-1 text-xs text-ink-muted" title="Vážený medián vybraných nabídek nájmu">medián {czk(odhadNajem.median.hodnota * podil)}/měs.</div>
              )}
              {nejnovejsiNajem ? (
                <>
                  {smluvniNajem > 0 && (() => {
                    const trh = nejnovejsiNajem.monthlyRent;
                    const r = ((smluvniNajem - trh) / trh) * 100;
                    const max = Math.max(trh, smluvniNajem);
                    const spolehlivy = (nejnovejsiNajem.sampleSize ?? 0) >= 3;
                    return (
                      <div className="mt-4 space-y-2">
                        {[["Tvůj nájem", smluvniNajem, "bg-accent"], ["Trh", trh, "bg-ink-muted/40"]].map(([n, h, barva]) => (
                          <div key={n as string} className="flex items-center gap-2 text-xs">
                            <span className="w-16 shrink-0 text-ink-secondary">{n}</span>
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                              <div className={`h-full rounded-full ${barva}`} style={{ width: `${((h as number) / max) * 100}%` }} />
                            </div>
                            <span className="w-20 shrink-0 text-right tabular-nums">{czk(h as number)}</span>
                          </div>
                        ))}
                        {spolehlivy && (
                          <p className="pt-1 text-sm">
                            {r < -8 ? <span className="font-medium text-warn">{pct(Math.abs(r), 0)} pod trhem · ročně přicházíš o {czk((trh - smluvniNajem) * 12)}</span>
                              : r > 8 ? <span className="font-medium text-warn">{pct(r, 0)} nad trhem</span>
                              : <span className="font-medium text-good">odpovídá trhu</span>}
                          </p>
                        )}
                      </div>
                    );
                  })()}
                  {smluvniNajem <= 0 && <p className="mt-2 text-sm text-ink-secondary">Zatím nepronajato</p>}
                  <div className="mt-3 flex flex-wrap items-center gap-x-2 text-xs text-ink-muted">
                    <span>{nejnovejsiNajem.sampleSize} nabídek · {dateCz(nejnovejsiNajem.date)}</span>
                    {zmenaProcent(vyvojNajmu) != null && (
                      <span className={zmenaProcent(vyvojNajmu)! >= 0 ? "text-good" : "text-bad"}>
                        {zmenaProcent(vyvojNajmu)! >= 0 ? "▲" : "▼"} {pct(Math.abs(zmenaProcent(vyvojNajmu)!), 1)} od {vyvojNajmu[0].datum}
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <p className="mt-2 text-sm text-ink-secondary">
                  Odhad zatím nevznikl. Zapni sledování trhu a zařaď nabídky na stránce Ocenění a trh.
                </p>
              )}
            </div>
          </div>

          {/* Hlavní číslo pro pronajímanou nemovitost: kolik měsíčně skutečně zbývá a kolik to je z investice */}
          {smluvniNajem > 0 && a.totalInvestment > 0 && (() => {
            const odhad = !skutecnyCashflow;
            const mesicne = skutecnyCashflow ? skutecnyCashflow.mesicne : a.metrics.cashFlowAnnual / 12;
            const procento = ((mesicne * 12) / a.totalInvestment) * 100;
            return (
              <div className={`rounded-card border p-5 ${mesicne >= 0 ? "border-good/30 bg-good/5" : "border-bad/30 bg-bad/5"}`}>
                <div className="label">Čistý měsíční příjem</div>
                <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span className={`text-4xl font-semibold tabular-nums tracking-tight ${mesicne >= 0 ? "text-good" : "text-bad"}`}>{czk(mesicne)}</span>
                  <span className="text-lg font-medium tabular-nums">{pct(procento)} ročně z investice {czkCompact(a.totalInvestment)}</span>
                </div>
                <p className="mt-2 text-xs text-ink-secondary">
                  {odhad
                    ? "Zatím žádné pohyby, proto jen odhad ze smluv a nákladů. Skutečné číslo vznikne ze záložky Stav účtu."
                    : skutecnyCashflow.neuplny
                      ? "Zatím z pohybů za neúplný první měsíc."
                      : `Průměr za posledních ${skutecnyCashflow.mesicu} dokončených měsíců: nájem, zálohy, platby za služby a ostatní pohyby. U plateb se bere předpis, u zaplacených skutečná částka.`}
                </p>
                {skutecnyCashflow?.rozpad && <RozpadToku rozpad={skutecnyCashflow.rozpad} podil={podil} podilSplatek={podilSplatek} />}
                {/* Druhy radek: rozbehnuty mesic podle splatnosti, at je videt, jak si stoji ted */}
                {!odhad && tentoMesic.pocet > 0 && (() => {
                  const v = mujTok(tentoMesic);
                  return (
                    <div className="mt-4 border-t border-line/70 pt-3">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="label">Tento měsíc · {new Date().toLocaleDateString("cs-CZ", { month: "long", year: "numeric" })}</span>
                        <span className={`text-2xl font-semibold tabular-nums tracking-tight ${v >= 0 ? "text-good" : "text-bad"}`}>{czk(v)}</span>
                      </div>
                      <p className="mt-1 text-xs text-ink-secondary">Platby se splatností v tomto měsíci (zaplacené i zatím jen předepsané) a pohyby z tohoto měsíce.</p>
                      <RozpadToku rozpad={tentoMesic.rozpad} podil={podil} podilSplatek={podilSplatek} />
                    </div>
                  );
                })()}
              </div>
            );
          })()}

          {/* Vývoj trhu v čase */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Vývoj tržního nájmu">
              {vyvojNajmu.length > 1
                ? <VyvojChart data={vyvojNajmu} nazev="Tržní nájem"
                    reference={smluvniNajem > 0 ? { hodnota: smluvniNajem, popisek: "tvůj nájem" } : undefined} />
                : <p className="py-6 text-center text-sm text-ink-muted">Graf vznikne, jakmile bude aspoň druhý odhad. Sken běží každou noc.</p>}
            </Card>
            <Card title="Vývoj odhadní hodnoty">
              {vyvojHodnoty.length > 1
                ? <VyvojChart data={vyvojHodnoty} nazev="Odhadní hodnota" kompaktni />
                : <p className="py-6 text-center text-sm text-ink-muted">Graf vznikne, jakmile bude aspoň druhé ocenění.</p>}
            </Card>
          </div>

          {/* Výkonnost a kondice vedle sebe — čísla i verdikt na jedné obrazovce */}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="grid grid-cols-2 gap-3 content-start">
              <Stat label="IRR od pořízení" term="irr" value={a.irr != null ? pct(a.irr) : "—"}
                sub={a.estimatedYears.length ? `${a.estimatedYears.length} let odhadnuto z modelu` : "Ze skutečných toků"}
                tone={(a.irr ?? 0) >= 5 ? "good" : "neutral"} />
              {(() => {
                // Skutecne cash flow z plateb a pohybu; odhad ze smluv jen dokud zadne nejsou
                const rocne = skutecnyCashflow ? skutecnyCashflow.mesicne * 12 : a.metrics.cashFlowAnnual;
                return (
                  <Stat label="Cash flow / rok" term="cashFlow" value={czkCompact(rocne)}
                    sub={`${czk(rocne / 12)} měsíčně · ${skutecnyCashflow ? "skutečné" : "odhad ze smluv"}`}
                    tone={rocne >= 0 ? "good" : "bad"} />
                );
              })()}
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
            obsah: (<>
            <SbalitelnaKarta klic="najem" title="Nájem a nájemci">
              <LeaseManager typy={typy} najemci={najemciVyber} dokumenty={dokumentyPodleSmlouvy} diskPripojen={diskPripojen} propertyId={property.id} leases={property.leases}
                nemovitost={{ nazev: property.name, adresa: `${property.street}, ${property.zip} ${property.city}` }}
                pronajimatele={Object.fromEntries(Object.entries(pronajimatelPodleSmlouvy).map(([k, p]) => [k, p ? { ...p, ucet: null } : null]))}
                stranyVyber={stranyVyber} vychoziPronajimatel={pronajimatelVyuct?.name ?? null} canEdit={user.role === "OWNER"}
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
          // Stavy meraku (predavaci protokol) maji vlastni stranku
          { id: "meraky", nazev: "Měřáky", odkaz: `/properties/${property.id}/meraky` },
          {
            id: "sluzby",
            nazev: "Služby",
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
            obsah: (<>
            <SbalitelnaKarta klic="vyuctovani-sluzeb" title="Vyúčtování služeb od dodavatelů">
              <VyuctovaniSluzeb typy={typy} dokumenty={dokumentyVyuctovani} diskPripojen={diskPripojen} services={property.services.map((sl) => ({ id: sl.id, type: sl.type, provider: sl.provider, chargedToTenant: sl.chargedToTenant, groupName: sl.groupName, notes: sl.notes, merak: sl.merak,
                od: sl.contractStart ? iso(new Date(sl.contractStart)) : null, do: sl.activeTo ? iso(new Date(sl.activeTo)) : null }))}
                leases={najmyVyuctovani} vyuctovani={vyuctovani} canEdit={user.role === "OWNER"} meraky={merakyVyuctovani} />
            </SbalitelnaKarta>
            {jeMajitel && (
              <SbalitelnaKarta klic="vyuctovani-najemce" title="Vyúčtování pro nájemce"
                shrnuti={vydana.length ? `${vydana.length} vydaných` : undefined}>
                <VyuctovaniNajemceKarta
                  nemovitost={{ nazev: property.name, adresa: `${property.street}, ${property.zip} ${property.city}` }}
                  najmy={najmyProNajemce} sluzby={sluzbyVyuctovani}
                  vydana={vydana} canEdit diskPripojen={diskPripojen}
                  platby={navrhPlateb.filter((p) => p.druh === "ZALOHA").map((p) => ({ klic: p.klic, mesic: p.mesic, castka: p.castka, zaplaceno: p.zaplaceno ?? null }))} />
              </SbalitelnaKarta>
            )}
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
              <LoanManager propertyId={property.id} loans={property.loans} canEdit={user.role === "OWNER"}
                lide={uzivatele.map((u) => ({ id: u.id, name: u.name }))} vlastniciNemovitosti={property.owners.map((o) => o.userId)} />
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
            nazev: "Stav účtu",
            obsah: (<>
          <div className="mb-3 space-y-3">
            <StatGrid>
              <Stat label="Na účtu" value={czk(naUctu)} tone={naUctu >= 0 ? "good" : "bad"}
                sub="součet všech pohybů a zaplacených pravidelných plateb" />
              <Stat label="Příjmy celkem" value={czk(souctyPohybu.prijmy)} tone="good" />
              <Stat label="Výdaje celkem" value={czk(souctyPohybu.vydaje)} />
              <Stat label={`Výsledek ${letos}`} value={czk(souctyPohybu.letos)} tone={souctyPohybu.letos >= 0 ? "good" : "bad"}
                sub="příjmy minus výdaje letos" />
            </StatGrid>
            {(dluhyPlateb.najemciDluzi > 0 || dluhyPlateb.dluzimDodavatelum > 0) && (
              <StatGrid>
                <Stat label="Nájemci dluží" value={czk(dluhyPlateb.najemciDluzi)} tone={dluhyPlateb.najemciDluzi > 0 ? "bad" : "good"} />
                <Stat label="Dlužím dodavatelům" value={czk(dluhyPlateb.dluzimDodavatelum)} tone={dluhyPlateb.dluzimDodavatelum > 0 ? "bad" : "good"} />
                <Stat label="Po vyrovnání dluhů" value={czk(naUctu + dluhyPlateb.najemciDluzi - dluhyPlateb.dluzimDodavatelum)}
                  sub="kolik by bylo na účtu, kdyby se vše zaplatilo" />
              </StatGrid>
            )}
          </div>
          <SbalitelnaKarta klic="pravidelne-platby" title="Pravidelné platby"
            shrnuti={navrhPlateb.filter((p) => p.stav === "nezaplaceno").length
              ? `${navrhPlateb.filter((p) => p.stav === "nezaplaceno").length} nezaplaceno`
              : navrhPlateb.length ? "vše zaplaceno" : undefined}>
            <PravidelnePlatby propertyId={property.id} navrh={navrhPlateb} zauctovane={zauctovanePlatby} canDelete={user.role === "OWNER"} />
          </SbalitelnaKarta>
          <SbalitelnaKarta klic="pohyby" title="Pohyby">
            <TransactionManager propertyId={property.id} transactions={recentTx} canEdit={user.role === "OWNER"} />
          </SbalitelnaKarta>
            </>),
          },
          // Trh ma vlastni stranku (ocenění, nabídky, mapa) — záložka na ni vede rovnou
          // Jedina zalozka s upozornenim: na trhu ceka neco ke schvaleni
          { id: "trh", nazev: "Trh", odkaz: `/properties/${property.id}/trh`, pocet: ceka.trh || undefined, varovani: ceka.trh > 0 },
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

/** Stitky s rozpadem cash flow po zdrojich (najem, zalohy, sluzby, uver...). */
function RozpadToku({ rozpad, podil, podilSplatek }: { rozpad: Record<string, number>; podil: number; podilSplatek: number }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2 text-xs">
      {([["NAJEM", "Nájem"], ["ZALOHA", "Zálohy od nájemce"], ["SLUZBA", "Služby dodavatelům"], ["UVER", "Splátky úvěru"], ["VYUCTOVANI", "Vyúčtování"], ["POHYB", "Ostatní pohyby"]] as const)
        .filter(([k]) => Math.abs(rozpad[k] ?? 0) >= 1)
        .map(([k, n]) => {
          const v = rozpad[k] * (k === "UVER" ? podilSplatek : podil);
          return (
            <span key={k} className="rounded-full bg-surface-card/70 px-2.5 py-1">
              {n}: <strong className={v >= 0 ? "text-good" : "text-bad"}>{v > 0 ? "+" : ""}{czk(v)}</strong>
            </span>
          );
        })}
    </div>
  );
}

function valuationSourceLabel(s: string): string {
  return { MANUAL: "ruční", EXPERT: "znalec", MARKET_SCAN: "sken trhu", VYBER: "vybrané nabídky", INDEX: "index", PURCHASE_PRICE: "pořizovací cena" }[s] ?? s;
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
