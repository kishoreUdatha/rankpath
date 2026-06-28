"use client";
import * as React from "react";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CATEGORY_OPTIONS, QUOTA_OPTIONS, STATE_OPTIONS } from "@/lib/category-normalize";

export interface AllotmentFilters {
  year?: string; round?: string; state?: string; authority?: string;
  category?: string; quota?: string; collegeType?: string;
  rankMin?: string; rankMax?: string; feeBand?: string;
}

export function FilterBar({ value, onChange, onApply }: {
  value: AllotmentFilters;
  onChange: (v: AllotmentFilters) => void;
  onApply: () => void;
}) {
  const set = (k: keyof AllotmentFilters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...value, [k]: e.target.value });

  return (
    <div className="card p-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
      <Select value={value.year ?? ""} onChange={set("year")}>
        <option value="">Year</option>{[2025, 2024, 2023].map(y => <option key={y} value={y}>{y}</option>)}
      </Select>
      <Select value={value.round ?? ""} onChange={set("round")}>
        <option value="">Round</option>{["R1", "R2", "R3", "MOPUP", "STRAY"].map(r => <option key={r} value={r}>{r}</option>)}
      </Select>
      <Select value={value.state ?? ""} onChange={set("state")}>
        <option value="">State</option>{STATE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
      </Select>
      <Select value={value.category ?? ""} onChange={set("category")}>
        <option value="">Category</option>{CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
      </Select>
      <Select value={value.quota ?? ""} onChange={set("quota")}>
        <option value="">Quota</option>{QUOTA_OPTIONS.map(q => <option key={q} value={q}>{q}</option>)}
      </Select>
      <Select value={value.collegeType ?? ""} onChange={set("collegeType")}>
        <option value="">College type</option>{["GOVT","PRIVATE","DEEMED","AIIMS","JIPMER","ESIC","CENTRAL"].map(t => <option key={t} value={t}>{t}</option>)}
      </Select>
      <Input type="number" placeholder="Rank ≥" value={value.rankMin ?? ""} onChange={set("rankMin")} />
      <Input type="number" placeholder="Rank ≤" value={value.rankMax ?? ""} onChange={set("rankMax")} />
      <Select value={value.feeBand ?? ""} onChange={set("feeBand")}>
        <option value="">Fee band</option>{["LOW","MID","HIGH","VERY_HIGH"].map(f => <option key={f} value={f}>{f}</option>)}
      </Select>
      <div className="col-span-2 md:col-span-1 lg:col-span-1">
        <Button onClick={onApply} className="w-full">Apply</Button>
      </div>
    </div>
  );
}
