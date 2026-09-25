import Link from "next/link";
import { redirect } from "next/navigation";
import { page } from "@/lib/guard";
import { Nav } from "@/components/Nav";
import { Verze } from "@/components/Verze";
import { Card, Stat, StatGrid } from "@/components/Stat";
import { DataTransfer } from "@/components/DataTransfer";
import { UklidDat } from "@/components/UklidDat";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Sprava — co se nepouziva denne, ale obcas je potreba: uzivatele, provoz
 * skenu a udrzba dat. Drzime to pohromadě a mimo hlavni menu, at nestini
 * tomu, kvuli cemu se do aplikace chodi.
 */
export default async function SpravaPage() {
  const user = await page();
  if (user.role !== "OWNER") redirect("/");

  const [uzivatelu, nemovitosti, oceneni, najmy, nabidky, skeny, rucni, poslendiBeh] = await Promise.all([
    prisma.user.count(),
    prisma.property.count(),
    prisma.valuation.count({ where: { source: "MARKET_SCAN" } }),
    prisma.rentEstimate.count({ where: { source: "MARKET_SCAN" } }),
    prisma.marketListing.count(),
    prisma.marketScan.count(),
    prisma.valuation.count({ where: { source: { not: "MARKET_SCAN" } } }),
    prisma.scanRun.findFirst({ orderBy: { startedAt: "desc" }, select: { startedAt: true, status: true } }),
  ]);

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

        <div className="grid gap-4 lg:grid-cols-2">
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
          <UklidDat pocty={{ oceneni, najmy, nabidky, skeny, rucni }} />
        </Card>

        <Card title="Záloha a obnova">
          <DataTransfer />
        </Card>
      </main>
    </>
  );
}
