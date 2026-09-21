"use client";

import {
  Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { czk, czkCompact, pct } from "@/lib/format";

/** Sloty kategoricke palety — prirazuji se v pevnem poradi, nikdy se necykluji. */
export const SERIES = [
  "rgb(var(--series-1))", "rgb(var(--series-2))", "rgb(var(--series-3))", "rgb(var(--series-4))",
  "rgb(var(--series-5))", "rgb(var(--series-6))", "rgb(var(--series-7))", "rgb(var(--series-8))",
];

const AXIS = { fontSize: 11, fill: "rgb(var(--text-muted))" };
const GRID = "rgb(var(--border))";

function ChartTooltip({ active, payload, label, formatter }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-surface-card px-3 py-2 text-xs shadow-lg">
      <div className="mb-1.5 font-medium text-ink-primary">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-ink-secondary">
            <span className="h-2 w-2 rounded-sm" style={{ background: p.color }} aria-hidden />
            {p.name}
          </span>
          <span className="font-medium tabular-nums text-ink-primary">
            {formatter ? formatter(p.value) : czk(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

const legendStyle = { fontSize: 12, color: "rgb(var(--text-secondary))", paddingTop: 8 };

/** Vyvoj hodnoty portfolia proti dluhu — dve rady, jedna osa (obojí v Kč). */
export function EquityChart({ data }: { data: { period: string; hodnota: number; dluh: number; equity: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gEquity" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES[0]} stopOpacity={0.22} />
            <stop offset="100%" stopColor={SERIES[0]} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="period" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={64} tickFormatter={czkCompact} />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: GRID }} />
        <Legend wrapperStyle={legendStyle} iconType="plainline" />
        <Area type="monotone" dataKey="hodnota" name="Tržní hodnota" stroke={SERIES[0]} strokeWidth={2} fill="url(#gEquity)" />
        <Line type="monotone" dataKey="dluh" name="Zbývající dluh" stroke={SERIES[1]} strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Mesicni cash flow: prijmy vs vydaje + cista linka. */
export function CashFlowChart({ data }: { data: { period: string; prijmy: number; vydaje: number; cisty: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
        <CartesianGrid stroke={GRID} strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="period" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={64} tickFormatter={czkCompact} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgb(var(--surface-sunken))" }} />
        <Legend wrapperStyle={legendStyle} />
        <ReferenceLine y={0} stroke={GRID} />
        <Bar dataKey="prijmy" name="Příjmy" fill={SERIES[2]} radius={[4, 4, 0, 0]} maxBarSize={22} />
        <Bar dataKey="vydaje" name="Výdaje" fill={SERIES[1]} radius={[4, 4, 0, 0]} maxBarSize={22} />
        <Line type="monotone" dataKey="cisty" name="Čistý tok" stroke={SERIES[0]} strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Porovnani vynosu jednotlivych bytu — jedna rada, barva podle hodnoty vuci prumeru. */
export function YieldBarChart({ data, average }: {
  data: { name: string; vynos: number }[];
  average: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 38 + 40)}>
      <BarChart data={data} layout="vertical" margin={{ top: 18, right: 44, left: 4, bottom: 4 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="2 4" horizontal={false} />
        <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v) => `${v.toFixed(1)} %`} />
        <YAxis type="category" dataKey="name" tick={AXIS} tickLine={false} axisLine={false} width={110} />
        <Tooltip content={<ChartTooltip formatter={(v: number) => pct(v)} />} cursor={{ fill: "rgb(var(--surface-sunken))" }} />
        <ReferenceLine x={average} stroke="rgb(var(--text-muted))" strokeDasharray="4 3"
          label={{ value: `⌀ ${average.toFixed(1)} %`, fontSize: 10, fill: "rgb(var(--text-muted))", position: "top" }} />
        <Bar dataKey="vynos" name="Čistý výnos" radius={[0, 4, 4, 0]} maxBarSize={20}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.vynos >= average ? SERIES[0] : SERIES[3]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Struktura rocnich nakladu. Jedna rada -> bez legendy, primo popsane. */
export function ExpenseBreakdownChart({ data }: { data: { kategorie: string; castka: number }[] }) {
  const max = Math.max(...data.map((d) => d.castka), 1);
  return (
    <div className="space-y-2.5">
      {data.map((d, i) => (
        <div key={d.kategorie}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-ink-secondary" title={d.kategorie}>{d.kategorie}</span>
            <span className="shrink-0 font-medium tabular-nums text-ink-primary">{czk(d.castka)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-sunken">
            <div
              className="h-full rounded-full"
              style={{ width: `${(d.castka / max) * 100}%`, background: SERIES[i % SERIES.length] }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Tva cena za m² proti trznimu rozpeti. */
export function MarketComparisonChart({ data }: {
  data: { name: string; tvoje: number; trh: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 46 + 50)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }} barGap={2}>
        <CartesianGrid stroke={GRID} strokeDasharray="2 4" horizontal={false} />
        <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={czkCompact} />
        <YAxis type="category" dataKey="name" tick={AXIS} tickLine={false} axisLine={false} width={110} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgb(var(--surface-sunken))" }} />
        <Legend wrapperStyle={legendStyle} />
        <Bar dataKey="tvoje" name="Pořizovací cena za m²" fill={SERIES[0]} radius={[0, 4, 4, 0]} maxBarSize={14} />
        <Bar dataKey="trh" name="Medián trhu za m²" fill={SERIES[2]} radius={[0, 4, 4, 0]} maxBarSize={14} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Umoreni uveru v case. */
export function AmortizationChart({ data }: { data: { rok: number; jistina: number; uroky: number; zustatek: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="rok" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={64} tickFormatter={czkCompact} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgb(var(--surface-sunken))" }} />
        <Legend wrapperStyle={legendStyle} />
        <Bar dataKey="jistina" name="Splátka jistiny" stackId="a" fill={SERIES[0]} maxBarSize={26} />
        <Bar dataKey="uroky" name="Úroky" stackId="a" fill={SERIES[1]} radius={[4, 4, 0, 0]} maxBarSize={26} />
      </BarChart>
    </ResponsiveContainer>
  );
}
