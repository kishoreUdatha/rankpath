"use client";
import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { CATEGORY_OPTIONS, QUOTA_OPTIONS, STATE_OPTIONS } from "@/lib/category-normalize";
import { fmtRank } from "@/lib/utils";

type PredictRow = {
  collegeId: string; collegeName: string; collegeType: string; state: string | null;
  course: string; category: string; quota: string;
  projectedClosingRank: number; confidenceScore: number;
  band: "HIGH" | "MODERATE" | "LOW" | "UNLIKELY";
  bucket: "SAFE" | "MODERATE" | "ASPIRATIONAL" | "UNLIKELY";
  historicalClosings: { year: number; round: string; closingRank: number }[];
};

const BAND_BADGE: Record<PredictRow["band"], string> = {
  HIGH: "badge-high", MODERATE: "badge-mod", LOW: "badge-low", UNLIKELY: "badge-unlike",
};

export default function PredictorPage() {
  const [form, setForm] = React.useState({
    rank: 5000,
    category: "OPEN",
    state: "AP",
    quota: "AIQ",
    collegeType: "",
    budgetBand: "",
    includeUnlikely: false,
  });
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<{ counts: any; buckets: Record<string, PredictRow[]> } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/predict", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rank: Number(form.rank),
          category: form.category,
          state: form.state || null,
          quota: form.quota || null,
          preferredCollegeTypes: form.collegeType ? [form.collegeType] : [],
          budgetBand: form.budgetBand || null,
          includeUnlikely: form.includeUnlikely,
          topN: 100,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "request_failed");
      setResult(j);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid lg:grid-cols-[360px,1fr] gap-6">
      <Card>
        <CardHeader><CardTitle>Your details</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label htmlFor="rank">NEET All India Rank</Label>
              <Input id="rank" type="number" min={1} value={form.rank}
                onChange={(e) => setForm({ ...form, rank: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Category</Label>
              <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
            <div>
              <Label>Domicile state</Label>
              <Select value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })}>
                <option value="">— Any —</option>
                {STATE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </div>
            <div>
              <Label>Quota</Label>
              <Select value={form.quota} onChange={(e) => setForm({ ...form, quota: e.target.value })}>
                <option value="">— Any —</option>
                {QUOTA_OPTIONS.map((q) => <option key={q} value={q}>{q}</option>)}
              </Select>
            </div>
            <div>
              <Label>College type (optional)</Label>
              <Select value={form.collegeType} onChange={(e) => setForm({ ...form, collegeType: e.target.value })}>
                <option value="">— Any —</option>
                {["GOVT","PRIVATE","DEEMED","AIIMS","JIPMER","ESIC","CENTRAL"].map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            </div>
            <div>
              <Label>Budget band (optional)</Label>
              <Select value={form.budgetBand} onChange={(e) => setForm({ ...form, budgetBand: e.target.value })}>
                <option value="">— Any —</option>
                <option value="LOW">Low (Govt)</option>
                <option value="MID">Mid (5–15 L/yr)</option>
                <option value="HIGH">High (15–25 L/yr)</option>
                <option value="VERY_HIGH">Very High (NRI)</option>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm text-ink-700">
              <input type="checkbox" checked={form.includeUnlikely}
                onChange={(e) => setForm({ ...form, includeUnlikely: e.target.checked })} />
              Include "Unlikely" colleges in results
            </label>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Predicting…" : "Predict my chances"}
            </Button>
            {error && <p className="text-sm text-rose-600">{error}</p>}
          </form>
        </CardContent>
      </Card>

      <section className="space-y-6">
        {!result && (
          <Card><CardContent className="p-8 text-center text-ink-500">
            Fill the form and hit <strong>Predict</strong>. We will show Safe, Moderate, Aspirational and (optionally) Unlikely college shortlists with a confidence score.
          </CardContent></Card>
        )}
        {result && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                ["Safe", result.counts.safe, "bg-emerald-50 text-emerald-800 border-emerald-200"],
                ["Moderate", result.counts.moderate, "bg-amber-50 text-amber-800 border-amber-200"],
                ["Aspirational", result.counts.aspirational, "bg-rose-50 text-rose-800 border-rose-200"],
                ["Unlikely", result.counts.unlikely, "bg-slate-50 text-slate-700 border-slate-200"],
              ].map(([label, count, cls]) => (
                <div key={label as string} className={`border rounded-lg p-4 ${cls}`}>
                  <div className="text-2xl font-bold">{count as number}</div>
                  <div className="text-sm">{label as string}</div>
                </div>
              ))}
            </div>

            {(["SAFE", "MODERATE", "ASPIRATIONAL", "UNLIKELY"] as const).map((b) =>
              result.buckets[b]?.length ? (
                <Card key={b}>
                  <CardHeader><CardTitle>{b.charAt(0) + b.slice(1).toLowerCase()} ({result.buckets[b].length})</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-surface-muted">
                          <tr>
                            <th className="text-left p-3">College</th>
                            <th className="text-left p-3">Course</th>
                            <th className="text-left p-3">Category</th>
                            <th className="text-left p-3">Quota</th>
                            <th className="text-right p-3">Projected Closing</th>
                            <th className="text-right p-3">Score</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.buckets[b].map((row, i) => (
                            <tr key={`${row.collegeId}-${i}`} className="border-t border-border hover:bg-surface-muted/40">
                              <td className="p-3"><a href={`/college/${row.collegeId}`} className="text-brand-700 hover:underline">{row.collegeName}</a><div className="text-xs text-ink-500">{row.collegeType} · {row.state ?? "—"}</div></td>
                              <td className="p-3">{row.course}</td>
                              <td className="p-3">{row.category}</td>
                              <td className="p-3">{row.quota}</td>
                              <td className="p-3 text-right tabular-nums">{fmtRank(row.projectedClosingRank)}</td>
                              <td className="p-3 text-right"><span className={BAND_BADGE[row.band]}>{row.confidenceScore}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              ) : null
            )}
          </>
        )}
      </section>
    </div>
  );
}
