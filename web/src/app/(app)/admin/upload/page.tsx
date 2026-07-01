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
  const [busy, setBusy] = useState(false);
  const inp = useRef<HTMLInputElement>(null);
  const isCsv = !!file && /\.csv$/i.test(file.name);

  function refreshStats() { fetch("/api/stats").then((r) => r.json()).then(setStats).catch(() => {}); }
  useEffect(refreshStats, []);

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

  // Parse + store + process a CSV straight into the DB (CutoffSummary).
  async function importCsv() {
    if (!file) return;
    setBusy(true); setResult(null);
    const fd = new FormData(); fd.append("file", file);
    try {
      const r = await fetch("/api/admin/import", { method: "POST", body: fd });
      setResult(await r.json().catch(() => ({ status: r.status })));
      refreshStats();
    } catch (e: any) { setResult({ error: String(e) }); }
    setBusy(false);
  }

  function downloadTemplate() {
    const csv = "state,college,year,round,quota,category,opening,closing\n" +
      "AP,Andhra Medical College Visakhapatnam,2024,R1,STATE,OPEN,742,9425\n" +
      "KA,Bangalore Medical College,2024,R1,STATE,OPEN,120,2154\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = "cutoffs_template.csv"; a.click(); URL.revokeObjectURL(url);
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
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <button onClick={downloadTemplate} className="text-xs text-brand-600 hover:underline">↓ Download CSV template</button>
              <div className="flex gap-2">
                <button onClick={submit} disabled={!file || busy} className="h-10 px-4 rounded-md border border-border text-sm disabled:opacity-50" title="Queue a PDF/Excel for the Python ETL">Queue file (PDF/Excel)</button>
                <button onClick={importCsv} disabled={!isCsv || busy} className="h-10 px-4 rounded-md bg-brand-600 text-white text-sm font-medium disabled:opacity-50" title="Parse a CSV and store cutoffs directly in the DB">{busy ? "Processing…" : "Import to DB (CSV)"}</button>
              </div>
            </div>
            <p className="text-xs text-ink-400">
              CSV columns: <code className="text-ink-600">state, college, year, round, quota, category, opening, closing</code>.
              Colleges are matched to existing records within the state (unmatched rows are reported, never guessed). Categories: OPEN/EWS/OBC/SC/ST.
            </p>
            {result && (
              <div className="bg-surface-muted border border-border rounded-md p-3 text-xs space-y-1">
                {result.inserted !== undefined ? (
                  <>
                    <div className="text-emerald-700 font-medium">Processed “{result.filename}” — {result.rowsParsed} rows.</div>
                    <div className="text-ink-700">Inserted <b>{result.inserted}</b> · Updated <b>{result.updated}</b> · Skipped <b>{result.skipped}</b></div>
                    {result.unmatchedColleges?.length > 0 && (
                      <div className="text-amber-700">Unmatched colleges ({result.unmatchedColleges.length}): <span className="text-ink-600">{result.unmatchedColleges.join("; ")}</span></div>
                    )}
                    {result.errors?.length > 0 && (
                      <pre className="whitespace-pre-wrap text-amber-700 mt-1">{result.errors.join("\n")}</pre>
                    )}
                  </>
                ) : result.ok ? (
                  <><div className="text-emerald-700 font-medium">Queued (upload #{result.uploadId}) for the Python ETL:</div><pre className="mt-1 whitespace-pre-wrap text-ink-600">{(result.nextSteps ?? []).join("\n")}</pre></>
                ) : (
                  <div className="text-amber-700">Error: {result.error || JSON.stringify(result)} {result.error === "forbidden" && "— admin role required."}</div>
                )}
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
