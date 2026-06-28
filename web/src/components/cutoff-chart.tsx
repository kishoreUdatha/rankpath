"use client";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts";

const PALETTE = ["#1d4ed8", "#0891b2", "#16a34a", "#d97706", "#9333ea", "#dc2626"];

export function CutoffChart({ series }: { series: Array<{ label: string; points: Array<{ year: number; closingRank: number }> }> }) {
  // Pivot to recharts shape: one row per year, one column per series
  const years = Array.from(new Set(series.flatMap((s) => s.points.map((p) => p.year)))).sort();
  const data = years.map((y) => {
    const row: Record<string, number | null> = { year: y };
    for (const s of series) {
      const p = s.points.find((pp) => pp.year === y);
      row[s.label] = p ? p.closingRank : null;
    }
    return row;
  });
  if (data.length === 0) return <div className="text-ink-500 text-sm">No trend data.</div>;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="year" />
        <YAxis />
        <Tooltip formatter={(v) => (typeof v === "number" ? new Intl.NumberFormat("en-IN").format(v) : v)} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.map((s, i) => (
          <Line key={s.label} type="monotone" dataKey={s.label} stroke={PALETTE[i % PALETTE.length]} strokeWidth={2} dot={{ r: 3 }} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
