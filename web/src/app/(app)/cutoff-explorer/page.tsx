"use client";
import { useEffect, useState, useCallback } from "react";

const YEARS = ["2025", "2024", "2023"];
const ROUNDS = ["All", "R1", "R2", "R3", "STRAY"];
const STATES = [{ c: "", n: "All India (AIQ)" }, { c: "AP", n: "Andhra Pradesh" }, { c: "TG", n: "Telangana" }, { c: "TN", n: "Tamil Nadu" }, { c: "KA", n: "Karnataka" }, { c: "MH", n: "Maharashtra" }, { c: "UP", n: "Uttar Pradesh" }, { c: "DL", n: "Delhi" }];
const COURSES = ["All", "MBBS", "BDS"];
const QUOTAS = ["All", "AIQ", "STATE", "DEEMED", "NRI", "ESIC_IP"];
const CATS = ["All", "OPEN", "EWS", "OBC", "SC", "ST", "BC-A", "BC-B", "BC-C", "BC-D", "BC-E"];
const TYPES = ["All", "GOVT", "AIIMS", "JIPMER", "ESIC", "CENTRAL", "DEEMED"];

function Sel({ label, value, onChange, opts }: any) {
  return (
    <div>
      <label className="block text-xs font-medium text-ink-500 mb-1">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full h-9 rounded-md border border-border px-2 text-sm bg-white">
        {opts.map((o: any) => typeof o === "string"
          ? <option key={o} value={o}>{o}</option>
          : <option key={o.c} value={o.c}>{o.n}</option>)}
      </select>
    </div>
  );
}

export default function CutoffExplorer() {
  const [f, setF] = useState({ year: "2024", round: "R1", state: "", course: "MBBS", quota: "AIQ", category: "All", collegeType: "All", q: "" });
  const [data, setData] = useState<any>({ rows: [], total: 0, page: 1, pages: 1 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (pg = 1, override?: typeof f) => {
    const ff = override || f;
    setLoading(true);
    const p = new URLSearchParams({ year: ff.year, round: ff.round, course: ff.course, quota: ff.quota, category: ff.category, collegeType: ff.collegeType, page: String(pg), pageSize: "10" });
    if (ff.state) p.set("state", ff.state);
    if (ff.q) p.set("q", ff.q);
    const r = await fetch(`/api/cutoffs?${p}`).then((x) => x.json());
    setData(r); setPage(pg); setLoading(false);
  }, [f]);

  useEffect(() => {
    // Allow deep-linking, e.g. /cutoff-explorer?state=AP&course=MBBS
    const sp = new URLSearchParams(window.location.search);
    const st = sp.get("state"); const course = sp.get("course"); const quota = sp.get("quota");
    if (st || course || quota) {
      const nf = { ...f, ...(st ? { state: st, quota: "STATE" } : {}), ...(quota ? { quota } : {}), ...(course ? { course } : {}) };
      setF(nf); load(1, nf);
    } else {
      load(1);
    }
    /* eslint-disable-next-line */
  }, []);
  const set = (k: string) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  return (
    <div className="space-y-4 max-w-[1200px]">
      <h1 className="text-xl font-bold text-ink-900">Cutoff Explorer</h1>

      <div className="bg-white border border-border rounded-lg p-4 space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Sel label="Year" value={f.year} onChange={set("year")} opts={YEARS} />
          <Sel label="Round" value={f.round} onChange={set("round")} opts={ROUNDS} />
          <Sel label="State" value={f.state} onChange={set("state")} opts={STATES} />
          <Sel label="Course" value={f.course} onChange={set("course")} opts={COURSES} />
          <Sel label="Quota" value={f.quota} onChange={set("quota")} opts={QUOTAS} />
          <Sel label="Category" value={f.category} onChange={set("category")} opts={CATS} />
          <Sel label="College Type" value={f.collegeType} onChange={set("collegeType")} opts={TYPES} />
          <div>
            <label className="block text-xs font-medium text-ink-500 mb-1">Search College</label>
            <input value={f.q} onChange={(e) => set("q")(e.target.value)} placeholder="Search College"
              className="w-full h-9 rounded-md border border-border px-2 text-sm" />
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => load(1)} className="h-9 px-4 rounded-md bg-brand-600 text-white text-sm font-medium hover:bg-brand-700">Search</button>
          <button onClick={() => { setF({ year: "2024", round: "R1", state: "", course: "MBBS", quota: "AIQ", category: "All", collegeType: "All", q: "" }); }} className="h-9 px-4 rounded-md border border-border text-sm">Reset</button>
        </div>
      </div>

      <div className="bg-white border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted text-ink-500 text-xs uppercase">
            <tr>
              <th className="text-left font-medium px-4 py-3">College Name</th>
              <th className="text-left font-medium px-4 py-3">Type</th>
              <th className="text-left font-medium px-4 py-3">Category</th>
              <th className="text-right font-medium px-4 py-3">Opening Rank</th>
              <th className="text-right font-medium px-4 py-3">Closing Rank</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && <tr><td colSpan={5} className="px-4 py-8 text-center text-ink-500">Loading…</td></tr>}
            {!loading && data.rows.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-ink-500">No cutoffs match these filters.</td></tr>}
            {!loading && data.rows.map((r: any) => (
              <tr key={r.id} className="hover:bg-surface-muted">
                <td className="px-4 py-3"><a href={`/college/${r.collegeId}`} className="text-brand-700 hover:underline">{r.college}</a></td>
                <td className="px-4 py-3 text-ink-700">{r.type}</td>
                <td className="px-4 py-3"><span className="badge bg-brand-50 text-brand-700">{r.category}</span></td>
                <td className="px-4 py-3 text-right tabular-nums">{r.opening?.toLocaleString("en-IN") ?? "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums font-medium">{r.closing?.toLocaleString("en-IN")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center justify-between px-4 py-3 border-t border-border text-sm text-ink-500">
          <span>Showing {(data.page - 1) * data.pageSize + (data.rows.length ? 1 : 0)}–{(data.page - 1) * data.pageSize + data.rows.length} of {data.total.toLocaleString("en-IN")}</span>
          <div className="flex items-center gap-1">
            <button disabled={page <= 1} onClick={() => load(page - 1)} className="px-2 py-1 rounded border border-border disabled:opacity-40">‹</button>
            <span className="px-3 py-1 rounded bg-brand-600 text-white">{page}</span>
            <span className="text-ink-400">of {data.pages}</span>
            <button disabled={page >= data.pages} onClick={() => load(page + 1)} className="px-2 py-1 rounded border border-border disabled:opacity-40">›</button>
          </div>
        </div>
      </div>
    </div>
  );
}
