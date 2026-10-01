import Link from "next/link";
import { redirect } from "next/navigation";
import { page } from "@/lib/guard";
import { Nav } from "@/components/Nav";
import { Verze } from "@/components/Verze";
import { Card, Stat, StatGrid } from "@/components/Stat";
import { DataTransfer } from "@/components/DataTransfer";
import { ProvozovateleManager } from "@/components/ProvozovateleManager";
import { GoogleDiskKarta } from "@/components/GoogleDiskKarta";
import { Dokumenty } from "@/components/Dokumenty";
import { jeNastaveno, odkazNaSlozku } from "@/lib/googleDrive";
import { headers } from "next/headers";
import { DruhySluzebManager } from "@/components/DruhySluzebManager";
import { nactiTypySluzeb } from "@/lib/typySluzeb";
import { UklidDat } from "@/components/UklidDat";
import { TestMapy } from "@/components/TestMapy";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Sprava — co se nepouziva denne, ale obcas je potreba: uzivatele, provoz
 * skenu a udrzba dat. Drzime to pohromadě a mimo hlavni menu, at nestini
 * tomu, kvuli cemu se do aplikace chodi.
 */
export default async function SpravaPage({ searchParams }: { searchParams: Promise<{ google?: string }> }) {
  const user = await page();
  if (user.role !== "OWNER") redirect("/");

  const [uzivatelu, nemovitosti, oceneni, najmy, nabidky, skeny, rucni, vyrazenych, poslendiBeh] = await Promise.all([
    prisma.user.count(),
    prisma.property.count(),
    prisma.valuation.count({ where: { source: "MARKET_SCAN" } }),
    prisma.rentEstimate.count({ where: { source: "MARKET_SCAN" } }),
    prisma.marketListing.count(),
    prisma.marketScan.count(),
    prisma.valuation.count({ where: { source: { not: "MARKET_SCAN" } } }),
    prisma.excludedListing.count(),
    prisma.scanRun.findFirst({ orderBy: { startedAt: "desc" }, select: { startedAt: true, status: true } }),
  ]);

  const { google } = await searchParams;
  const spojeni = await prisma.googleConnection.findUnique({ where: { id: "main" } });
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const zkusebni = spojeni
    ? await prisma.dokument.findMany({ where: { kategorie: "OSTATNI" }, orderBy: { createdAt: "desc" }, take: 20 })
    : [];
  const provozovateleDb = await prisma.operator.findMany({
    orderBy: { name: "asc" }, include: { _count: { select: { properties: true } } },
  });
  const typy = await nactiTypySluzeb();
  const pouziti = Object.fromEntries(
    (await prisma.service.groupBy({ by: ["type"], _count: { _all: true } })).map((g) => [g.type, g._count._all]),
  );

  return (
    <>
      <Nav user={user} verze={<Verze />} />
      <main className="mx-auto max-w-[1400px] space-y-4 px-6 py-6">
        <div>
          <h1 className="text-xl font-semibold">Správa</h1>
          <p className="mt-1 text-sm text-ink-secondary">
            Účty, provoz skenů a údržba dat. Věci, které nepotřebuješ denně.
          </p>
        </div>

        <StatGrid>
          <Stat label="Uživatelé" value={uzivatelu} sub="účtů s přístupem" />
          <Stat label="Nemovitosti" value={nemovitosti} sub="v portfoliu" />
          <Stat label="Nabídky z trhu" value={nabidky} sub={`z ${skeny} skenů`} />
          <Stat label="Poslední sken"
            value={poslendiBeh ? poslendiBeh.startedAt.toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" }) : "nikdy"}
            sub={poslendiBeh?.status === "SELHALO" ? "selhal" : poslendiBeh ? "v pořádku" : "zatím neproběhl"}
            tone={poslendiBeh?.status === "SELHALO" ? "bad" : poslendiBeh ? "good" : "warn"} />
        </StatGrid>

        <Card title="Provozovatelé nemovitostí">
          <p className="mb-3 text-sm text-ink-secondary">
            Provozovatel je pronajímatel na nájemních smlouvách, evidenčním listu a vyúčtování. Nemusí být vlastník:
            vlastníci s podíly se nastavují u nemovitosti a každý vlastník vidí své portfolio. Provozovatele vybereš u nemovitosti.
          </p>
          <ProvozovateleManager provozovatele={provozovateleDb.map((o) => ({
            id: o.id, name: o.name, street: o.street, city: o.city, zip: o.zip, ico: o.ico, dic: o.dic,
            email: o.email, phone: o.phone, account: o.account, notes: o.notes, pouzito: o._count.properties,
          }))} />
        </Card>

        <Card title="Google Disk — úložiště dokumentů">
          <GoogleDiskKarta
            nastaveno={jeNastaveno()}
            pripojeno={spojeni ? { email: spojeni.email, rootUrl: odkazNaSlozku(spojeni.rootFolderId), kdy: spojeni.connectedAt.toISOString() } : null}
            redirectUri={`${proto}://${host}/api/google/callback`}
            vysledek={google ?? null}
          />
          {spojeni && (
            <div className="mt-4 border-t border-line pt-4">
              <h3 className="mb-2 text-sm font-semibold">Vyzkoušet nahrávání</h3>
              <Dokumenty kontext={{ kategorie: "OSTATNI" }} dokumenty={zkusebni} canEdit
                nadpis="Nahrát do složky Ostatní"
                popis="Přetáhni sem libovolný soubor. Uloží se do F(a)latMonitoring / Ostatní na Disku."
                prazdne="Zatím nic nenahráno." />
            </div>
          )}
        </Card>

        <Card title="Druhy služeb">
          <p className="mb-3 text-sm text-ink-secondary">
            Přejmenuj druh, změň ikonu, nebo přidej vlastní. Označení „přeúčtovat“ jen předvyplní novou službu.
            Číslo vpravo je, kolik služeb druh používá; smazat jde jen nepoužívaný.
          </p>
          <DruhySluzebManager typy={typy} pouziti={pouziti} />
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Nájemníci" action={<Link href="/najemnici" className="text-xs text-accent">Otevřít →</Link>}>
            <p className="text-sm text-ink-secondary">
              Databáze nájemníků s jednoznačným číslem. Jeden člověk je jeden záznam, i když má smluv víc.
            </p>
          </Card>
          <Card title="Uživatelé" action={<Link href="/users" className="text-xs text-accent">Otevřít →</Link>}>
            <p className="text-sm text-ink-secondary">
              Účty majitele a partnera, hesla a role. Partner vidí portfolio jen ke čtení.
            </p>
          </Card>

          <Card title="Provoz" action={<Link href="/provoz" className="text-xs text-accent">Otevřít →</Link>}>
            <p className="text-sm text-ink-secondary">
              Co se skenovalo, kdy a jak to dopadlo. Sem se podívej, když odhad chybí
              nebo vypadá divně.
            </p>
          </Card>
        </div>

        <Card title="Úklid dat z trhu">
          <UklidDat pocty={{ oceneni, najmy, nabidky, skeny, rucni, vyrazene: vyrazenych }} />
        </Card>

        <Card title="Nastavení prostředí">
          <Prostredi />
        </Card>

        <Card title="Záloha a obnova">
          <DataTransfer />
        </Card>
      </main>
    </>
  );
}

/**
 * Prehled promennych prostredi. Vypisuje jen jestli hodnota existuje, nikdy
 * samotnou hodnotu — jde o pripojovaci retezce a klice.
 */
function Prostredi() {
  const promenne = [
    {
      nazev: "DATABASE_URL",
      nastaveno: Boolean(process.env.DATABASE_URL),
      k: "Připojení k databázi. Bez ní aplikace vůbec nenaběhne.",
    },
    {
      nazev: "AUTH_SECRET",
      nastaveno: Boolean(process.env.AUTH_SECRET),
      k: "Podpis přihlašovací cookie. Bez něj se nelze přihlásit.",
    },
    {
      nazev: "MAPY_API_KEY",
      nastaveno: Boolean(process.env.MAPY_API_KEY),
      k: "Našeptávač adres a mapové dlaždice. Bez klíče jde adresu vyplnit ručně, ale mapa zůstane prázdná.",
    },
  ];

  return (
    <div className="space-y-2">
      {promenne.map((p) => (
        <div key={p.nazev} className="flex flex-wrap items-start justify-between gap-2 border-b border-line pb-2 last:border-0 last:pb-0">
          <div className="min-w-0">
            <div className="font-mono text-sm">{p.nazev}</div>
            <p className="text-xs text-ink-secondary">{p.k}</p>
          </div>
          <span className={`shrink-0 text-xs font-medium ${p.nastaveno ? "text-good" : "text-warn"}`}>
            {p.nastaveno ? "✓ nastaveno" : "! chybí"}
          </span>
        </div>
      ))}
      <TestMapy />
      <p className="text-xs text-ink-muted">
        Hodnoty se tady nikdy nezobrazují — jen to, jestli existují. Mění se ve Vercelu
        v Settings → Environment Variables a pro noční sken v GitHubu v Settings → Secrets.
      </p>
    </div>
  );
}
