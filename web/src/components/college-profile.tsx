"use client";
import { useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

type Cut = {
  year: number; round: string; course: string; quota: string; category: string;
  opening: number | null; closing: number; allotmentCount?: number;
};
type College = {
  name: string; type: string; code?: string | null; city?: string | null;
  state?: string | null; stateName?: string | null;
  isDeemed?: boolean; isCentral?: boolean; isMinority?: boolean; feeBand?: string | null;
};

const TABS = ["Overview", "Cutoff History", "Seat Matrix", "Quotas", "Fees"];
const inr = (n: number) => "₹" + n.toLocaleString("en-IN");

// Indicative annual MBBS tuition ranges by college type (official figures vary by year/round).
function feeRange(c: College): { label: string; range: string; note: string } {
  const t = (c.type || "").toUpperCase();
  if (t === "AIIMS") return { label: "AIIMS (Central)", range: "₹1,000 – ₹6,000 / year", note: "Nominal government fees." };
  if (t === "JIPMER") return { label: "JIPMER (Central)", range: "₹4,000 – ₹12,000 / year", note: "Nominal government fees." };
  if (t === "ESIC") return { label: "ESIC", range: "₹25,000 – ₹1,50,000 / year", note: "Subsidised; IP quota lower." };
  if (c.isDeemed || t === "DEEMED") return { label: "Deemed University", range: "₹15,00,000 – ₹26,00,000 / year", note: "Private deemed fees are high; NRI seats higher still." };
  if (t === "GOVT" || t === "CENTRAL") return { label: "Government", range: "₹10,000 – ₹80,000 / year", note: "State/central government subsidised tuition." };
  // fall back to fee band
  const band = (c.feeBand || "UNKNOWN").toUpperCase();
  if (band === "LOW") return { label: "Government / Low", range: "₹10,000 – ₹1,00,000 / year", note: "Indicative." };
  if (band === "MID") return { label: "Mid", range: "₹1,00,000 – ₹8,00,000 / year", note: "Indicative." };
  if (band === "HIGH") return { label: "Private / High", range: "₹8,00,000 – ₹18,00,000 / year", note: "Indicative." };
  if (band === "VERY_HIGH") return { label: "Deemed / Very high", range: "₹18,00,000 – ₹26,00,000 / year", note: "Indicative." };
  return { label: "Private (typical)", range: "₹7,00,000 – ₹20,00,000 / year", note: "Indicative — verify with the college." };
}

type Fee = {
  course?: string; tuitionAnnual: number | null; hostelAnnual: number | null; otherAnnual: number | null;
  nriTuition: number | null; isIndicative: boolean; sourceUrl?: string | null; note?: string | null;
};
const COURSE_YEARS: Record<string, number> = { MBBS: 4.5, BDS: 5, "BSc Nursing": 4 };
type SeatRow = { year: number; round: string; course: string; quota: string; category: string; seats: number; source?: string | null };

export function CollegeProfile({ college, cutoffs, fee, seatMatrix }: { college: College; cutoffs: Cut[]; fee?: Fee | null; seatMatrix?: SeatRow[] }) {
  const [tab, setTab] = useState("Overview");
  const courses = [...new Set(cutoffs.map((c) => c.course))];
  const quotas = [...new Set(cutoffs.map((c) => c.quota))];
  const cats = [...new Set(cutoffs.map((c) => c.category))];
  const years = [...new Set(cutoffs.map((c) => c.year))].sort((a, b) => b - a);
  const latestYear = years[0];

  const [course, setCourse] = useState(courses[0] ?? "MBBS");
  const [quota, setQuota] = useState(quotas[0] ?? "AIQ");
  const [cat, setCat] = useState(cats.includes("OPEN") ? "OPEN" : cats[0] ?? "OPEN");

  const series = useMemo(() => {
    const m = new Map<number, number>();
    cutoffs.filter((c) => c.course === course && c.quota === quota && c.category === cat)
      .forEach((c) => m.set(c.year, Math.max(m.get(c.year) ?? 0, c.closing)));
    return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([year, closing]) => ({ year: String(year), closing }));
  }, [cutoffs, course, quota, cat]);

  // latest-year closing per (quota, category) — used by Quotas + Seat Matrix
  const latestRows = useMemo(() => {
    return cutoffs
      .filter((c) => c.year === latestYear && c.course === course)
      .reduce((acc, c) => {
        const k = c.quota + "|" + c.category;
        const prev = acc.get(k);
        if (!prev || c.closing > prev.closing) acc.set(k, c);
        return acc;
      }, new Map<string, Cut>());
  }, [cutoffs, latestYear, course]);

  const seats = useMemo(() => {
    const m = new Map<string, number>();
    cutoffs.filter((c) => c.year === latestYear && c.course === course)
      .forEach((c) => { const k = c.quota + "|" + c.category; m.set(k, (m.get(k) ?? 0) + (c.allotmentCount ?? 0)); });
    return m;
  }, [cutoffs, latestYear, course]);
  const totalSeats = [...seats.values()].reduce((a, b) => a + b, 0);

  const fb = feeRange(college);
  const hasFee = !!fee && fee.tuitionAnnual != null;
  const totalAnnual = hasFee ? (fee!.tuitionAnnual ?? 0) + (fee!.hostelAnnual ?? 0) + (fee!.otherAnnual ?? 0) : null;
  const headerFee = hasFee ? `${inr(fee!.tuitionAnnual!)} / yr` : fb.range;
  const official = hasFee && fee!.isIndicative === false;
  const feeCourse = fee?.course || "MBBS";
  const courseYears = COURSE_YEARS[feeCourse] ?? 4.5;
  const sel = "h-9 rounded-md border border-border px-2 text-sm bg-white w-full";

  const Badge = ({ children, cls }: any) => <span className={`badge ${cls}`}>{children}</span>;

  return (
    <div className="max-w-[1000px] mx-auto space-y-4">
      <a href="/cutoff-explorer" className="text-sm text-brand-600">‹ Back to explorer</a>

      <div className="bg-white border border-border rounded-lg p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-ink-900">{college.name}</h1>
            <p className="text-sm text-ink-500 mt-1">
              {[college.city, college.stateName ?? college.state].filter(Boolean).join(", ") || "India"}
            </p>
            <div className="flex gap-2 mt-2 flex-wrap text-xs">
              <Badge cls="bg-emerald-100 text-emerald-800">{college.type}</Badge>
              {college.isDeemed && <Badge cls="bg-violet-100 text-violet-800">Deemed</Badge>}
              {college.isCentral && <Badge cls="bg-sky-100 text-sky-800">Central</Badge>}
              {college.isMinority && <Badge cls="bg-amber-100 text-amber-800">Minority</Badge>}
              {college.code && <Badge cls="bg-slate-100 text-slate-700">Code: {college.code}</Badge>}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-ink-500">{feeCourse} tuition {official ? "" : "(indicative)"}</div>
            <div className="text-base font-bold text-ink-900">{headerFee}</div>
          </div>
        </div>

        <div className="flex gap-1 mt-5 border-b border-border overflow-x-auto">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-2 text-sm whitespace-nowrap ${tab === t ? "text-brand-700 border-b-2 border-brand-600 font-medium" : "text-ink-500"}`}>{t}</button>
          ))}
        </div>

        {/* ---------- OVERVIEW ---------- */}
        {tab === "Overview" && (
          <div className="mt-5 space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Fact label="Type" value={college.type} />
              <Fact label="Location" value={[college.city, college.state].filter(Boolean).join(", ") || "—"} />
              <Fact label="Courses" value={courses.join(", ") || "—"} />
              <Fact label="Data years" value={years.length ? `${years[years.length - 1]}–${years[0]}` : "—"} />
              <Fact label="Quotas covered" value={String(quotas.length)} />
              <Fact label="Categories" value={String(cats.length)} />
              <Fact label={`Seats allotted (${latestYear ?? "—"})`} value={totalSeats ? totalSeats.toLocaleString("en-IN") : "—"} />
              <Fact label="Cutoff records" value={String(cutoffs.length)} />
            </div>
            <div className="bg-surface-muted border border-border rounded-lg p-4 text-sm text-ink-700 leading-relaxed">
              <b className="text-ink-900">{college.name}</b> is a {college.type.toLowerCase()} medical college
              {college.stateName ? ` in ${college.stateName}` : ""}. We hold {cutoffs.length} official
              closing-rank records across {courses.join(", ")} for {quotas.join(", ")} quota(s) and
              {" "}{cats.length} categories. See the <b>Cutoff History</b> tab for year-on-year trends,
              <b> Seat Matrix</b> for allotment volumes, and <b>Fees</b> for the indicative fee structure.
            </div>
          </div>
        )}

        {/* ---------- CUTOFF HISTORY ---------- */}
        {tab === "Cutoff History" && (
          <div className="mt-4">
            <div className="grid grid-cols-3 gap-3 mb-4 max-w-md">
              <div><label className="block text-xs text-ink-500 mb-1">Course</label><select className={sel} value={course} onChange={(e) => setCourse(e.target.value)}>{courses.map((c) => <option key={c}>{c}</option>)}</select></div>
              <div><label className="block text-xs text-ink-500 mb-1">Quota</label><select className={sel} value={quota} onChange={(e) => setQuota(e.target.value)}>{quotas.map((q) => <option key={q}>{q}</option>)}</select></div>
              <div><label className="block text-xs text-ink-500 mb-1">Category</label><select className={sel} value={cat} onChange={(e) => setCat(e.target.value)}>{cats.map((c) => <option key={c}>{c}</option>)}</select></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2 bg-surface-muted rounded-lg p-3">
                <h4 className="text-sm font-medium text-ink-900 mb-2">Closing Rank Trend ({cat} · {quota})</h4>
                {series.length ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={series} margin={{ top: 10, right: 16, bottom: 0, left: -4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="year" tick={{ fontSize: 12, fill: "#64748b" }} />
                      <YAxis tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                      <Tooltip formatter={(v: number) => v.toLocaleString("en-IN")} />
                      <Line type="monotone" dataKey="closing" stroke="#1d4ed8" strokeWidth={2.5} dot={{ r: 4 }} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : <div className="h-[220px] grid place-items-center text-ink-500 text-sm">No data for this combination.</div>}
              </div>
              <div className="border border-border rounded-lg overflow-hidden h-fit">
                <table className="w-full text-sm">
                  <thead className="bg-surface-muted text-ink-500 text-xs"><tr><th className="text-left px-3 py-2 font-medium">Year</th><th className="text-right px-3 py-2 font-medium">Closing Rank</th></tr></thead>
                  <tbody className="divide-y divide-border">
                    {series.length ? series.map((r) => <tr key={r.year}><td className="px-3 py-2">{r.year}</td><td className="px-3 py-2 text-right tabular-nums font-medium">{r.closing.toLocaleString("en-IN")}</td></tr>)
                      : <tr><td colSpan={2} className="px-3 py-4 text-center text-ink-500">—</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ---------- SEAT MATRIX ---------- */}
        {tab === "Seat Matrix" && (
          <div className="mt-5">
            {seatMatrix && seatMatrix.length ? (
              (() => {
                const all = [...seatMatrix];
                const intake = all.filter((r) => r.category === "Total intake");
                const cats = all.filter((r) => r.category !== "Total intake")
                  .sort((a, b) => a.quota.localeCompare(b.quota) || a.course.localeCompare(b.course) || a.category.localeCompare(b.category));
                const yr = (cats[0] ?? intake[0]).year;
                const mccTotal = cats.reduce((s, r) => s + r.seats, 0);
                return (
                  <>
                    <div className="flex items-center gap-2 mb-3">
                      <p className="text-xs text-ink-500">Official <b>sanctioned seats</b> — Round 1, {yr}.</p>
                      <span className="badge bg-emerald-100 text-emerald-800">Official</span>
                    </div>
                    {intake.length > 0 && (
                      <div className="mb-4 flex flex-wrap gap-3">
                        {intake.map((r, i) => (
                          <div key={i} className="bg-brand-50 border border-brand-100 rounded-lg px-4 py-3">
                            <div className="text-xs text-brand-700">Total sanctioned intake ({r.course}, all quotas)</div>
                            <div className="text-2xl font-bold text-ink-900">{r.seats.toLocaleString("en-IN")} seats</div>
                          </div>
                        ))}
                      </div>
                    )}
                    {cats.length > 0 && (
                      <>
                        <div className="text-sm font-medium text-ink-900 mb-2">MCC-counselled seats (within the total above)</div>
                        <div className="border border-border rounded-lg overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-surface-muted text-ink-500 text-xs uppercase"><tr><th className="text-left px-4 py-2 font-medium">Quota</th><th className="text-left px-4 py-2 font-medium">Course</th><th className="text-left px-4 py-2 font-medium">Category</th><th className="text-right px-4 py-2 font-medium">Seats</th></tr></thead>
                            <tbody className="divide-y divide-border">
                              {cats.map((r, i) => (
                                <tr key={i}><td className="px-4 py-2 text-ink-700">{r.quota}</td><td className="px-4 py-2 text-ink-700">{r.course}</td><td className="px-4 py-2"><span className="badge bg-brand-50 text-brand-700">{r.category}</span></td><td className="px-4 py-2 text-right tabular-nums font-medium">{r.seats}</td></tr>
                              ))}
                              <tr className="bg-surface-muted font-semibold"><td className="px-4 py-2" colSpan={3}>MCC-counselled total</td><td className="px-4 py-2 text-right tabular-nums">{mccTotal.toLocaleString("en-IN")}</td></tr>
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                    <p className="text-[11px] text-ink-400 mt-2">MCC seats = All-India Quota / Deemed / Central / AIIMS / JIPMER / ESIC. The remaining seats up to the total intake are state-quota (convener / management / NRI).</p>
                  </>
                );
              })()
            ) : totalSeats ? (
              <>
                <p className="text-xs text-ink-500 mb-3">Seats <b>allotted</b> in Round 1, {latestYear} (proxy for intake — official seat matrix not available for this college).</p>
                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-surface-muted text-ink-500 text-xs uppercase"><tr><th className="text-left px-4 py-2 font-medium">Quota</th><th className="text-left px-4 py-2 font-medium">Category</th><th className="text-right px-4 py-2 font-medium">Seats allotted</th></tr></thead>
                    <tbody className="divide-y divide-border">
                      {[...seats.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => {
                        const [qq, ct] = k.split("|");
                        return <tr key={k}><td className="px-4 py-2 text-ink-700">{qq}</td><td className="px-4 py-2"><span className="badge bg-brand-50 text-brand-700">{ct}</span></td><td className="px-4 py-2 text-right tabular-nums font-medium">{v.toLocaleString("en-IN")}</td></tr>;
                      })}
                      <tr className="bg-surface-muted font-semibold"><td className="px-4 py-2" colSpan={2}>Total</td><td className="px-4 py-2 text-right tabular-nums">{totalSeats.toLocaleString("en-IN")}</td></tr>
                    </tbody>
                  </table>
                </div>
              </>
            ) : <div className="text-sm text-ink-500">No seat data available for {latestYear}.</div>}
          </div>
        )}

        {/* ---------- QUOTAS ---------- */}
        {tab === "Quotas" && (
          <div className="mt-5">
            <p className="text-xs text-ink-500 mb-3">Quotas &amp; categories available, with the latest ({latestYear}) closing rank.</p>
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-surface-muted text-ink-500 text-xs uppercase"><tr><th className="text-left px-4 py-2 font-medium">Quota</th><th className="text-left px-4 py-2 font-medium">Category</th><th className="text-right px-4 py-2 font-medium">Closing ({latestYear})</th></tr></thead>
                <tbody className="divide-y divide-border">
                  {[...latestRows.values()].sort((a, b) => a.closing - b.closing).map((r, i) => (
                    <tr key={i}><td className="px-4 py-2 text-ink-700">{r.quota}</td><td className="px-4 py-2"><span className="badge bg-brand-50 text-brand-700">{r.category}</span></td><td className="px-4 py-2 text-right tabular-nums font-medium">{r.closing.toLocaleString("en-IN")}</td></tr>
                  ))}
                  {latestRows.size === 0 && <tr><td colSpan={3} className="px-4 py-4 text-center text-ink-500">No data.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ---------- FEES ---------- */}
        {tab === "Fees" && (
          <div className="mt-5 space-y-4">
            {hasFee ? (
              <>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-ink-900">Annual {feeCourse} fee breakdown</h3>
                  {official
                    ? <span className="badge bg-emerald-100 text-emerald-800">Official</span>
                    : <span className="badge bg-amber-100 text-amber-800">Indicative</span>}
                </div>
                <div className="border border-border rounded-lg overflow-hidden max-w-md">
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-border">
                      <FeeRow label="Tuition (per year)" value={fee!.tuitionAnnual} />
                      <FeeRow label="Hostel (per year)" value={fee!.hostelAnnual} />
                      <FeeRow label="Other / university (per year)" value={fee!.otherAnnual} />
                      <tr className="bg-surface-muted font-semibold">
                        <td className="px-4 py-2.5 text-ink-900">Total per year</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{totalAnnual ? inr(totalAnnual) : "—"}</td>
                      </tr>
                      {fee!.nriTuition ? <FeeRow label="NRI tuition (per year)" value={fee!.nriTuition} /> : null}
                    </tbody>
                  </table>
                </div>
                {totalAnnual ? <p className="text-sm text-ink-600">Approx. {courseYears}-year course cost: <b>{inr(Math.round(totalAnnual * courseYears))}</b> (tuition + hostel + other).</p> : null}
                {fee!.sourceUrl && <a href={fee!.sourceUrl} target="_blank" rel="noreferrer" className="text-sm text-brand-600 hover:underline">Official fee notification →</a>}
                {!official && (
                  <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-xs text-amber-800">
                    ⚠️ These are <b>indicative estimates</b> by college type — not the official notification. Verify on the college / counselling-authority website.
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="border border-border rounded-lg p-5">
                  <div className="text-xs text-ink-500">Indicative annual MBBS tuition · {fb.label}</div>
                  <div className="text-2xl font-bold text-ink-900 mt-1">{fb.range}</div>
                  <p className="text-sm text-ink-500 mt-2">{fb.note}</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-xs text-amber-800">
                  ⚠️ Indicative range based on college type — confirm official figures with the college.
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function FeeRow({ label, value }: { label: string; value: number | null }) {
  return (
    <tr>
      <td className="px-4 py-2.5 text-ink-700">{label}</td>
      <td className="px-4 py-2.5 text-right tabular-nums text-ink-900">{value != null ? inr(value) : "—"}</td>
    </tr>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-muted border border-border rounded-lg p-3">
      <div className="text-xs text-ink-500">{label}</div>
      <div className="text-sm font-semibold text-ink-900 mt-0.5 break-words">{value}</div>
    </div>
  );
}
