import { getStats } from "@/lib/queries";
import { QuickPredict } from "@/components/quick-predict";
import { ClosingTrendChart, CategoryAvgChart, StateSeatsChart } from "@/components/dashboard-charts";

export const dynamic = "force-dynamic";

function Stat({ icon, value, label, color }: { icon: string; value: string; label: string; color: string }) {
  return (
    <div className="bg-white border border-border rounded-lg p-4 flex items-center gap-3">
      <span className={`grid place-items-center w-11 h-11 rounded-lg text-lg ${color}`}>{icon}</span>
      <div>
        <div className="text-xl font-bold text-ink-900">{value}</div>
        <div className="text-xs text-ink-500">{label}</div>
      </div>
    </div>
  );
}

const UPDATES = [
  { tag: "MCC", title: "MCC Round 3 (2024)", date: "Recovered & ingested", color: "text-rose-600" },
  { tag: "AP", title: "Andhra Pradesh State", date: "2023–2025 loaded", color: "text-emerald-600" },
  { tag: "MCC", title: "AIQ Rounds R1–R3", date: "2023–2024 complete", color: "text-brand-600" },
  { tag: "DB", title: "Robust cutoffs", date: "IQR closing applied", color: "text-amber-600" },
];

export default async function Home() {
  const s = await getStats();
  return (
    <div className="space-y-6 max-w-[1200px]">
      <section className="bg-white border border-border rounded-lg p-6">
        <h1 className="text-xl font-bold text-ink-900">RankPath — NEET UG MBBS Seat Predictor</h1>
        <p className="text-sm text-ink-500 mb-5">Prediction based on 3 years of official counselling data ({s.years})</p>
        <QuickPredict />
      </section>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat icon="🏛️" value={s.colleges.toLocaleString("en-IN")} label="Colleges" color="bg-brand-50" />
        <Stat icon="🩺" value={s.mbbsCutoffs.toLocaleString("en-IN")} label="MBBS Cutoff Records" color="bg-emerald-50" />
        <Stat icon="🦷" value={s.bdsCutoffs.toLocaleString("en-IN")} label="BDS Cutoff Records" color="bg-amber-50" />
        <Stat icon="🗺️" value={String(s.states)} label="States Covered" color="bg-sky-50" />
      </section>

      <div className="flex flex-wrap gap-x-8 gap-y-1 text-xs text-ink-500 px-1">
        <span><b className="text-ink-700">Data Years:</b> {s.years}</span>
        <span><b className="text-ink-700">Cutoff records:</b> {s.cutoffs.toLocaleString("en-IN")}</span>
        <span className="text-emerald-600">● All Systems Updated</span>
      </div>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-border rounded-lg p-4">
          <h3 className="text-sm font-semibold text-ink-900 mb-2">MBBS Closing Rank Trend (AIQ OPEN, R1)</h3>
          <ClosingTrendChart data={s.trend} />
        </div>
        <div className="bg-white border border-border rounded-lg p-4">
          <h3 className="text-sm font-semibold text-ink-900 mb-2">Category-wise Avg Closing Rank (AIQ MBBS, 2024)</h3>
          <CategoryAvgChart data={s.categoryAvg} />
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-ink-900">State-wise Seats (2024, Round 1)</h3>
            <a href="/states" className="text-xs text-brand-600 hover:underline">View all →</a>
          </div>
          <StateSeatsChart data={s.byState} />
          <p className="text-xs text-ink-400 mt-1">Top 12 states by seats allotted across all quotas.</p>
        </div>
        <div className="bg-white border border-border rounded-lg p-4">
          <h3 className="text-sm font-semibold text-ink-900 mb-2">State-wise Seat Distribution</h3>
          <div className="overflow-auto max-h-[330px]">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-ink-500 text-xs uppercase sticky top-0">
                <tr>
                  <th className="text-left font-medium px-3 py-2">State</th>
                  <th className="text-right font-medium px-3 py-2">Colleges</th>
                  <th className="text-right font-medium px-3 py-2">Seats</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {s.byState.map((r) => (
                  <tr key={r.code} className="hover:bg-surface-muted">
                    <td className="px-3 py-2 text-ink-800"><span className="text-ink-400 mr-1">{r.code}</span>{r.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink-600">{r.colleges.toLocaleString("en-IN")}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-ink-900">{r.seats.toLocaleString("en-IN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="bg-white border border-border rounded-lg p-4">
        <h3 className="text-sm font-semibold text-ink-900 mb-3">Recent Updates</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {UPDATES.map((u, i) => (
            <div key={i} className="border border-border rounded-md p-3">
              <div className={`text-xs font-semibold ${u.color}`}>▌ {u.tag}</div>
              <div className="text-sm font-medium text-ink-900 mt-1">{u.title}</div>
              <div className="text-xs text-ink-500">{u.date}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
