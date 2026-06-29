"use client";
import * as React from "react";
import { FilterBar, type AllotmentFilters } from "@/components/filter-bar";
import { CutoffTable } from "@/components/cutoff-table";
import type { ColumnDef } from "@tanstack/react-table";
import { fmtRank } from "@/lib/utils";

type Row = {
  id: string;
  year: number; round: string;
  rawInstituteName: string | null;
  rawCourse: string | null;
  normalizedCategory: string | null;
  normalizedQuota: string | null;
  candidateRank: number | null;
  state: string | null;
  collegeType: string;
  college: { name: string; type: string };
};

const columns: ColumnDef<Row>[] = [
  { header: "College", accessorFn: (r) => r.college?.name ?? r.rawInstituteName ?? "—",
    cell: ({ row }) => <div><div className="font-medium">{row.original.college?.name ?? row.original.rawInstituteName}</div><div className="text-xs text-ink-500">{row.original.collegeType} · {row.original.state ?? "—"}</div></div> },
  { header: "Year",     accessorKey: "year" },
  { header: "Round",    accessorKey: "round" },
  { header: "Category", accessorKey: "normalizedCategory" },
  { header: "Quota",    accessorKey: "normalizedQuota" },
  { header: "Rank",     accessorKey: "candidateRank", cell: ({ getValue }) => <span className="tabular-nums">{fmtRank(getValue<number | null>())}</span> },
];

export default function CollegesPage() {
  const [filters, setFilters] = React.useState<AllotmentFilters>({ year: "2025", round: "R1", category: "OPEN" });
  const [rows, setRows] = React.useState<Row[]>([]);
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) qs.set(k, v);
    qs.set("limit", "500");
    const r = await fetch(`/api/allotments?${qs}`);
    const j = await r.json();
    setRows(j.rows ?? []);
    setLoading(false);
  }, [filters]);

  React.useEffect(() => { load(); /* initial */ }, []); // eslint-disable-line

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">College-wise Cutoff Explorer</h1>
        <p className="text-ink-500 text-sm">Closing-rank rows for every college, filterable by year, round, category, quota, and rank band.</p>
      </header>
      <FilterBar value={filters} onChange={setFilters} onApply={load} />
      <div className="card">
        {loading ? <div className="p-8 text-center text-ink-500">Loading…</div>
                 : <CutoffTable data={rows} columns={columns} />}
      </div>
    </div>
  );
}
