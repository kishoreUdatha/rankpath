"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { estimateRankFromScore, NEET_MAX_MARKS, NEET_YEARS, LATEST_NEET_YEAR } from "@/lib/score-to-rank";

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
  const [score, setScore] = useState("");
  const [scoreYear, setScoreYear] = useState(LATEST_NEET_YEAR);
  const [mode, setMode] = useState<"rank" | "score">("rank");
  const [category, setCategory] = useState("OPEN");
  const [state, setState] = useState("");

  function onScore(v: string, year = scoreYear) {
    const raw = v.replace(/[^\d]/g, "").slice(0, 3);
    const marks = raw === "" ? 0 : Math.min(NEET_MAX_MARKS, Number(raw));
    setScore(marks ? String(marks) : "");
    setRank(marks > 0 ? String(estimateRankFromScore(marks, year)) : "");
  }

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
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-ink-500">{mode === "rank" ? "Your NEET AIR Rank" : "Your NEET Score"}</label>
            <div className="inline-flex rounded border border-border overflow-hidden text-[10px] leading-none">
              {(["rank", "score"] as const).map((m) => (
                <button key={m} type="button" onClick={() => setMode(m)}
                  className={`px-1.5 py-1 ${mode === m ? "bg-brand-600 text-white" : "text-ink-500 bg-white"}`}>
                  {m === "rank" ? "Rank" : "Score"}
                </button>
              ))}
            </div>
          </div>
          {mode === "rank" ? (
            <input value={rank} onChange={(e) => setRank(e.target.value.replace(/[^\d]/g, ""))}
              placeholder="e.g. 28500" inputMode="numeric"
              className="w-full h-11 rounded-md border border-border px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
          ) : (
            <>
              <div className="flex gap-2">
                <input value={score} onChange={(e) => onScore(e.target.value)}
                  placeholder={`Marks out of ${NEET_MAX_MARKS}`} inputMode="numeric"
                  className="flex-1 h-11 rounded-md border border-border px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
                <select value={scoreYear} title="Exam year"
                  onChange={(e) => { const y = Number(e.target.value); setScoreYear(y); onScore(score, y); }}
                  className="h-11 rounded-md border border-border px-2 text-sm bg-white">
                  {NEET_YEARS.slice().reverse().map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              {rank && Number(score) > 0 && (
                <p className="mt-1 text-[11px] text-brand-700">≈ Estimated AIR {Number(rank).toLocaleString("en-IN")} · NEET {scoreYear}</p>
              )}
            </>
          )}
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
