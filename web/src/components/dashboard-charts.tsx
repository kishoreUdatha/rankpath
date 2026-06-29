"use client";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar,
} from "recharts";

export function ClosingTrendChart({ data }: { data: { year: string; closing: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 10, right: 16, bottom: 0, left: -8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
        <XAxis dataKey="year" tick={{ fontSize: 12, fill: "#64748b" }} />
        <YAxis tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
        <Tooltip formatter={(v: number) => v.toLocaleString("en-IN")} />
        <Line type="monotone" dataKey="closing" stroke="#1d4ed8" strokeWidth={2.5} dot={{ r: 4 }} name="Avg closing rank" isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function StateSeatsChart({ data }: { data: { code: string; name: string; seats: number; colleges: number }[] }) {
  const top = data.slice(0, 12);
  return (
    <ResponsiveContainer width="100%" height={Math.max(240, top.length * 28)}>
      <BarChart data={top} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={(v) => v.toLocaleString("en-IN")} />
        <YAxis type="category" dataKey="code" width={36} tick={{ fontSize: 12, fill: "#334155" }} />
        <Tooltip
          formatter={(v: number) => [v.toLocaleString("en-IN"), "Seats allotted"]}
          labelFormatter={(code: string) => top.find((d) => d.code === code)?.name ?? code}
        />
        <Bar dataKey="seats" fill="#1d4ed8" radius={[0, 4, 4, 0]} name="Seats allotted" isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CategoryAvgChart({ data }: { data: { category: string; avg: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 10, right: 16, bottom: 0, left: -8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
        <XAxis dataKey="category" tick={{ fontSize: 12, fill: "#64748b" }} />
        <YAxis tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
        <Tooltip formatter={(v: number) => v.toLocaleString("en-IN")} />
        <Bar dataKey="avg" fill="#38bdf8" radius={[4, 4, 0, 0]} name="Avg closing rank" isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
