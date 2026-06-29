"use client";
import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

export default function AdminPage() {
  const [token, setToken] = React.useState("");
  const [authority, setAuthority] = React.useState("MCC");
  const [year, setYear] = React.useState<number | "">(2025);
  const [round, setRound] = React.useState("R1");
  const [file, setFile] = React.useState<File | null>(null);
  const [result, setResult] = React.useState<any>(null);
  const [busy, setBusy] = React.useState(false);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true); setResult(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("authority", authority);
    if (year) fd.append("year", String(year));
    fd.append("round", round);
    const r = await fetch("/api/upload", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: fd,
    });
    const j = await r.json();
    setResult({ status: r.status, body: j });
    setBusy(false);
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Admin · Data Upload</h1>
        <p className="text-ink-500 text-sm">
          Upload official PDF/XLS/CSV allotment files. They are saved under <code>data/raw/uploads/</code> and
          queued as <em>Pending Review</em>; the Python ETL parses, normalizes, validates, then loads them.
        </p>
      </header>

      <Card>
        <CardHeader><CardTitle>Upload allotment file</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={upload} className="space-y-4">
            <div>
              <Label>Admin API token</Label>
              <Input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="ADMIN_API_TOKEN from .env" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Authority</Label>
                <Select value={authority} onChange={(e) => setAuthority(e.target.value)}>
                  {["MCC","KEA","NTRUHS","KNRUHS","TNMCC","MH-CET","CEE-KL","UPDGME","WBMCC","MCC-RJ","MCC-GJ"].map(a => <option key={a}>{a}</option>)}
                </Select>
              </div>
              <div>
                <Label>Year</Label>
                <Input type="number" value={year} onChange={(e) => setYear(e.target.value ? Number(e.target.value) : "")} />
              </div>
              <div>
                <Label>Round</Label>
                <Select value={round} onChange={(e) => setRound(e.target.value)}>
                  {["R1","R2","R3","MOPUP","STRAY"].map(r => <option key={r}>{r}</option>)}
                </Select>
              </div>
            </div>
            <div>
              <Label>File (PDF / XLSX / CSV, ≤ 50 MB)</Label>
              <Input type="file" accept=".pdf,.xlsx,.xls,.csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
            <Button type="submit" disabled={busy || !file || !token}>{busy ? "Uploading…" : "Upload"}</Button>
          </form>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader><CardTitle>Result</CardTitle></CardHeader>
          <CardContent>
            <pre className="text-xs overflow-x-auto bg-surface-muted p-3 rounded-md">{JSON.stringify(result, null, 2)}</pre>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Reviewer workflow</CardTitle></CardHeader>
        <CardContent>
          <ol className="list-decimal list-inside text-sm space-y-1 text-ink-700">
            <li>Upload here → file lands in <code>data/raw/uploads/</code>, an <code>AdminUpload</code> row is created with status <code>PENDING_REVIEW</code>.</li>
            <li>From a shell, run the ETL commands shown in the response.</li>
            <li>Review rejected rows in <code>data/normalized/rejected.csv</code>; if unknown category/quota codes appear, add them to <code>etl/mappings/*.json</code> and re-run.</li>
            <li>Approve = set <code>AdminUpload.status = PUBLISHED</code> (a follow-up CLI command).</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
