import Link from "next/link";
import { page } from "@/lib/guard";
import { Nav } from "@/components/Nav";
import { Verze } from "@/components/Verze";
import { Badge, Card, Stat, StatGrid } from "@/components/Stat";
import { PorovnaniPojistek } from "@/components/PorovnaniPojistek";
import { prisma } from "@/lib/db";
import { czk } from "@/lib/format";
import { DRUHY_POJISTKY, FREKVENCE, RIZIKA, type Frekvence, type Riziko } from "@/lib/pojistky";
import { aiPojistkyNastaveno, type RozborPojistky } from "@/lib/pojistkaAi";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Rizika, ktera se porovnavaji napric nemovitostmi */
const SLOUPCE: Riziko[] = ["POVODEN", "VODA_Z_POTRUBI", "ODPOVEDNOST", "ODPOVEDNOST_NAJEMCI", "ZTRATA_NAJEMNEHO"];

/** Pojisteni vsech nemovitosti: kde chybi, kolik stoji, pojistna castka proti hodnote, kryti hlavnich rizik. */
export default async function PojisteniPrehled() {
  const user = await page();
  const dnes = new Date();
  const byty = await prisma.property.findMany({
    where: { status: { not: "SOLD" } }, orderBy: { name: "asc" },
    include: { pojistky: { where: { od: { lte: dnes }, OR: [{ do: null }, { do: { gte: dnes } }] } }, valuations: { orderBy: { date: "desc" }, take: 1 } },
  });
  type Radek = { b: (typeof byty)[number]; hodnota: number | null; p: (typeof byty)[number]["pojistky"][number] | null };
  const radky: Radek[] = byty.flatMap((b): Radek[] => {
    const hodnota = b.valuations[0]?.value ?? b.purchasePrice ?? null;
    if (!b.pojistky.length) return [{ b, hodnota, p: null }];
    return b.pojistky.map((p) => ({ b, hodnota, p }));
  });
  const bez = byty.filter((b) => !b.pojistky.length);
  const rocne = byty.flatMap((b) => b.pojistky).reduce((a, p) => a + p.castka * (FREKVENCE[p.frekvence as Frekvence]?.zaRok ?? 1), 0);
  const problem = byty.flatMap((b) => b.pojistky).filter((p) => (p.ai as RozborPojistky | null)?.hodnoceni?.stav === "PROBLEM").length;

  return (
    <>
      <Nav user={user} verze={<Verze />} />
      <main className="mx-auto max-w-[1400px] space-y-5 p-4 sm:p-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pojištění</h1>
          <p className="mt-1 text-sm text-ink-secondary">Platné pojistky všech nemovitostí — co stojí, na kolik jsou pojištěné a co kryjí (podle rozboru smlouvy AI).</p>
        </div>
        <StatGrid>
          <Stat label="Pojistné ročně" value={czk(rocne)} />
          <Stat label="Bez pojištění" value={String(bez.length)} tone={bez.length ? "bad" : "good"} sub={bez.map((b) => b.name).join(", ") || "vše pojištěno"} />
          <Stat label="Problém podle AI" value={String(problem)} tone={problem ? "bad" : "good"} />
        </StatGrid>
        <Card title="Pojistky">
          <div className="table-scroll">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Nemovitost</th><th>Pojistka</th><th className="num">Ročně</th><th className="num">Pojistná částka</th>
                  {SLOUPCE.map((r) => <th key={r} className="text-center text-[11px]" title={RIZIKA[r]}>{RIZIKA[r].split(" ")[0].replace(",", "")}</th>)}
                  <th>AI</th>
                </tr>
              </thead>
              <tbody>
                {radky.map(({ b, hodnota, p }) => {
                  const ai = (p?.ai as RozborPojistky | null) ?? null;
                  const kryti = p?.pojistnaCastka && hodnota ? p.pojistnaCastka / hodnota : null;
                  return (
                    <tr key={`${b.id}:${p?.id ?? "-"}`} className={!p ? "bg-bad/5" : undefined}>
                      <td><Link href={`/properties/${b.id}/pojisteni`} className="font-medium hover:text-accent">{b.name}</Link></td>
                      {!p ? <td colSpan={4 + SLOUPCE.length} className="font-medium text-bad">Chybí pojištění</td> : (
                        <>
                          <td>{p.pojistovna}<span className="block text-xs text-ink-muted">{DRUHY_POJISTKY[p.druh] ?? p.druh}</span></td>
                          <td className="num">{czk(p.castka * (FREKVENCE[p.frekvence as Frekvence]?.zaRok ?? 1))}</td>
                          <td className="num">{p.pojistnaCastka ? czk(p.pojistnaCastka) : "—"}
                            {kryti != null && <span className={`block text-xs ${kryti < 0.6 ? "text-bad" : kryti < 0.85 ? "text-warn" : "text-ink-muted"}`}>{Math.round(kryti * 100)} % hodnoty</span>}</td>
                          {SLOUPCE.map((r) => {
                            const x = ai?.rizika.find((y) => y.riziko === r);
                            return <td key={r} className={`text-center font-semibold ${x?.kryto === "ANO" ? "text-good" : x?.kryto === "NE" ? "text-bad" : "text-ink-muted"}`}>{!x ? "·" : x.kryto === "ANO" ? "✓" : x.kryto === "NE" ? "✗" : "?"}</td>;
                          })}
                          <td>{ai ? <Badge tone={ai.hodnoceni.stav === "OK" ? "good" : ai.hodnoceni.stav === "POZOR" ? "warn" : "bad"}>{ai.hodnoceni.stav === "OK" ? "OK" : ai.hodnoceni.stav === "POZOR" ? "pozor" : "problém"}</Badge> : <span className="text-xs text-ink-muted">nerozebráno</span>}</td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-ink-muted">✓ kryto · ✗ nekryto · ? nejasné · · smlouva zatím nerozebraná AI. Sloupce: {SLOUPCE.map((r) => RIZIKA[r]).join(", ")}.</p>
        </Card>
        {user.role === "OWNER" && (
          <Card title="Porovnání napříč nemovitostmi">
            <PorovnaniPojistek aiZapnuto={aiPojistkyNastaveno()} />
          </Card>
        )}
      </main>
    </>
  );
}
