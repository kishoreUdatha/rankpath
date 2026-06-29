"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

const CATS = ["OPEN", "EWS", "OBC", "SC", "ST"];
const STATES = [
  { code: "", name: "All India (AIQ)" },
  { code: "AP", name: "Andhra Pradesh" },
  { code: "TG", name: "Telangana" },
  { code: "TN", name: "Tamil Nadu" },
  { code: "KA", name: "Karnataka" },
];

export function HeroPredict() {
  const router = useRouter();
  const [rank, setRank] = useState("");
  const [category, setCategory] = useState("OPEN");
  const [state, setState] = useState("");

  function go() {
    const p = new URLSearchParams({ rank, category });
    if (state) { p.set("state", state); p.set("quota", "STATE"); } else { p.set("quota", "AIQ"); }
    // Funnels through register → login → payment, preserving the intent.
    router.push(`/predict/results?${p.toString()}`);
  }

  return (
    <div className="bg-white rounded-xl border border-border shadow-lg shadow-brand-900/5 p-4 sm:p-5">
      <div className="text-sm font-semibold text-ink-900 mb-3">Check your chances in 10 seconds</div>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-xs font-medium text-ink-500 mb-1">Your NEET AIR Rank</label>
          <input value={rank} onChange={(e) => setRank(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="e.g. 28500" inputMode="numeric"
            className="w-full h-11 rounded-md border border-border px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-500 mb-1">Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)}
            className="w-full h-11 rounded-md border border-border px-2 text-sm bg-white">
            {CATS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-500 mb-1">Domicile</label>
          <select value={state} onChange={(e) => setState(e.target.value)}
            className="w-full h-11 rounded-md border border-border px-2 text-sm bg-white">
            {STATES.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
          </select>
        </div>
      </div>
      <button onClick={go} disabled={!rank}
        className="mt-4 w-full h-11 rounded-md bg-brand-600 text-white font-semibold hover:bg-brand-700 disabled:opacity-50">
        Predict My Colleges →
      </button>
      <p className="mt-2 text-[11px] text-ink-400 text-center">Free account · ₹99 one-time to unlock full results</p>
    </div>
  );
}
