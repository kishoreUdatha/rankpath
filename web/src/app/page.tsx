import Link from "next/link";
import { getStats } from "@/lib/queries";
import { getSession } from "@/lib/auth";
import { rupees, UNLOCK_PRICE_PAISE } from "@/lib/pricing";
import { HeroPredict } from "@/components/hero-predict";

export const dynamic = "force-dynamic";

const FEATURES = [
  { icon: "🎯", tint: "bg-brand-50 text-brand-700", title: "AIR-based Predictions", desc: "A probability-scored college list for your exact rank, category and quota — not a generic cutoff table." },
  { icon: "🧭", tint: "bg-emerald-50 text-emerald-700", title: "Counselling Strategy", desc: "Auto-sorted Dream / Realistic / Safe lists and a web-options plan so you lock choices in the right order." },
  { icon: "📈", tint: "bg-amber-50 text-amber-700", title: "Cutoff Explorer", desc: "Year-on-year opening & closing ranks across MCC AIQ, Deemed, Central and state quotas." },
  { icon: "🏛️", tint: "bg-sky-50 text-sky-700", title: "College Profiles", desc: "Per-college cutoff trends, category splits and quota breakdowns at a glance." },
];

const STEPS = [
  { n: "1", title: "Create your free account", desc: "Sign up with your email in under a minute." },
  { n: "2", title: `Unlock for ${rupees(UNLOCK_PRICE_PAISE)}`, desc: "One-time payment. No subscription, full access all counselling season." },
  { n: "3", title: "Predict & plan", desc: "Get your personalised college list and counselling strategy instantly." },
];

const FAQ = [
  { q: "How accurate are the predictions?", a: "Predictions are probability estimates built from 3 years of official MCC and state allotment data, projected with a weighted trend model. They are a strong planning aid — not a guarantee of admission." },
  { q: "What does the ₹99 unlock include?", a: "Unlimited rank predictions, Dream/Realistic/Safe college lists, the counselling & web-options strategy, the cutoff explorer and college profiles — for the whole season." },
  { q: "Is this a subscription?", a: "No. It is a single one-time payment. You are never auto-charged." },
  { q: "Which quotas and states are covered?", a: "Nationwide All India Quota (AIQ), Deemed and Central institutes, plus state-quota cutoffs for 9 states — Andhra Pradesh, Gujarat, Karnataka, Madhya Pradesh, Telangana, Maharashtra, West Bengal, Bihar and Puducherry. Seat counts use the official NMC seat matrix covering all 770+ MBBS colleges in India." },
];

const TESTIMONIALS = [
  { name: "Ananya R.", tag: "AIR 24,xxx · OBC", quote: "The Dream/Realistic/Safe split made my choice-filling so much clearer. I stopped guessing." },
  { name: "Karthik M.", tag: "AIR 51,xxx · OPEN", quote: "Seeing 3-year closing trends per college helped me avoid wasting web options on unreachable seats." },
  { name: "Dr. Reddy", tag: "Counsellor, Hyderabad", quote: "I use the cutoff explorer with students daily. The state-quota data is genuinely useful." },
];

export default async function Landing() {
  const session = await getSession();
  const stats = await getStats().catch(() => null);
  const ctaHref = session ? (session.paid ? "/predict" : "/payment") : "/register";
  const price = rupees(UNLOCK_PRICE_PAISE);

  return (
    <div className="min-h-screen bg-white text-ink-900 antialiased">
      {/* Nav */}
      <header className="border-b border-border sticky top-0 bg-white/85 backdrop-blur z-30">
        <div className="w-full px-4 sm:px-6 lg:px-10 xl:px-16 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-grid place-items-center w-9 h-9 rounded-lg bg-brand-600 text-white font-bold">R</span>
            <span className="font-bold text-lg">RankPath</span>
          </div>
          <nav className="flex items-center gap-1 sm:gap-2">
            <a href="#features" className="hidden sm:inline px-3 py-2 text-sm text-ink-700 hover:text-ink-900">Features</a>
            <a href="#how" className="hidden sm:inline px-3 py-2 text-sm text-ink-700 hover:text-ink-900">How it works</a>
            <a href="#pricing" className="hidden sm:inline px-3 py-2 text-sm text-ink-700 hover:text-ink-900">Pricing</a>
            {session ? (
              <Link href="/dashboard" className="px-4 py-2 text-sm font-medium rounded-md bg-brand-600 text-white hover:bg-brand-700">Go to Dashboard</Link>
            ) : (
              <>
                <Link href="/login" className="px-3 py-2 text-sm font-medium text-brand-700 hover:text-brand-800">Login</Link>
                <Link href="/register" className="px-4 py-2 text-sm font-medium rounded-md bg-brand-600 text-white hover:bg-brand-700">Get started</Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-brand-50 via-white to-white" />
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-brand-100/50 blur-3xl" />
        <div className="relative w-full px-4 sm:px-6 lg:px-10 xl:px-16 pt-16 pb-20 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <span className="inline-flex items-center gap-2 text-xs font-medium text-brand-700 bg-brand-100 rounded-full px-3 py-1 mb-5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> NEET UG 2025 · MBBS / BDS Counselling
            </span>
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-[1.1]">
              Turn your <span className="text-brand-600">NEET rank</span> into a clear college plan.
            </h1>
            <p className="mt-5 text-lg text-ink-500 max-w-xl">
              RankPath predicts which medical colleges your rank can realistically get — and gives you a
              ready counselling strategy — using 3 years of official MCC &amp; state allotment data.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link href={ctaHref} className="h-12 px-7 leading-[3rem] rounded-md bg-brand-600 text-white font-semibold hover:bg-brand-700 shadow-sm">
                Get started — {price}
              </Link>
              <a href="#how" className="h-12 px-6 leading-[3rem] rounded-md border border-border font-medium hover:bg-surface-muted">
                See how it works
              </a>
            </div>
            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-500">
              <span className="flex items-center gap-1.5"><span className="text-emerald-600">✓</span> One-time {price}, no subscription</span>
              <span className="flex items-center gap-1.5"><span className="text-emerald-600">✓</span> Official allotment data</span>
            </div>
          </div>

          {/* Right: real product screenshot */}
          <div>
            <BrowserFrame src="/shots/dashboard.png" alt="RankPath dashboard with seat analytics" url="rankpath.app/dashboard" />
          </div>
        </div>
      </section>

      {/* Trust / data sources */}
      <section className="border-y border-border bg-surface-muted">
        <div className="w-full px-4 sm:px-6 lg:px-10 xl:px-16 py-5 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-xs sm:text-sm text-ink-500">
          <span className="font-medium text-ink-700">Built on official data from</span>
          {["MCC (AIQ)", "Deemed & Central", "NTRUHS (AP)", "State Counselling"].map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5"><span className="text-brand-500">●</span>{s}</span>
          ))}
        </div>
      </section>

      {/* Stats */}
      {stats && (
        <section className="w-full px-4 sm:px-6 lg:px-10 xl:px-16 py-12 grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
          <Stat value={stats.colleges.toLocaleString("en-IN")} label="Medical & dental colleges" />
          <Stat value={stats.cutoffs.toLocaleString("en-IN")} label="Cutoff records analysed" />
          <Stat value={String(stats.states)} label="States covered" />
          <Stat value={stats.years} label="Years of data" />
        </section>
      )}

      {/* Predict by state */}
      {stats?.byState?.length ? (
        <section className="w-full px-4 sm:px-6 lg:px-10 xl:px-16 py-16">
          <div className="text-center max-w-2xl mx-auto">
            <span className="text-sm font-semibold text-brand-600">STATE-WISE COVERAGE</span>
            <h2 className="text-3xl font-bold mt-2">Explore MBBS / BDS cutoffs by state</h2>
            <p className="text-ink-500 mt-3">Pick your state to see its colleges, seats and closing ranks.</p>
          </div>
          <div className="mt-10 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            <Link href="/cutoff-explorer" className="group rounded-xl p-5 bg-brand-600 text-white hover:bg-brand-700 transition-colors">
              <div className="text-2xl">🇮🇳</div>
              <div className="mt-2 font-semibold">All India (AIQ)</div>
              <div className="text-xs text-brand-100 mt-0.5">Central counselling quota</div>
              <div className="mt-3 text-xs font-medium inline-flex items-center gap-1">View cutoffs <span className="group-hover:translate-x-0.5 transition-transform">→</span></div>
            </Link>
            {stats.byState.slice(0, 11).map((s) => (
              <Link key={s.code} href={`/cutoff-explorer?state=${s.code}`}
                className="group rounded-xl p-5 border border-border bg-white hover:border-brand-300 hover:shadow-md transition-all">
                <div className="flex items-start justify-between">
                  <div className="font-semibold text-ink-900 leading-tight">{s.name}</div>
                  <span className="text-[10px] font-medium text-ink-400 bg-surface-muted rounded px-1.5 py-0.5">{s.code}</span>
                </div>
                <div className="text-xs text-ink-500 mt-1.5">{s.colleges} colleges · {s.seats.toLocaleString("en-IN")} seats</div>
                <div className="mt-3 text-xs font-medium text-brand-700 inline-flex items-center gap-1">
                  MBBS / BDS cutoffs <span className="group-hover:translate-x-0.5 transition-transform">→</span>
                </div>
              </Link>
            ))}
          </div>
          <div className="text-center mt-8">
            <Link href="/cutoff-explorer" className="text-sm font-medium text-brand-700 hover:underline">See all states &amp; quotas →</Link>
          </div>
        </section>
      ) : null}

      {/* Try the predictor */}
      <section className="bg-surface-muted border-y border-border">
        <div className="w-full px-4 sm:px-6 lg:px-10 xl:px-16 py-16 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <h2 className="text-3xl font-bold">See where your rank stands</h2>
            <p className="mt-3 text-ink-500">
              Enter your NEET AIR and we will show you the kind of colleges in reach. Create a free account and
              unlock the full, ranked list with confidence scores for {price}.
            </p>
            <ul className="mt-5 space-y-2 text-sm text-ink-700">
              {["Probability score for every college", "3-year closing-rank history", "All India + state quota coverage"].map((b) => (
                <li key={b} className="flex items-center gap-2"><span className="text-emerald-600">✓</span>{b}</li>
              ))}
            </ul>
            <div className="mt-6 max-w-md">
              <HeroPredict />
            </div>
          </div>
          <div>
            <BrowserFrame src="/shots/results.png" alt="RankPath prediction results with chance meter" url="rankpath.app/predict" />
            <p className="mt-3 text-center text-xs text-ink-400">Actual prediction output — chance meter, bands and college list.</p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="w-full px-4 sm:px-6 lg:px-10 xl:px-16 py-16">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold">Everything you need for counselling</h2>
          <p className="text-ink-500 mt-3">From your rank to a finalised choice list — in one place.</p>
        </div>
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {FEATURES.map((f) => (
            <div key={f.title} className="border border-border rounded-xl p-6 hover:shadow-md hover:-translate-y-0.5 transition-all">
              <div className={`w-11 h-11 grid place-items-center rounded-lg text-xl ${f.tint}`}>{f.icon}</div>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm text-ink-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Cutoff Explorer showcase */}
        <div className="mt-16 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <span className="inline-block text-xs font-semibold text-amber-700 bg-amber-50 rounded-full px-3 py-1">CUTOFF EXPLORER</span>
            <h3 className="mt-4 text-2xl font-bold">Every opening &amp; closing rank, one search away</h3>
            <p className="mt-3 text-ink-500 leading-relaxed">
              Filter by year, round, state, quota, category and college type to see exactly where ranks closed —
              across {stats ? stats.cutoffs.toLocaleString("en-IN") : "thousands of"} official cutoff records.
            </p>
            <ul className="mt-5 space-y-2 text-sm text-ink-700">
              {["MCC AIQ, Deemed, Central & state quotas", "Round-wise opening & closing ranks", "Search any college by name"].map((b) => (
                <li key={b} className="flex items-center gap-2"><span className="text-emerald-600">✓</span>{b}</li>
              ))}
            </ul>
            <Link href={ctaHref} className="mt-6 inline-block h-11 px-6 leading-[2.75rem] rounded-md bg-brand-600 text-white font-semibold hover:bg-brand-700">
              Explore cutoffs
            </Link>
          </div>
          <BrowserFrame src="/shots/cutoff.png" alt="RankPath cutoff explorer with filters and rank table" url="rankpath.app/cutoff-explorer" />
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="bg-brand-900 text-white">
        <div className="w-full px-4 sm:px-6 lg:px-10 xl:px-16 py-16">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-3xl font-bold">Three steps to your college plan</h2>
            <p className="text-brand-200 mt-3">No spreadsheets, no guesswork.</p>
          </div>
          <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-6">
            {STEPS.map((s) => (
              <div key={s.n} className="bg-white/5 border border-white/10 rounded-xl p-6">
                <div className="w-10 h-10 grid place-items-center rounded-full bg-gold-500 text-white font-bold">{s.n}</div>
                <h3 className="mt-4 font-semibold text-lg">{s.title}</h3>
                <p className="mt-1.5 text-sm text-brand-200">{s.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Link href={ctaHref} className="inline-block h-12 px-8 leading-[3rem] rounded-md bg-white text-brand-700 font-semibold hover:bg-brand-50">
              Start now
            </Link>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="w-full px-4 sm:px-6 lg:px-10 xl:px-16 py-16">
        <h2 className="text-3xl font-bold text-center">Trusted by aspirants &amp; counsellors</h2>
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-5">
          {TESTIMONIALS.map((t) => (
            <figure key={t.name} className="border border-border rounded-xl p-6">
              <div className="text-gold-500" aria-hidden>★★★★★</div>
              <blockquote className="mt-3 text-sm text-ink-700 leading-relaxed">“{t.quote}”</blockquote>
              <figcaption className="mt-4 text-sm">
                <div className="font-semibold text-ink-900">{t.name}</div>
                <div className="text-ink-500 text-xs">{t.tag}</div>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="bg-surface-muted border-y border-border">
        <div className="w-full px-4 sm:px-6 lg:px-10 xl:px-16 py-16">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-3xl font-bold">One price. Everything unlocked.</h2>
            <p className="text-ink-500 mt-3">No tiers, no subscriptions. Pay once, use it all season.</p>
          </div>
          <div className="mt-10 max-w-md mx-auto bg-white border-2 border-brand-600 rounded-2xl p-8 text-center shadow-lg shadow-brand-900/5">
            <div className="inline-block text-xs font-semibold text-brand-700 bg-brand-50 rounded-full px-3 py-1">PREDICTION UNLOCK</div>
            <div className="mt-4 text-5xl font-extrabold">{price}</div>
            <div className="text-ink-500 text-sm">one-time payment</div>
            <ul className="mt-6 space-y-2.5 text-sm text-left">
              {[
                "Unlimited rank predictions",
                "Dream / Realistic / Safe college lists",
                "Counselling & web-options strategy",
                "Cutoff explorer & college profiles",
                "All India + state quota data",
              ].map((b) => (
                <li key={b} className="flex items-start gap-2"><span className="text-emerald-600 mt-0.5">✓</span><span className="text-ink-700">{b}</span></li>
              ))}
            </ul>
            <Link href={ctaHref} className="mt-7 block h-12 leading-[3rem] rounded-md bg-brand-600 text-white font-semibold hover:bg-brand-700">
              {session ? (session.paid ? "Start predicting" : `Unlock for ${price}`) : "Create account & unlock"}
            </Link>
            <p className="mt-3 text-xs text-ink-400">Secure checkout · Instant access</p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="w-full px-4 sm:px-6 lg:px-10 xl:px-16 py-16">
        <div className="max-w-3xl mx-auto">
        <h2 className="text-3xl font-bold text-center">Frequently asked questions</h2>
        <div className="mt-8 divide-y divide-border border border-border rounded-xl overflow-hidden">
          {FAQ.map((f) => (
            <details key={f.q} className="group p-5 open:bg-surface-muted">
              <summary className="flex items-center justify-between cursor-pointer list-none font-medium text-ink-900">
                {f.q}
                <span className="text-ink-400 transition-transform group-open:rotate-45 text-xl leading-none">+</span>
              </summary>
              <p className="mt-3 text-sm text-ink-500 leading-relaxed">{f.a}</p>
            </details>
          ))}
        </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="w-full px-4 sm:px-6 lg:px-10 xl:px-16 pb-16">
        <div className="rounded-2xl bg-gradient-to-r from-brand-700 to-brand-600 text-white px-8 py-12 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold">Ready to see your college list?</h2>
          <p className="mt-2 text-brand-100">Join now and turn your rank into a plan in minutes.</p>
          <Link href={ctaHref} className="mt-6 inline-block h-12 px-8 leading-[3rem] rounded-md bg-white text-brand-700 font-semibold hover:bg-brand-50">
            Get started — {price}
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="w-full px-4 sm:px-6 lg:px-10 xl:px-16 py-10 grid sm:grid-cols-2 gap-6 items-center">
          <div className="flex items-center gap-2">
            <span className="inline-grid place-items-center w-8 h-8 rounded-lg bg-brand-600 text-white font-bold text-sm">R</span>
            <span className="font-semibold">RankPath</span>
          </div>
          <p className="text-xs text-ink-500 sm:text-right leading-relaxed">
            RankPath provides probability-based estimates from past counselling trends. It is an educational
            analytics tool and does <b>not</b> guarantee admission or seat allotment.<br />
            © 2023–2025 RankPath · NEET UG MBBS/BDS Seat Analytics
          </p>
        </div>
      </footer>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-3xl sm:text-4xl font-extrabold text-brand-700">{value}</div>
      <div className="text-xs text-ink-500 mt-1">{label}</div>
    </div>
  );
}

/** macOS-style browser frame wrapping a real product screenshot. */
function BrowserFrame({ src, alt, url }: { src: string; alt: string; url: string }) {
  return (
    <div className="rounded-xl border border-border bg-white shadow-2xl shadow-brand-900/20 overflow-hidden">
      <div className="h-8 bg-surface-muted border-b border-border flex items-center gap-1.5 px-3">
        <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
        <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
        <span className="ml-3 hidden sm:inline text-[10px] text-ink-400 bg-white border border-border rounded px-2 py-0.5">{url}</span>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="block w-full" loading="eager" />
    </div>
  );
}
