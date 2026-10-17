/** Casove rady pro grafy. */

import { balanceAt, sum } from "./finance";
import { denISO, monthCz } from "./format";
import type { NavrzenaPlatba } from "./pravidelnePlatby";
import type { PropertyWithRelations } from "./portfolio";

export interface EquityPoint { period: string; hodnota: number; dluh: number; equity: number }

/** Vyvoj trzni hodnoty a dluhu po ctvrtletich od prvniho nakupu. */
export function equitySeries(properties: PropertyWithRelations[], asOf = new Date()): EquityPoint[] {
  const active = properties.filter((p) => p.status !== "SOLD");
  if (active.length === 0) return [];

  const start = new Date(Math.min(...active.map((p) => new Date(p.purchaseDate).getTime())));
  const points: EquityPoint[] = [];

  const cursor = new Date(start.getFullYear(), Math.floor(start.getMonth() / 3) * 3, 1);
  while (cursor <= asOf) {
    const at = new Date(cursor);
    let hodnota = 0;
    let dluh = 0;

    for (const p of active) {
      if (new Date(p.purchaseDate) > at) continue;

      // Nejnovejsi ocenení k danemu datu, jinak porizovaci cena
      const val = p.valuations
        .filter((v) => new Date(v.date) <= at)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
      hodnota += val?.value ?? p.purchasePrice + p.acquisitionCosts + p.renovationCosts;

      for (const l of p.loans) {
        if (new Date(l.startDate) > at) continue;
        dluh += balanceAt({ ...l, startDate: new Date(l.startDate) }, at);
      }
    }

    points.push({
      period: `${at.getFullYear()} Q${Math.floor(at.getMonth() / 3) + 1}`,
      hodnota: Math.round(hodnota),
      dluh: Math.round(dluh),
      equity: Math.round(hodnota - dluh),
    });

    cursor.setMonth(cursor.getMonth() + 3);
  }

  return points.slice(-16);
}

/** Jeden skutecny penezni tok majitele (+ prijem, - vydaj). */
export interface Tok { datum: string; castka: number; kategorie: string; /** Zdroj: NAJEM, ZALOHA, SLUZBA, UVER, VYUCTOVANI nebo POHYB */ druh?: string }

/**
 * Skutecny cash flow nemovitosti: pravidelne platby (najem a zalohy od najemce, platby
 * sluzeb dodavatelum) podle predpisu, u zaplacenych podle skutecne castky a data, plus ostatni
 * pohyby (opravy, pojisteni, splatky...). Pohyb, ktery je zaroven pravidelnou platbou,
 * se nepocita dvakrat. Kauce se nepocita (neni prijem ani naklad). Prutokove zalohy se
 * NEvyrazuji: jsou to skutecne penize, ktere prochazeji uctem.
 */
export function tokyNemovitosti(
  navrh: NavrzenaPlatba[],
  transakce: { date: Date; amount: number; category: string; sourceKey?: string | null }[],
): Tok[] {
  const klice = new Set(navrh.map((p) => p.klic));
  return [
    ...navrh.filter((p) => p.kategorie !== "DEPOSIT").map((p) => ({
      // Mesic platby podle splatnosti, ne podle data zapsani zaplaceni: hromadne "zaplaceno dnes"
      // by jinak presunulo cely rok najmu do aktualniho (nedokonceneho) mesice
      datum: p.datum,
      druh: p.druh as string,
      castka: p.zaplaceno ? (p.castka >= 0 ? 1 : -1) * p.zaplaceno.castka : p.castka,
      kategorie: p.kategorie,
    })),
    ...transakce
      .filter((t) => t.category !== "DEPOSIT" && !(t.sourceKey && klice.has(t.sourceKey)))
      .map((t) => ({ datum: denISO(t.date), castka: t.amount, kategorie: t.category, druh: "POHYB" })),
  ];
}

export interface PrumernyTok { mesicne: number; mesicu: number; neuplny: boolean; /** Mesicni prumer po zdrojich (NAJEM, ZALOHA, SLUZBA, UVER, VYUCTOVANI, POHYB) */ rozpad?: Record<string, number> }

/**
 * Prumerny mesicni cash flow z poslednich (max. 12) dokoncenych mesicu. Rozbehnuty
 * aktualni mesic se nepocita, aby cislo nezkreslil. Bez tokù vraci null.
 */
export function prumernyMesicniTok(toky: Tok[], asOf = new Date()): PrumernyTok | null {
  if (!toky.length) return null;
  const konec = new Date(Date.UTC(asOf.getFullYear(), asOf.getMonth(), 1));
  const prvni = toky.reduce((m, x) => (x.datum < m ? x.datum : m), toky[0].datum);
  const od0 = new Date(`${prvni.slice(0, 7)}-01T00:00:00Z`);
  const odLimit = new Date(Date.UTC(konec.getUTCFullYear(), konec.getUTCMonth() - 12, 1));
  const od = od0 > odLimit ? od0 : odLimit;
  const mesicu = (konec.getUTCFullYear() - od.getUTCFullYear()) * 12 + konec.getUTCMonth() - od.getUTCMonth();
  if (mesicu < 1) return { mesicne: toky.reduce((a, x) => a + x.castka, 0), mesicu: 1, neuplny: true };
  const odISO = od.toISOString().slice(0, 10), doISO = konec.toISOString().slice(0, 10);
  const soucet = toky.filter((x) => x.datum >= odISO && x.datum < doISO).reduce((a, x) => a + x.castka, 0);
  const rozpad: Record<string, number> = {};
  for (const x of toky.filter((x) => x.datum >= odISO && x.datum < doISO)) rozpad[x.druh ?? "POHYB"] = (rozpad[x.druh ?? "POHYB"] ?? 0) + x.castka / mesicu;
  return { mesicne: soucet / mesicu, mesicu, neuplny: false, rozpad };
}

function tokyPortfolia(properties: PropertyWithRelations[], navrhy: Map<string, NavrzenaPlatba[]>): Tok[] {
  return properties.flatMap((p) => tokyNemovitosti(navrhy.get(p.id) ?? [], p.transactions));
}

export interface CashFlowPoint { period: string; prijmy: number; vydaje: number; cisty: number }

/** Mesicni cash flow ze skutecnych transakci za poslednich N mesicu. */
export function cashFlowSeries(
  properties: PropertyWithRelations[], months = 12, asOf = new Date(),
  /** Kdyz jsou zadane pravidelne platby, pocita se skutecny cash flow vcetne nich. */
  navrhy?: Map<string, NavrzenaPlatba[]>,
): CashFlowPoint[] {
  const txs = navrhy
    ? tokyPortfolia(properties, navrhy).map((t) => ({ date: new Date(`${t.datum}T12:00:00Z`), amount: t.castka, taxTreatment: "" }))
    : properties.flatMap((p) => p.transactions);
  const points: CashFlowPoint[] = [];

  for (let i = months - 1; i >= 0; i--) {
    const monthStart = new Date(asOf.getFullYear(), asOf.getMonth() - i, 1);
    const monthEnd = new Date(asOf.getFullYear(), asOf.getMonth() - i + 1, 1);

    const inMonth = txs.filter((t) => {
      const d = new Date(t.date);
      return d >= monthStart && d < monthEnd && t.taxTreatment !== "PASS_THROUGH";
    });

    const prijmy = sum(inMonth.filter((t) => t.amount > 0).map((t) => t.amount));
    const vydaje = Math.abs(sum(inMonth.filter((t) => t.amount < 0).map((t) => t.amount)));

    points.push({
      period: monthCz(monthStart),
      prijmy: Math.round(prijmy),
      vydaje: Math.round(vydaje),
      cisty: Math.round(prijmy - vydaje),
    });
  }

  return points;
}

/** Rozpad rocnich nakladu podle kategorie. */
export function expenseBreakdown(
  properties: PropertyWithRelations[], year: number, navrhy?: Map<string, NavrzenaPlatba[]>,
): { kategorie: string; castka: number }[] {
  const byCategory = new Map<string, number>();

  if (navrhy) {
    for (const t of tokyPortfolia(properties, navrhy)) {
      if (t.datum.slice(0, 4) !== String(year) || t.castka >= 0) continue;
      byCategory.set(t.kategorie, (byCategory.get(t.kategorie) ?? 0) + Math.abs(t.castka));
    }
    return [...byCategory.entries()]
      .map(([kategorie, castka]) => ({ kategorie, castka: Math.round(castka) }))
      .sort((a, b) => b.castka - a.castka);
  }

  for (const p of properties) {
    for (const t of p.transactions) {
      if (new Date(t.date).getFullYear() !== year) continue;
      if (t.amount >= 0 || t.taxTreatment === "PASS_THROUGH") continue;
      byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + Math.abs(t.amount));
    }
  }

  return [...byCategory.entries()]
    .map(([kategorie, castka]) => ({ kategorie, castka: Math.round(castka) }))
    .sort((a, b) => b.castka - a.castka);
}
