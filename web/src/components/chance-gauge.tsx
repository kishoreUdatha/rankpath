"use client";

// Semicircle gauge (0–100). Pure SVG, no deps.
export function ChanceGauge({ pct }: { pct: number }) {
  const p = Math.max(0, Math.min(100, pct));
  const r = 80, cx = 100, cy = 100;
  const a = Math.PI * (1 - p / 100); // angle from left (π) to right (0)
  const x = cx + r * Math.cos(a);
  const y = cy - r * Math.sin(a);
  const large = 0; // always < 180°
  const color = p >= 80 ? "#16a34a" : p >= 60 ? "#65a30d" : p >= 40 ? "#d97706" : "#dc2626";
  const label = p >= 80 ? "Very Good Chance" : p >= 60 ? "Good Chance" : p >= 40 ? "Moderate Chance" : "Low Chance";
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 120" className="w-full max-w-[260px]">
        <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="#e5e7eb" strokeWidth="16" strokeLinecap="round" />
        <path d={`M20 100 A80 80 0 ${large} 1 ${x} ${y}`} fill="none" stroke={color} strokeWidth="16" strokeLinecap="round" />
        <text x="100" y="92" textAnchor="middle" className="fill-ink-900" fontSize="30" fontWeight="700">{p}%</text>
      </svg>
      <div className="text-base font-semibold" style={{ color }}>{label}</div>
    </div>
  );
}
