import { page } from "@/lib/guard";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { Verze } from "@/components/Verze";
import { Badge, Card, Empty, Stat, StatGrid } from "@/components/Stat";
import { prisma } from "@/lib/db";
import { nazevNemovitosti } from "@/lib/catalogs";

export const dynamic = "force-dynamic";

const SPOUSTE: Record<string, string> = {
  CRON_NOCNI: "Noční sken",
  // Zaznamy z doby, kdy skeny bezely dva — v deniku porad jsou
  CRON_NAJEM: "Noční sken nájmů",
  CRON_TRH: "Měsíční sken trhu",
  RUCNI: "Ruční spuštění",
};

/** Kdy má co běžet — proti tomu se pozná výpadek. */
const PLAN = [
  { trigger: "CRON_NOCNI", popis: "každý den ve 3:40", tolerance: 36 },
];

function hodinOd(d: Date) {
  return (Date.now() - d.getTime()) / 36e5;
}

function cas(d: Date) {
  return d.toLocaleString("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default async function ProvozPage() {
  const user = await page();
  // Deník je provozní věc — partnerovi s právem jen ke čtení není k ničemu
  if (user.role !== "OWNER") redirect("/");

  const behy = await prisma.scanRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 200,
  });

  const stav = PLAN.map((p) => {
    const posledni = behy.find((b) => b.trigger === p.trigger);
    const stari = posledni ? hodinOd(posledni.startedAt) : null;
    return {
      ...p,
      posledni,
      // Bez záznamu nevíme, jestli to neběželo nebo jen neexistuje historie
      zpozdeno: stari != null && stari > p.tolerance,
    };
  });

  // Seskupení po dnech — v deníku se hledá "co bylo v noci", ne konkrétní řádek
  const dny = new Map<string, typeof behy>();
  for (const b of behy) {
    const klic = b.startedAt.toLocaleDateString("cs-CZ", { day: "numeric", month: "long", year: "numeric" });
    dny.set(klic, [...(dny.get(klic) ?? []), b]);
  }

  const dnes = behy.filter((b) => hodinOd(b.startedAt) < 24);
  const selhalo = dnes.filter((b) => b.status === "SELHALO").length;

  return (
    <>
      <Nav user={user} verze={<Verze />} />
      <main className="mx-auto max-w-[1400px] space-y-4 px-6 py-6">
        <div>
          <h1 className="text-xl font-semibold">Provoz</h1>
          <p className="mt-1 text-sm text-ink-secondary">
            Co se skenovalo, kdy a jak to dopadlo. Záznamy starší 90 dnů se odklízejí samy.
          </p>
        </div>

        <StatGrid>
          {stav.map((s) => (
            <Stat
              key={s.trigger}
              label={SPOUSTE[s.trigger]}
              value={s.posledni ? cas(s.posledni.startedAt) : "nikdy"}
              sub={s.posledni
                ? `naplánováno ${s.popis}`
                : `naplánováno ${s.popis} — zatím nikdy neproběhl`}
              tone={!s.posledni || s.zpozdeno ? "warn" : "good"}
            />
          ))}
          <Stat label="Za posledních 24 h" value={`${dnes.length} skenů`}
            sub={selhalo > 0 ? `${selhalo} selhalo` : "bez chyb"}
            tone={selhalo > 0 ? "bad" : "good"} />
        </StatGrid>

        {stav.some((s) => s.zpozdeno) && (
          <p className="rounded-lg bg-warn/10 px-3 py-2.5 text-sm text-warn">
            Některý ze skenů neběžel déle, než má. Zkontroluj v GitHubu záložku <strong>Actions</strong> —
            nejčastější příčina je chybějící nebo propadlý přístup k databázi.
          </p>
        )}

        {behy.length === 0 ? (
          <Card title="Deník">
            <Empty>
              Zatím žádný záznam. Deník se plní při každém skenu — spusť sken ručně
              u nemovitosti nebo počkej na noční běh.
            </Empty>
          </Card>
        ) : (
          [...dny.entries()].map(([den, radky]) => (
            <Card key={den} title={den} action={
              <span className="text-xs text-ink-muted">{radky.length} skenů</span>
            }>
              <div className="table-scroll">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Čas</th><th>Nemovitost</th><th>Co</th>
                      <th className="num">Nabídek</th><th className="num">Okruh</th><th>Výsledek</th>
                    </tr>
                  </thead>
                  <tbody>
                    {radky.map((b) => (
                      <tr key={b.id}>
                        <td className="whitespace-nowrap tabular-nums text-ink-secondary">
                          {b.startedAt.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}
                          {b.finishedAt && (
                            <span className="ml-1.5 text-xs text-ink-muted">
                              {Math.round((b.finishedAt.getTime() - b.startedAt.getTime()) / 1000)} s
                            </span>
                          )}
                        </td>
                        <td className="min-w-0">
                          {b.propertyId
                            ? <Link href={`/properties/${b.propertyId}`} className="text-accent hover:underline">{b.propertyName}</Link>
                            : b.propertyName}
                          <span className="block text-xs text-ink-muted">
                            {b.city} · {nazevNemovitosti(b.category)}
                          </span>
                        </td>
                        <td className="whitespace-nowrap text-xs text-ink-secondary">
                          {b.dealType === "SALE" ? "prodejní ceny" : "nájmy"}
                          <span className="block text-ink-muted">{SPOUSTE[b.trigger] ?? b.trigger}</span>
                        </td>
                        <td className="num tabular-nums">{b.listingsFound}</td>
                        <td className="num tabular-nums text-ink-secondary">
                          {b.okruhKm != null ? `${b.okruhKm} km` : "—"}
                        </td>
                        <td>
                          <Badge tone={b.status === "OK" ? "good" : b.status === "PRAZDNY" ? "warn" : "bad"}>
                            {b.status === "OK" ? "hotovo" : b.status === "PRAZDNY" ? "bez dat" : "selhalo"}
                          </Badge>
                          {(b.result || b.message) && (
                            <span className="ml-2 text-xs text-ink-secondary">{b.message ?? b.result}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))
        )}
      </main>
    </>
  );
}
