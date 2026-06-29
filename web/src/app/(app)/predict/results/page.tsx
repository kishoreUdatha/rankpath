"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChanceGauge } from "@/components/chance-gauge";
import { STATE_CODES } from "@/lib/states";

type Row = {
  collegeId: string; collegeName: string; collegeType: string; state: string | null;
  course: string; category: string; quota: string; projectedClosingRank: number;
  confidenceScore: number; band: string; historicalClosings: { year: number; closingRank: number }[];
  tuitionAnnual?: number | null; feeIndicative?: boolean;
};

function feeShort(n?: number | null) {
  if (n == null) return "—";
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(n % 100000 ? 1 : 0)}L`;
  if (n >= 1000) return `₹${Math.round(n / 1000)}k`;
  return `₹${n}`;
}
type Inputs = { rank: string; category: string; quota: string; state: string; gender: string; pwd: boolean; fromProfile: boolean };

function bandOf(score: number) {
  return score >= 80 ? "High" : score >= 55 ? "Moderate" : score >= 30 ? "Low" : "Risky";
}

function ResultsInner() {
  const sp = useSearchParams();
  // undefined = resolving, null = no rank from URL or profile
  const [inputs, setInputs] = useState<Inputs | null | undefined>(undefined);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [tab, setTab] = useState<"High" | "Moderate" | "Low" | "Risky" | "Safe">("High");

  // Resolve inputs: URL params take priority, else the saved profile.
  useEffect(() => {
    const urlRank = sp.get("rank");
    if (urlRank) {
      setInputs({ rank: urlRank, category: sp.get("category") ?? "OPEN", quota: sp.get("quota") ?? "AIQ", state: sp.get("state") ?? "", gender: sp.get("gender") ?? "", pwd: !!sp.get("pwd"), fromProfile: false });
      return;
    }
    fetch("/api/auth/me").then((r) => r.json()).then(({ user }) => {
      if (user?.neetRank) {
        const hasState = !!user.domicileState && STATE_CODES.has(user.domicileState);
        setInputs({
          rank: String(user.neetRank), category: user.category || "OPEN",
          quota: hasState ? "STATE" : "AIQ", state: hasState ? user.domicileState : "",
          gender: user.gender === "Male" ? "M" : user.gender === "Female" ? "F" : "", pwd: false, fromProfile: true,
        });
      } else setInputs(null);
    }).catch(() => setInputs(null));
  }, [sp]);

  const rank = inputs?.rank ?? "";
  const category = inputs?.category ?? "OPEN";
  const quota = inputs?.quota ?? "AIQ";
  const state = inputs?.state ?? "";

  useEffect(() => {
    if (!inputs) return;
    setRows(null);
    const body: any = { rank: Number(inputs.rank), category: inputs.category, quota: inputs.quota, includeUnlikely: true, topN: 400 };
    if (inputs.state) body.state = inputs.state;
    if (inputs.gender) body.gender = inputs.gender;
    if (inputs.pwd) body.pwd = true;
    fetch("/api/predict", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      .then((r) => r.json())
      .then((d) => {
        const all = ["SAFE", "MODERATE", "ASPIRATIONAL", "UNLIKELY"].flatMap((b) => d.buckets?.[b] ?? []);
        setRows(all);
      })
      .catch(() => setRows([]));
  }, [inputs]);

  const grp = useMemo(() => {
    const g = { High: [] as Row[], Moderate: [] as Row[], Low: [] as Row[], Risky: [] as Row[], Safe: [] as Row[] };
    (rows ?? []).forEach((r) => {
      g[bandOf(r.confidenceScore) as keyof typeof g].push(r);
      if (r.confidenceScore >= 80 && r.projectedClosingRank >= Number(rank) * 1.3) g.Safe.push(r);
    });
    Object.values(g).forEach((a) => a.sort((x, y) => y.confidenceScore - x.confidenceScore || x.projectedClosingRank - y.projectedClosingRank));
    return g;
  }, [rows, rank]);

  const overall = useMemo(() => {
    const h = grp.High.length, m = grp.Moderate.length;
    return Math.max(5, Math.min(98, Math.round(100 * (1 - 1 / (1 + 0.35 * h + 0.12 * m)))));
  }, [grp]);

  if (inputs === undefined) return <div className="p-10 text-center text-ink-500">Loading…</div>;
  if (inputs === null) return (
    <div className="max-w-[700px] mx-auto bg-white border border-border rounded-lg p-8 text-center">
      <h1 className="text-lg font-bold text-ink-900 mb-2">Prediction Results</h1>
      <p className="text-ink-500 text-sm mb-4">Add your NEET rank to your profile, or run a prediction, to see your results.</p>
      <a href="/predict" className="inline-block h-10 px-5 leading-10 rounded-md bg-brand-600 text-white text-sm font-medium">Predict My Chances</a>
    </div>
  );
  if (rows === null) return <div className="p-10 text-center text-ink-500">Calculating your chances…</div>;

  const years = [2023, 2024, 2025];
  const active = grp[tab];

  return (
    <div className="space-y-5 max-w-[1200px]">
      {/* success banner */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-center gap-3">
        <span className="text-emerald-600 text-xl">✓</span>
        <div>
          <div className="font-semibold text-emerald-900">Prediction completed successfully!</div>
          <div className="text-xs text-emerald-700">Based on 3 years of counselling data (2023–2025){inputs?.fromProfile ? " · using your profile" : ""}</div>
        </div>
      </div>

      {/* input summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[["AIR Rank", Number(rank).toLocaleString("en-IN")], ["Category", category], ["State", state || "All India"], ["Quota", quota]].map(([k, v]) => (
          <div key={k} className="bg-white border border-border rounded-lg p-3"><div className="text-xs text-ink-500">{k}</div><div className="text-lg font-bold text-ink-900">{v}</div></div>
        ))}
      </div>

      {/* meter + band cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white border border-border rounded-lg p-5">
          <h3 className="text-sm font-semibold text-ink-900 mb-2">Overall Chance Meter</h3>
          <ChanceGauge pct={overall} />
          <p className="text-xs text-ink-500 text-center mt-2">Estimated likelihood of securing a good college given your rank.</p>
        </div>
        <div className="lg:col-span-2 grid grid-cols-2 gap-4">
          <BandCard title="High Chance" range="80 – 100%" count={grp.High.length} cls="bg-emerald-50 border-emerald-200 text-emerald-700" />
          <BandCard title="Moderate Chance" range="55 – 79%" count={grp.Moderate.length} cls="bg-amber-50 border-amber-200 text-amber-700" />
          <BandCard title="Low Chance" range="30 – 54%" count={grp.Low.length} cls="bg-rose-50 border-rose-200 text-rose-700" />
          <BandCard title="Risky Options" range="Below 30%" count={grp.Risky.length} cls="bg-slate-50 border-slate-200 text-slate-700" />
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-xs text-amber-800">
        ⚠️ Prediction is based on previous allotment trends and does not guarantee admission.
      </div>

      {/* Recommended colleges (screen 4) */}
      <div className="bg-white border border-border rounded-lg">
        <div className="flex gap-1 p-2 border-b border-border flex-wrap">
          {(["High", "Moderate", "Low", "Risky", "Safe"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium ${tab === t ? "bg-brand-600 text-white" : "text-ink-600 hover:bg-surface-muted"}`}>
              {t === "Safe" ? "Safe Options" : t} ({grp[t].length})
            </button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted text-ink-500 text-xs uppercase">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">College</th>
                <th className="text-left font-medium px-4 py-2.5">State</th>
                <th className="text-left font-medium px-4 py-2.5">Type</th>
                <th className="text-left font-medium px-4 py-2.5">Quota</th>
                {years.map((y) => <th key={y} className="text-right font-medium px-3 py-2.5">{y}</th>)}
                <th className="text-right font-medium px-3 py-2.5">Fee/yr</th>
                <th className="text-right font-medium px-4 py-2.5">Chance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {active.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-ink-500">No colleges in this band.</td></tr>}
              {active.slice(0, 40).map((r) => {
                const byYear: Record<number, number> = {};
                r.historicalClosings.forEach((h) => { byYear[h.year] = Math.max(byYear[h.year] ?? 0, h.closingRank); });
                return (
                  <tr key={r.collegeId + r.quota + r.category} className="hover:bg-surface-muted">
                    <td className="px-4 py-2.5"><a href={`/college/${r.collegeId}`} className="text-brand-700 hover:underline font-medium">{r.collegeName}</a></td>
                    <td className="px-4 py-2.5 text-ink-700">{r.state ?? "AIQ"}</td>
                    <td className="px-4 py-2.5 text-ink-700">{r.collegeType}</td>
                    <td className="px-4 py-2.5 text-ink-700">{r.quota}</td>
                    {years.map((y) => <td key={y} className="px-3 py-2.5 text-right tabular-nums text-ink-600">{byYear[y]?.toLocaleString("en-IN") ?? "—"}</td>)}
                    <td className="px-3 py-2.5 text-right tabular-nums text-ink-700" title={r.feeIndicative === false ? "Official fee" : "Indicative fee"}>
                      {feeShort(r.tuitionAnnual)}{r.tuitionAnnual != null && r.feeIndicative !== false ? <span className="text-ink-400">*</span> : null}
                    </td>
                    <td className="px-4 py-2.5 text-right"><span className="badge bg-emerald-100 text-emerald-800">{r.confidenceScore}%</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 text-[11px] text-ink-400 border-t border-border">Fee = indicative annual MBBS tuition; <span className="text-ink-500">*</span> = type-based estimate. Open a college for the full fee breakdown.</div>
      </div>
    </div>
  );
}

function BandCard({ title, range, count, cls }: { title: string; range: string; count: number; cls: string }) {
  return (
    <div className={`border rounded-lg p-4 ${cls.split(" ").slice(0, 2).join(" ")}`}>
      <div className={`text-sm font-medium ${cls.split(" ")[2]}`}>{title}</div>
      <div className="text-3xl font-bold text-ink-900 my-1">{count}</div>
      <div className="text-xs text-ink-500">Colleges · {range}</div>
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={<div className="p-10 text-center text-ink-500">Loading…</div>}><ResultsInner /></Suspense>;
}
