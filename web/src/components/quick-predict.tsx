"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { STATES as ALL_STATES, STATE_CODES } from "@/lib/states";
import { estimateRankFromScore, NEET_MAX_MARKS } from "@/lib/score-to-rank";

const CATS = ["OPEN", "EWS", "OBC", "SC", "ST", "BC-A", "BC-B", "BC-C", "BC-D", "BC-E"];
const STATES = [{ code: "", name: "All India (AIQ)" }, ...ALL_STATES];

export function QuickPredict() {
  const router = useRouter();
  const [rank, setRank] = useState("");
  const [score, setScore] = useState("");
  const [mode, setMode] = useState<"rank" | "score">("rank");
  const [category, setCategory] = useState("OPEN");
  const [state, setState] = useState("");

  // Pre-fill from the logged-in student's profile.
  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then(({ user }) => {
      if (!user) return;
      if (!user.neetRank && user.neetScore) {
        // Saved a score but no rank → open in score mode with an estimate.
        setMode("score");
        setScore((v) => v || String(user.neetScore));
        setRank((v) => v || String(estimateRankFromScore(Number(user.neetScore))));
      } else if (user.neetRank) {
        setRank((v) => v || String(user.neetRank));
      }
      if (CATS.includes(user.category)) setCategory(user.category);
      if (user.domicileState && STATE_CODES.has(user.domicileState)) setState(user.domicileState);
    }).catch(() => {});
  }, []);

  function onScore(v: string) {
    const raw = v.replace(/[^\d]/g, "").slice(0, 3);
    const marks = raw === "" ? 0 : Math.min(NEET_MAX_MARKS, Number(raw));
    setScore(marks ? String(marks) : "");
    setRank(marks > 0 ? String(estimateRankFromScore(marks)) : "");
  }

  function go() {
    const p = new URLSearchParams({ rank, category });
    if (state) { p.set("state", state); p.set("quota", "STATE"); } else { p.set("quota", "AIQ"); }
    router.push(`/predict/results?${p.toString()}`);
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
      <div className="relative">
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-ink-500">{mode === "rank" ? "AIR Rank" : "NEET Score"}</label>
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
            placeholder="Enter AIR Rank" inputMode="numeric"
            className="w-full h-10 rounded-md border border-border px-3 text-sm focus:ring-2 focus:ring-ring outline-none" />
        ) : (
          <>
            <input value={score} onChange={(e) => onScore(e.target.value)}
              placeholder={`Marks / ${NEET_MAX_MARKS}`} inputMode="numeric"
              className="w-full h-10 rounded-md border border-border px-3 text-sm focus:ring-2 focus:ring-ring outline-none" />
            {rank && Number(score) > 0 && (
              <span className="absolute left-0 top-full mt-1 text-[11px] text-brand-700">≈ Est. AIR {Number(rank).toLocaleString("en-IN")}</span>
            )}
          </>
        )}
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
