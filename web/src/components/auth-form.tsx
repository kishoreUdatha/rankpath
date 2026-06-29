"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

const CATEGORIES = ["OPEN", "EWS", "OBC", "SC", "ST"];
const GENDERS = ["Male", "Female", "Other"];
const STATES: { code: string; name: string }[] = [
  { code: "AP", name: "Andhra Pradesh" }, { code: "AR", name: "Arunachal Pradesh" },
  { code: "AS", name: "Assam" }, { code: "BR", name: "Bihar" }, { code: "CG", name: "Chhattisgarh" },
  { code: "GA", name: "Goa" }, { code: "GJ", name: "Gujarat" }, { code: "HR", name: "Haryana" },
  { code: "HP", name: "Himachal Pradesh" }, { code: "JH", name: "Jharkhand" }, { code: "KA", name: "Karnataka" },
  { code: "KL", name: "Kerala" }, { code: "MP", name: "Madhya Pradesh" }, { code: "MH", name: "Maharashtra" },
  { code: "MN", name: "Manipur" }, { code: "ML", name: "Meghalaya" }, { code: "MZ", name: "Mizoram" },
  { code: "NL", name: "Nagaland" }, { code: "OD", name: "Odisha" }, { code: "PB", name: "Punjab" },
  { code: "RJ", name: "Rajasthan" }, { code: "TN", name: "Tamil Nadu" }, { code: "TG", name: "Telangana" },
  { code: "TR", name: "Tripura" }, { code: "UP", name: "Uttar Pradesh" }, { code: "UK", name: "Uttarakhand" },
  { code: "WB", name: "West Bengal" }, { code: "DL", name: "Delhi" }, { code: "JK", name: "Jammu & Kashmir" },
  { code: "PY", name: "Puducherry" }, { code: "CH", name: "Chandigarh" }, { code: "AN", name: "Andaman & Nicobar" },
  { code: "DN", name: "Dadra & Nagar Haveli" },
];

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") || "/dashboard";
  const isReg = mode === "register";

  const [f, setF] = useState({
    name: "", email: "", password: "", phone: "",
    category: "OPEN", domicileState: "", gender: "", neetRank: "", neetScore: "", neetYear: "",
  });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((s) => ({ ...s, [k]: e.target.value }));

  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      const body: any = { email: f.email, password: f.password };
      if (isReg) {
        Object.assign(body, {
          name: f.name, phone: f.phone, category: f.category, domicileState: f.domicileState,
          ...(f.gender ? { gender: f.gender } : {}),
          ...(f.neetRank ? { neetRank: f.neetRank } : {}),
          ...(f.neetScore ? { neetScore: f.neetScore } : {}),
          ...(f.neetYear ? { neetYear: f.neetYear } : {}),
        });
      }
      const r = await fetch(`/api/auth/${mode}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(
          d.error === "email_taken" ? "An account with this email already exists."
          : d.error === "invalid_credentials" ? "Incorrect email or password."
          : d.error === "invalid_input" ? "Please check the highlighted details — a valid email, 10-digit phone, category, state and a 6+ character password are required."
          : "Something went wrong. Please try again."
        );
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setErr("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const inp = "w-full h-10 rounded-md border border-border px-3 text-sm outline-none focus:ring-2 focus:ring-ring bg-white";

  return (
    <div className={`w-full ${isReg ? "max-w-xl" : "max-w-sm"}`}>
      <div className="text-center mb-6">
        <Link href="/" className="inline-flex items-center gap-2 mb-4">
          <span className="inline-grid place-items-center w-9 h-9 rounded-lg bg-brand-600 text-white font-bold">R</span>
          <span className="font-bold text-lg text-ink-900">RankPath</span>
        </Link>
        <h1 className="text-xl font-bold text-ink-900">{isReg ? "Create your account" : "Welcome back"}</h1>
        <p className="text-sm text-ink-500 mt-1">{isReg ? "Tell us about your NEET attempt to personalise predictions." : "Login to access your predictions."}</p>
      </div>

      <form onSubmit={submit} className="bg-white border border-border rounded-lg p-6 space-y-4 shadow-sm">
        {isReg ? (
          <>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Full name" req><input value={f.name} onChange={set("name")} required placeholder="Your name" className={inp} /></Field>
              <Field label="Mobile number" req>
                <input value={f.phone} onChange={(e) => setF((s) => ({ ...s, phone: e.target.value.replace(/[^\d]/g, "").slice(0, 10) }))}
                  required inputMode="numeric" placeholder="10-digit mobile" className={inp} />
              </Field>
            </div>
            <Field label="Email" req><input type="email" value={f.email} onChange={set("email")} required placeholder="you@example.com" className={inp} /></Field>
            <Field label="Password" req><input type="password" value={f.password} onChange={set("password")} required minLength={6} placeholder="At least 6 characters" className={inp} /></Field>

            <div className="pt-2 border-t border-border">
              <div className="text-xs font-semibold text-ink-700 mb-3">NEET details</div>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Category" req>
                  <select value={f.category} onChange={set("category")} required className={inp}>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="State / Domicile" req>
                  <select value={f.domicileState} onChange={set("domicileState")} required className={inp}>
                    <option value="">Select state</option>
                    {STATES.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
                  </select>
                </Field>
                <Field label="Gender">
                  <select value={f.gender} onChange={set("gender")} className={inp}>
                    <option value="">Prefer not to say</option>
                    {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </Field>
                <Field label="NEET attempt year">
                  <input value={f.neetYear} onChange={(e) => setF((s) => ({ ...s, neetYear: e.target.value.replace(/[^\d]/g, "").slice(0, 4) }))}
                    inputMode="numeric" placeholder="e.g. 2025" className={inp} />
                </Field>
                <Field label="NEET AIR rank">
                  <input value={f.neetRank} onChange={(e) => setF((s) => ({ ...s, neetRank: e.target.value.replace(/[^\d]/g, "") }))}
                    inputMode="numeric" placeholder="Optional" className={inp} />
                </Field>
                <Field label="NEET score / 720">
                  <input value={f.neetScore} onChange={(e) => setF((s) => ({ ...s, neetScore: e.target.value.replace(/[^\d]/g, "").slice(0, 3) }))}
                    inputMode="numeric" placeholder="Optional" className={inp} />
                </Field>
              </div>
            </div>
          </>
        ) : (
          <>
            <Field label="Email"><input type="email" value={f.email} onChange={set("email")} required placeholder="you@example.com" className={inp} /></Field>
            <Field label="Password"><input type="password" value={f.password} onChange={set("password")} required placeholder="••••••••" className={inp} /></Field>
          </>
        )}

        {err && <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">{err}</div>}

        <button type="submit" disabled={busy}
          className="w-full h-11 rounded-md bg-brand-600 text-white font-semibold hover:bg-brand-700 disabled:opacity-60">
          {busy ? "Please wait…" : isReg ? "Create account" : "Login"}
        </button>
      </form>

      <p className="text-center text-sm text-ink-500 mt-4">
        {isReg ? (
          <>Already have an account? <Link href={`/login${next !== "/dashboard" ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-brand-700 font-medium hover:underline">Login</Link></>
        ) : (
          <>New to RankPath? <Link href={`/register${next !== "/dashboard" ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-brand-700 font-medium hover:underline">Create an account</Link></>
        )}
      </p>
    </div>
  );
}

function Field({ label, req, children }: { label: string; req?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-ink-700 mb-1">{label}{req && <span className="text-rose-500"> *</span>}</label>
      {children}
    </div>
  );
}
