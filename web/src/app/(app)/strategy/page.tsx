"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { STATE_CODES } from "@/lib/states";

type Row = { collegeName: string; state: string | null; confidenceScore: number; projectedClosingRank: number; quota: string };
type Inputs = { rank: string; category: string; quota: string; state: string; fromProfile: boolean };

function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }

function StrategyInner() {
  const sp = useSearchParams();
  // undefined = still resolving, null = no rank from URL or profile
  const [inputs, setInputs] = useState<Inputs | null | undefined>(undefined);
  const [rows, setRows] = useState<Row[] | null>(null);

  // Resolve inputs: URL params take priority, else fall back to the saved profile.
  useEffect(() => {
    const urlRank = sp.get("rank");
    if (urlRank) {
      setInputs({ rank: urlRank, category: sp.get("category") ?? "OPEN", quota: sp.get("quota") ?? "AIQ", state: sp.get("state") ?? "", fromProfile: false });
      return;
    }
    fetch("/api/auth/me").then((r) => r.json()).then(({ user }) => {
      if (user?.neetRank) {
        const hasState = !!user.domicileState && STATE_CODES.has(user.domicileState);
        setInputs({ rank: String(user.neetRank), category: user.category || "OPEN", quota: hasState ? "STATE" : "AIQ", state: hasState ? user.domicileState : "", fromProfile: true });
      } else {
        setInputs(null);
      }
    }).catch(() => setInputs(null));
  }, [sp]);

  // Run the prediction once inputs are resolved.
  useEffect(() => {
    if (!inputs) return;
    setRows(null);
    const body: any = { rank: Number(inputs.rank), category: inputs.category, quota: inputs.quota, includeUnlikely: true, topN: 400 };
    if (inputs.state) body.state = inputs.state;
    fetch("/api/predict", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      .then((r) => r.json())
      .then((d) => setRows(["SAFE", "MODERATE", "ASPIRATIONAL", "UNLIKELY"].flatMap((b) => d.buckets?.[b] ?? [])))
      .catch(() => setRows([]));
  }, [inputs]);

  const groups = useMemo(() => {
    const r = (rows ?? []).slice().sort((a, b) => b.confidenceScore - a.confidenceScore);
    const safe = r.filter((x) => x.confidenceScore >= 80);
    const realistic = r.filter((x) => x.confidenceScore >= 55 && x.confidenceScore < 80);
    const dream = r.filter((x) => x.confidenceScore >= 25 && x.confidenceScore < 55);
    return { safe, realistic, dream };
  }, [rows]);

  const { rank, category, quota, state } = inputs ?? { rank: "", category: "OPEN", quota: "AIQ", state: "", fromProfile: false } as Inputs;

  if (inputs === undefined) return <div className="p-10 text-center text-ink-500">Loading…</div>;
  if (inputs === null) return (
    <div className="max-w-[700px] mx-auto bg-white border border-border rounded-lg p-8 text-center">
      <h1 className="text-lg font-bold text-ink-900 mb-2">Counselling Strategy</h1>
      <p className="text-ink-500 text-sm mb-4">Add your NEET rank to your profile, or run a prediction, to get your personalised Dream / Realistic / Safe college strategy.</p>
      <a href="/predict" className="inline-block h-10 px-5 leading-10 rounded-md bg-brand-600 text-white text-sm font-medium">Predict My Chances</a>
    </div>
  );
  if (rows === null) return <div className="p-10 text-center text-ink-500">Building your strategy…</div>;

  const total = groups.dream.length + groups.realistic.length + groups.safe.length;
  const sug = {
    dream: clamp(groups.dream.length, 5, 12),
    realistic: clamp(groups.realistic.length, 8, 25),
    safe: clamp(groups.safe.length, 6, 20),
  };

  const Block = ({ title, color, rows, n }: any) => (
    <div>
      <h3 className={`text-sm font-semibold mb-1 ${color}`}>{title}</h3>
      <ol className="list-decimal ml-5 text-sm text-ink-800 space-y-0.5">
        {rows.slice(0, 6).map((r: Row, i: number) => <li key={i}>{r.collegeName} <span className="text-ink-400">· {r.confidenceScore}%</span></li>)}
        {rows.length === 0 && <li className="list-none text-ink-400">No colleges in this band.</li>}
      </ol>
    </div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 max-w-[1200px]">
      <aside className="bg-white border border-border rounded-lg p-4 text-sm h-fit">
        <h4 className="font-semibold text-ink-900 mb-3">Your Details</h4>
        {inputs?.fromProfile && (
          <div className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1 mb-3">✓ From your profile</div>
        )}
        {[["AIR Rank", Number(rank).toLocaleString("en-IN")], ["Category", category], ["State", state || "All India"], ["Quota", quota]].map(([k, v]) => (
          <div key={k} className="mb-2"><div className="text-xs text-ink-500">{k}</div><div className="font-medium text-ink-900">{v}</div></div>
        ))}
        <a href="/predict" className="block mt-1 text-brand-600 text-xs font-medium">Change inputs →</a>
      </aside>

      <section className="lg:col-span-2 bg-white border border-border rounded-lg p-5 space-y-5">
        <h2 className="text-lg font-bold text-ink-900">Your Personalized Counselling Strategy</h2>
        <Block title="🔴 Dream Colleges (Aspirational)" color="text-rose-600" rows={groups.dream} />
        <Block title="🟢 Realistic / Target Colleges" color="text-emerald-600" rows={groups.realistic} />
        <Block title="🟡 Safe Colleges" color="text-amber-600" rows={groups.safe} />
        <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-xs text-amber-800">
          Follow the order: Dream → Realistic → Safe. Always keep a good number of safe options to avoid a no-seat scenario.
        </div>
      </section>

      <aside className="bg-white border border-border rounded-lg p-4 text-sm h-fit space-y-3">
        <h4 className="font-semibold text-brand-700">Web Options Suggestion</h4>
        <div><div className="text-xs text-ink-500">Total Options</div><div className="text-2xl font-bold text-ink-900">{sug.dream + sug.realistic + sug.safe}</div></div>
        {[["Dream Colleges", sug.dream], ["Realistic Colleges", sug.realistic], ["Safe Colleges", sug.safe], ["Management Backup", 3]].map(([k, v]) => (
          <div key={k as string}><div className="text-xs text-ink-500">{k}</div><div className="text-base font-semibold text-ink-900">{v}</div></div>
        ))}
        <div className="text-xs text-ink-400 pt-2 border-t border-border">{total} reachable colleges analysed.</div>
      </aside>
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={<div className="p-10 text-center text-ink-500">Loading…</div>}><StrategyInner /></Suspense>;
}
