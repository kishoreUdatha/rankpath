"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { STATES as ALL_STATES, STATE_CODES } from "@/lib/states";
import { estimateRankFromScore, NEET_MAX_MARKS } from "@/lib/score-to-rank";

const STEPS = ["Rank / Score", "Category & Quota", "Preferences", "Review", "Results"];
const CATS = ["OPEN", "EWS", "OBC", "SC", "ST", "BC-A", "BC-B", "BC-C", "BC-D", "BC-E"];
const STATES = [{ c: "", n: "—" }, ...ALL_STATES.map((s) => ({ c: s.code, n: s.name }))];
const QUOTAS = ["AIQ", "STATE", "DEEMED", "NRI", "ESIC_IP"];

function Stepper({ step }: { step: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8 flex-wrap">
      {STEPS.map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          <span className={`grid place-items-center w-7 h-7 rounded-full text-xs font-semibold ${i <= step ? "bg-brand-600 text-white" : "bg-slate-200 text-ink-500"}`}>{i + 1}</span>
          <span className={`text-sm ${i === step ? "text-ink-900 font-medium" : "text-ink-500"}`}>{s}</span>
          {i < STEPS.length - 1 && <span className="w-8 h-px bg-border mx-1" />}
        </div>
      ))}
    </div>
  );
}

function Field({ label, children }: any) {
  return <div><label className="block text-sm font-medium text-ink-700 mb-1">{label}</label>{children}</div>;
}
const selCls = "w-full h-10 rounded-md border border-border px-3 text-sm bg-white";

export default function PredictWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [d, setD] = useState({ rank: "", score: "", entryMode: "rank", category: "OPEN", subCategory: "", state: "", quota: "AIQ", pwd: "No", gender: "Any" });
  const set = (k: string, v: string) => setD((s) => ({ ...s, [k]: v }));
  const [prefilled, setPrefilled] = useState(false);

  // Pre-fill from the student's saved profile (rank, category, domicile, gender).
  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then(({ user }) => {
      if (!user) return;
      // If the student saved a score but no rank, open in score mode with an estimate.
      const scoreOnly = !user.neetRank && user.neetScore;
      const est = scoreOnly ? estimateRankFromScore(Number(user.neetScore)) : 0;
      setD((s) => ({
        ...s,
        entryMode: scoreOnly ? "score" : s.entryMode,
        score: scoreOnly ? String(user.neetScore) : s.score,
        rank: s.rank || (user.neetRank ? String(user.neetRank) : (est ? String(est) : "")),
        category: CATS.includes(user.category) ? user.category : s.category,
        state: user.domicileState && STATE_CODES.has(user.domicileState) ? user.domicileState : s.state,
        quota: user.domicileState && STATE_CODES.has(user.domicileState) ? "STATE" : s.quota,
        gender: user.gender === "Male" || user.gender === "Female" ? user.gender : s.gender,
      }));
      if (user.neetRank || user.neetScore || user.category || user.domicileState) setPrefilled(true);
    }).catch(() => {});
  }, []);

  function finish() {
    const p = new URLSearchParams({ rank: d.rank, category: d.category, quota: d.quota });
    if (d.state) p.set("state", d.state);
    if (d.gender !== "Any") p.set("gender", d.gender[0]);
    if (d.pwd === "Yes") p.set("pwd", "1");
    router.push(`/predict/results?${p}`);
  }

  const canNext = step !== 0 || (d.rank && Number(d.rank) > 0);

  return (
    <div className="max-w-[1100px] mx-auto">
      <h1 className="text-xl font-bold text-ink-900 text-center mb-1">Predict My Colleges</h1>
      <p className="text-sm text-ink-500 text-center mb-3">Based on 3 years of official counselling data</p>
      {prefilled && (
        <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-1.5 w-fit mx-auto mb-6">
          ✓ Pre-filled from your profile — edit anything below.
        </p>
      )}
      <div className="bg-white border border-border rounded-lg p-6">
        <Stepper step={step} />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-5">
            {step === 0 && (
              <div className="space-y-4">
                <div className="inline-flex rounded-md border border-border overflow-hidden text-sm">
                  {(["rank", "score"] as const).map((mode) => (
                    <button key={mode} type="button" onClick={() => set("entryMode", mode)}
                      className={`px-4 h-9 ${d.entryMode === mode ? "bg-brand-600 text-white" : "bg-white text-ink-600"}`}>
                      {mode === "rank" ? "I know my AIR Rank" : "I know my NEET Score"}
                    </button>
                  ))}
                </div>
                {d.entryMode === "rank" ? (
                  <Field label="AIR Rank (NEET All-India Rank)">
                    <input value={d.rank} onChange={(e) => set("rank", e.target.value.replace(/[^\d]/g, ""))}
                      placeholder="Enter AIR Rank" inputMode="numeric" className={selCls} />
                    <p className="text-xs text-ink-500 mt-2">Your overall NEET-UG rank as per the official result.</p>
                  </Field>
                ) : (
                  <Field label={`NEET Score (marks out of ${NEET_MAX_MARKS})`}>
                    <input value={d.score} inputMode="numeric" className={selCls} placeholder="e.g. 620"
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^\d]/g, "").slice(0, 3);
                        const marks = raw === "" ? 0 : Math.min(NEET_MAX_MARKS, Number(raw));
                        const est = marks > 0 ? estimateRankFromScore(marks) : 0;
                        setD((s) => ({ ...s, score: marks ? String(marks) : "", rank: est ? String(est) : "" }));
                      }} />
                    {d.rank && Number(d.score) > 0 ? (
                      <p className="text-sm mt-2 text-brand-800 bg-brand-50 border border-brand-100 rounded-md px-3 py-2">
                        ≈ Estimated AIR <b>{Number(d.rank).toLocaleString("en-IN")}</b>
                        <span className="block text-xs text-ink-500 mt-0.5">Approximate, from typical NEET marks-vs-rank trends. We'll predict colleges using this rank.</span>
                      </p>
                    ) : (
                      <p className="text-xs text-ink-500 mt-2">Enter your NEET marks — we'll estimate your All-India Rank, then predict colleges.</p>
                    )}
                  </Field>
                )}
              </div>
            )}
            {step === 1 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <Field label="Category"><select className={selCls} value={d.category} onChange={(e) => set("category", e.target.value)}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></Field>
                <Field label="Sub Category (if any)"><input className={selCls} placeholder="e.g. PwD, CW, NCC" value={d.subCategory} onChange={(e) => set("subCategory", e.target.value)} /></Field>
                <Field label="State Domicile"><select className={selCls} value={d.state} onChange={(e) => set("state", e.target.value)}>{STATES.map((s) => <option key={s.c} value={s.c}>{s.n}</option>)}</select></Field>
                <Field label="Quota"><select className={selCls} value={d.quota} onChange={(e) => set("quota", e.target.value)}>{QUOTAS.map((q) => <option key={q}>{q}</option>)}</select></Field>
                <Field label="PwD"><div className="flex gap-4 h-10 items-center">{["Yes", "No"].map((v) => <label key={v} className="flex items-center gap-1.5 text-sm"><input type="radio" checked={d.pwd === v} onChange={() => set("pwd", v)} />{v}</label>)}</div></Field>
                <Field label="Gender"><div className="flex gap-4 h-10 items-center">{["Male", "Female", "Any"].map((v) => <label key={v} className="flex items-center gap-1.5 text-sm"><input type="radio" checked={d.gender === v} onChange={() => set("gender", v)} />{v}</label>)}</div></Field>
              </div>
            )}
            {step === 2 && (
              <div className="text-sm text-ink-600 space-y-3">
                <p>Preferences are optional — leave blank to search all colleges. (Preferred states / college types / budget can be added here.)</p>
                <Field label="Quota override"><select className={selCls} value={d.quota} onChange={(e) => set("quota", e.target.value)}>{QUOTAS.map((q) => <option key={q}>{q}</option>)}</select></Field>
              </div>
            )}
            {step === 3 && (
              <div className="text-sm">
                <h3 className="font-semibold text-ink-900 mb-3">Review your details</h3>
                <dl className="grid grid-cols-2 gap-y-2">
                  {[...(d.entryMode === "score" && d.score ? [["NEET Score", `${d.score} / ${NEET_MAX_MARKS}`]] : []), [d.entryMode === "score" ? "AIR Rank (est.)" : "AIR Rank", d.rank || "—"], ["Category", d.category], ["Sub Category", d.subCategory || "—"], ["State", d.state || "All India"], ["Quota", d.quota], ["PwD", d.pwd], ["Gender", d.gender]].map(([k, v]) => (
                    <div key={k as string} className="contents"><dt className="text-ink-500">{k}</dt><dd className="text-ink-900 font-medium">{v}</dd></div>
                  ))}
                </dl>
              </div>
            )}
            <div className="bg-brand-50 border border-brand-100 rounded-md p-3 text-xs text-brand-800">
              ℹ️ Prediction is based on past 3 years counselling data, category, quota, rank, state and college preference.
            </div>
          </div>

          {/* Your Details panel */}
          <aside className="bg-surface-muted border border-border rounded-lg p-4 text-sm h-fit">
            <h4 className="font-semibold text-ink-900 mb-3">Your Details</h4>
            <dl className="space-y-2">
              {[...(d.entryMode === "score" && d.score ? [["NEET Score", `${d.score} / ${NEET_MAX_MARKS}`]] : []), [d.entryMode === "score" ? "AIR Rank (est.)" : "AIR Rank", d.rank || "Not set"], ["Category", d.category], ["State", d.state || "All India"], ["Quota", d.quota], ["PwD", d.pwd], ["Gender", d.gender]].map(([k, v]) => (
                <div key={k as string}><dt className="text-ink-500 text-xs">{k}</dt><dd className="text-ink-900 font-medium">{v}</dd></div>
              ))}
            </dl>
            <a href="/strategy" className="block mt-4 text-brand-600 text-sm font-medium">View Strategy Guide →</a>
          </aside>
        </div>

        <div className="flex justify-between mt-6 pt-4 border-t border-border">
          <button onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}
            className="h-10 px-5 rounded-md border border-border text-sm disabled:opacity-40">Previous</button>
          {step < 3 ? (
            <button onClick={() => canNext && setStep((s) => s + 1)} disabled={!canNext}
              className="h-10 px-5 rounded-md bg-brand-600 text-white text-sm font-medium disabled:opacity-50">Next: {STEPS[step + 1]}</button>
          ) : (
            <button onClick={finish} disabled={!d.rank}
              className="h-10 px-5 rounded-md bg-brand-600 text-white text-sm font-medium disabled:opacity-50">Predict My Colleges</button>
          )}
        </div>
      </div>
    </div>
  );
}
