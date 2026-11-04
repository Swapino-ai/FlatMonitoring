import { redirect } from "next/navigation";
import { page } from "@/lib/guard";
import { Nav } from "@/components/Nav";
import { Verze } from "@/components/Verze";
import { BankaPohyby, type CileNemovitosti, type PohybRadek } from "@/components/BankaPohyby";
import { prisma } from "@/lib/db";
import { fioNastaveno } from "@/lib/fio";
import { denISO } from "@/lib/format";
import { nactiNavrhyPortfolia } from "@/lib/pravidelnePlatbyData";
import { skupinySluzeb } from "@/lib/parovani";
import { CATEGORIES } from "@/lib/categories";

export const dynamic = "force-dynamic";

/** Pohyby na bankovnim uctu (Fio) a jejich parovani na najem, zalohy a vyuctovani. */
export default async function BankaPage() {
  const user = await page();
  if (user.role !== "OWNER") redirect("/");
  const [keKontrole, sparovane, smlouvy, pocty, kratkodobe] = await Promise.all([
    prisma.bankovniPohyb.findMany({ where: { stav: "KE_KONTROLE" }, orderBy: { datum: "desc" } }),
    prisma.bankovniPohyb.findMany({ where: { stav: "SPAROVANO" }, orderBy: { datum: "desc" }, take: 50 }),
    prisma.lease.findMany({ include: { property: { select: { name: true } } }, orderBy: [{ isActive: "desc" }, { startDate: "desc" }] }),
    prisma.bankovniPohyb.groupBy({ by: ["stav"], _count: true }),
    // Byty s krátkodobým pronájmem: výplaty z Airbnb / Booking jdou přiřadit jako jejich příjem
    prisma.property.findMany({ where: { kratkodobe: { some: {} } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  // Cile parovani po nemovitostech: najemci (prichozi), nezaplacene predpisy a vratky (odchozi),
  // jiny prijem / vydaj podle kategorie (stejne kategorie jako na strance Pohyby)
  const nemovitosti = keKontrole.length ? await prisma.property.findMany({
    where: { status: { not: "SOLD" } }, select: { id: true, name: true, street: true, city: true, kratkodobe: { select: { id: true } } }, orderBy: { name: "asc" },
  }) : [];
  const navrhy = keKontrole.some((p) => p.castka < 0) ? await nactiNavrhyPortfolia(nemovitosti) : new Map();
  const odDne = denISO(new Date(Date.now() - 400 * 86400000)).slice(0, 7);
  const vratky = keKontrole.some((p) => p.castka < 0) ? await prisma.tenantStatement.findMany({ where: { status: { in: ["VYDANO", "ODESLANO"] }, result: { gt: 0 } }, select: { id: true, cislo: true, result: true, snapshot: true, propertyId: true } }) : [];
  const cile: CileNemovitosti[] = nemovitosti.map((n) => ({
    id: n.id, nazev: n.name, adresa: [n.street, n.city].filter(Boolean).join(", "), kratkodoby: n.kratkodobe.length > 0,
    smlouvy: smlouvy.filter((s) => s.propertyId === n.id).map((s) => ({ id: s.id, nazev: `${s.tenantName}${s.isActive ? "" : " (skončená)"}` })),
    predpisy: (navrhy.get(n.id) ?? [])
      .filter((x: { castka: number; stav: string; mesic: string }) => x.castka < 0 && x.stav === "nezaplaceno" && x.mesic >= odDne)
      .map((x: { klic: string; popis: string; mesic: string; castka: number }) => ({ cil: `predpis:${n.id}:${x.klic}`, nazev: `${x.popis} · ${Number(x.mesic.slice(5))}/${x.mesic.slice(0, 4)} · ${Math.round(-x.castka).toLocaleString("cs-CZ")} Kč` })),
    skupiny: skupinySluzeb(navrhy.get(n.id) ?? []).filter((g) => g.mesic >= odDne).map((g) => ({
      cil: `skupina:${n.id}:${g.mesic}:${g.dodavatel}`,
      nazev: `${g.dodavatel} · ${Number(g.mesic.slice(5))}/${g.mesic.slice(0, 4)} · ${Math.round(g.castka).toLocaleString("cs-CZ")} Kč`,
      detail: g.polozky.map((x) => x.popis.replace(/ \d{2}\/\d{4}$/, "")).join(", "),
    })),
    vratky: vratky.filter((v) => v.propertyId === n.id).map((v) => ({ cil: `vratka:${v.id}`, nazev: `Vrácení přeplatku ${v.cislo} · ${(v.snapshot as { najemce?: { name?: string } })?.najemce?.name ?? ""} · ${Math.round(v.result).toLocaleString("cs-CZ")} Kč` })),
  }));
  const kategorie = {
    prijmy: CATEGORIES.filter((c) => c.kind === "INCOME" && c.key !== "KT_PRIJEM").map((c) => ({ key: c.key, label: c.label })),
    vydaje: CATEGORIES.filter((c) => c.kind === "EXPENSE").map((c) => ({ key: c.key, label: c.label })),
  };
  const posledni = await prisma.bankovniPohyb.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  const nazevSmlouvy = (id: string | null) => {
    const s = smlouvy.find((x) => x.id === id);
    return s ? `${s.tenantName} · ${s.property.name}` : null;
  };
  const vsechnyByty = new Map((await prisma.property.findMany({ select: { id: true, name: true } })).map((x) => [x.id, x.name]));
  const nazevBytu = (p: { leaseId: string | null; propertyId: string | null; parovani: unknown }) => {
    const par = p.parovani as { kratkodoby?: string; vydaj?: string } | null;
    if (par?.kratkodoby) return `Krátkodobý pronájem · ${vsechnyByty.get(p.propertyId ?? "") ?? ""}`;
    if (par?.vydaj) return `${par.vydaj.startsWith("vratka:") ? "Vrácení přeplatku" : "Platba"} · ${vsechnyByty.get(p.propertyId ?? "") ?? ""}`;
    return nazevSmlouvy(p.leaseId);
  };
  const radek = (p: (typeof keKontrole)[number]) => ({
    id: p.id, datum: denISO(p.datum), castka: p.castka, protiucet: p.protiucet, nazevProtiuctu: p.nazevProtiuctu,
    vs: p.vs, zprava: p.zprava, poznamka: p.poznamka, navrhLeaseId: p.navrhLeaseId, propertyId: p.propertyId,
    navrhCil: p.navrhCil, mojePoznamka: p.mojePoznamka,
    smlouva: nazevBytu(p), parovani: p.parovani as PohybRadek["parovani"],
  });

  return (
    <>
      <Nav user={user} verze={<Verze />} />
      <main className="mx-auto max-w-[1100px] space-y-5 p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Banka</h1>
        <BankaPohyby
          napojeno={fioNastaveno()}
          posledniStazeni={posledni?.createdAt.toISOString() ?? null}
          pocty={Object.fromEntries(pocty.map((x) => [x.stav, x._count]))}
          keKontrole={keKontrole.map(radek)}
          sparovane={sparovane.map(radek)}
          smlouvy={smlouvy.map((s) => ({ id: s.id, nazev: `${s.tenantName} · ${s.property.name}${s.isActive ? "" : " (skončená)"}` }))}
          cile={cile} kategorie={kategorie}
          kategorieNazvy={Object.fromEntries(CATEGORIES.map((c) => [c.key, c.label]))}
          kratkodobe={kratkodobe.map((p) => ({ id: p.id, nazev: `Krátkodobý pronájem · ${p.name}` }))}
        />
      </main>
    </>
  );
}
