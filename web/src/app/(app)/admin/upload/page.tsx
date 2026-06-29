"use client";
import { useEffect, useRef, useState } from "react";

const TABS = ["Upload Files", "Uploaded Files", "Validation Errors", "Category Mapping", "Publish Data"];
const AUTH = ["MCC AIQ", "NTRUHS (AP)", "KNRUHS (TG)", "TNMCC", "KEA"];
const YEARS = ["2025", "2024", "2023"];
const ROUNDS = ["Round 1", "Round 2", "Round 3", "Stray"];
const FTYPES = ["PDF", "Excel", "CSV"];
const sel = "w-full h-10 rounded-md border border-border px-3 text-sm bg-white";

export default function AdminUpload() {
  const [tab, setTab] = useState("Upload Files");
  const [meta, setMeta] = useState({ authority: AUTH[0], year: YEARS[0], round: ROUNDS[0], ftype: FTYPES[0] });
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const inp = useRef<HTMLInputElement>(null);

  useEffect(() => { fetch("/api/stats").then((r) => r.json()).then(setStats).catch(() => {}); }, []);

  async function submit() {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("authority", meta.authority); fd.append("year", meta.year); fd.append("round", meta.round);
    try {
      const r = await fetch("/api/upload", { method: "POST", body: fd });
      setResult(await r.json().catch(() => ({ status: r.status })));
    } catch (e: any) { setResult({ error: String(e) }); }
  }

  return (
    <div className="max-w-[1200px] space-y-4">
      <h1 className="text-xl font-bold text-ink-900">Admin · Data Upload &amp; Validation</h1>

      <div className="flex gap-1 border-b border-border flex-wrap">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm ${tab === t ? "text-brand-700 border-b-2 border-brand-600 font-medium" : "text-ink-500"}`}>{t}</button>
        ))}
      </div>

      {tab === "Upload Files" ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-white border border-border rounded-lg p-5 space-y-4">
            <h3 className="text-sm font-semibold text-ink-900">Upload Counselling Data</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div><label className="block text-xs text-ink-500 mb-1">Authority Type</label><select className={sel} value={meta.authority} onChange={(e) => setMeta({ ...meta, authority: e.target.value })}>{AUTH.map((a) => <option key={a}>{a}</option>)}</select></div>
              <div><label className="block text-xs text-ink-500 mb-1">Counselling Year</label><select className={sel} value={meta.year} onChange={(e) => setMeta({ ...meta, year: e.target.value })}>{YEARS.map((y) => <option key={y}>{y}</option>)}</select></div>
              <div><label className="block text-xs text-ink-500 mb-1">Round</label><select className={sel} value={meta.round} onChange={(e) => setMeta({ ...meta, round: e.target.value })}>{ROUNDS.map((r) => <option key={r}>{r}</option>)}</select></div>
              <div><label className="block text-xs text-ink-500 mb-1">File Type</label><select className={sel} value={meta.ftype} onChange={(e) => setMeta({ ...meta, ftype: e.target.value })}>{FTYPES.map((f) => <option key={f}>{f}</option>)}</select></div>
            </div>
            <div onClick={() => inp.current?.click()}
              onDrop={(e) => { e.preventDefault(); setFile(e.dataTransfer.files?.[0] ?? null); }}
              onDragOver={(e) => e.preventDefault()}
              className="border-2 border-dashed border-brand-200 rounded-lg p-10 text-center cursor-pointer hover:bg-brand-50/40">
              <div className="text-3xl mb-2">⬆️</div>
              <div className="text-sm text-ink-700 font-medium">{file ? file.name : "Drag & drop your file here"}</div>
              <div className="text-xs text-ink-500 my-1">or</div>
              <span className="inline-block h-9 px-4 leading-9 rounded-md bg-brand-600 text-white text-sm">Choose File</span>
              <div className="text-xs text-ink-400 mt-2">Supports: PDF, Excel, CSV (Max 25MB)</div>
              <input ref={inp} type="file" className="hidden" accept=".pdf,.xlsx,.xls,.csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
            <div className="flex justify-end gap-2">
              <button className="h-10 px-4 rounded-md border border-border text-sm">Preview Data</button>
              <button onClick={submit} disabled={!file} className="h-10 px-4 rounded-md bg-brand-600 text-white text-sm font-medium disabled:opacity-50">Process &amp; Validate</button>
            </div>
            {result && (
              <div className="bg-surface-muted border border-border rounded-md p-3 text-xs">
                {result.ok
                  ? <><div className="text-emerald-700 font-medium">Queued (upload #{result.uploadId}). The Python ETL processes it:</div><pre className="mt-1 whitespace-pre-wrap text-ink-600">{(result.nextSteps ?? []).join("\n")}</pre></>
                  : <div className="text-amber-700">Response: {JSON.stringify(result)} {result.error === "unauthorized" && "— set ADMIN_API_TOKEN to enable uploads."}</div>}
              </div>
            )}
          </div>

          <div className="bg-white border border-border rounded-lg p-5 h-fit">
            <h3 className="text-sm font-semibold text-ink-900 mb-3">Current Dataset Summary</h3>
            {stats ? (
              <ul className="space-y-2 text-sm">
                <Row label="Cutoff records" value={stats.cutoffs} color="text-emerald-600" mark="✓" />
                <Row label="MBBS cutoffs" value={stats.mbbsCutoffs} color="text-emerald-600" mark="✓" />
                <Row label="BDS cutoffs" value={stats.bdsCutoffs} color="text-emerald-600" mark="✓" />
                <Row label="Colleges" value={stats.colleges} color="text-brand-600" mark="🏛" />
                <Row label="States covered" value={stats.states} color="text-sky-600" mark="🗺" />
              </ul>
            ) : <div className="text-ink-500 text-sm">Loading…</div>}
            <p className="text-xs text-ink-400 mt-3">Live counts from the connected database.</p>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-border rounded-lg p-8 text-sm text-ink-500">
          <b className="text-ink-700">{tab}</b> — in this build, ingestion/validation runs through the Python ETL (parse → normalize → validate → seed_database). This tab is the management UI surface for that pipeline.
        </div>
      )}
    </div>
  );
}

function Row({ label, value, color, mark }: { label: string; value: number; color: string; mark: string }) {
  return (
    <li className="flex items-center justify-between">
      <span className="text-ink-600">{label}</span>
      <span className={`font-semibold ${color}`}>{mark} {Number(value ?? 0).toLocaleString("en-IN")}</span>
    </li>
  );
}
