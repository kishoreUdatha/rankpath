"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { STATES as ALL_STATES, STATE_CODES } from "@/lib/states";

const CATS = ["OPEN", "EWS", "OBC", "SC", "ST", "BC-A", "BC-B", "BC-C", "BC-D", "BC-E"];
const STATES = [{ code: "", name: "All India (AIQ)" }, ...ALL_STATES];

export function QuickPredict() {
  const router = useRouter();
  const [rank, setRank] = useState("");
  const [category, setCategory] = useState("OPEN");
  const [state, setState] = useState("");

  // Pre-fill from the logged-in student's profile.
  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then(({ user }) => {
      if (!user) return;
      if (user.neetRank) setRank((v) => v || String(user.neetRank));
      if (CATS.includes(user.category)) setCategory(user.category);
      if (user.domicileState && STATE_CODES.has(user.domicileState)) setState(user.domicileState);
    }).catch(() => {});
  }, []);

  function go() {
    const p = new URLSearchParams({ rank, category });
    if (state) { p.set("state", state); p.set("quota", "STATE"); } else { p.set("quota", "AIQ"); }
    router.push(`/predict/results?${p.toString()}`);
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
      <div>
        <label className="block text-xs font-medium text-ink-500 mb-1">AIR Rank</label>
        <input value={rank} onChange={(e) => setRank(e.target.value.replace(/[^\d]/g, ""))}
          placeholder="Enter AIR Rank" inputMode="numeric"
          className="w-full h-10 rounded-md border border-border px-3 text-sm focus:ring-2 focus:ring-ring outline-none" />
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-500 mb-1">Category</label>
        <select value={category} onChange={(e) => setCategory(e.target.value)}
          className="w-full h-10 rounded-md border border-border px-3 text-sm bg-white">
          {CATS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-500 mb-1">State Domicile</label>
        <select value={state} onChange={(e) => setState(e.target.value)}
          className="w-full h-10 rounded-md border border-border px-3 text-sm bg-white">
          {STATES.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
        </select>
      </div>
      <button onClick={go} disabled={!rank}
        className="h-10 rounded-md bg-brand-600 text-white font-medium text-sm hover:bg-brand-700 disabled:opacity-50">
        Predict My Chances
      </button>
    </div>
  );
}
