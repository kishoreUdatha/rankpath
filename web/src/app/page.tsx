import Link from "next/link";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Search, BarChart3, MapPin, Tag, FileText, ShieldCheck } from "lucide-react";

export default function HomePage() {
  return (
    <div className="space-y-12">
      <section className="text-center max-w-3xl mx-auto pt-6">
        <h1 className="text-4xl md:text-5xl font-bold text-ink-900 tracking-tight">
          Probability-based <span className="text-brand-700">NEET UG MBBS</span> seat predictor
        </h1>
        <p className="mt-4 text-lg text-ink-500">
          Built on 3-year MCC AIQ + state counselling allotment trends across category, quota,
          state, and college preference. Not admission advice — just transparent analytics.
        </p>
        <div className="mt-6 flex flex-wrap gap-3 justify-center">
          <Button asChild size="lg"><Link href="/predictor">Try the Rank Predictor</Link></Button>
          <Button asChild variant="outline" size="lg"><Link href="/colleges">Explore Cutoffs</Link></Button>
        </div>
        <p className="mt-3 text-xs text-ink-500">
          हिंदी / తెలుగు / English UI ready · No login · We never store PII
        </p>
      </section>

      <section className="grid md:grid-cols-3 gap-6">
        {[
          { href: "/predictor", icon: Search,     title: "Rank Predictor",      desc: "Enter rank, category, quota → get safe / moderate / aspirational lists with a confidence score." },
          { href: "/colleges",  icon: BarChart3,  title: "College Cutoff",      desc: "Year-by-year closing ranks per college, course, category and quota." },
          { href: "/states",    icon: MapPin,     title: "State Dashboards",    desc: "AP, TG, TN, KA, KL, MH and more — each state's allotment in one view." },
          { href: "/categories",icon: Tag,        title: "Category Cutoffs",    desc: "OPEN, EWS, OBC, SC, ST, BC-A/B/C/D/E, MBC, SCA, SEBC, NT, GM, 1G, 2A/B, 3A/B, EZ/MU/BH …" },
          { href: "/mcc",       icon: FileText,   title: "MCC AIQ Dashboard",   desc: "All India Quota: round-wise cutoffs across central, deemed, AIIMS, JIPMER, ESIC." },
          { href: "/disclaimer",icon: ShieldCheck,title: "Disclaimer",          desc: "How we built the model, what we store, and what we deliberately do not." },
        ].map(({ href, icon: Icon, title, desc }) => (
          <Link key={href} href={href as any}>
            <Card className="h-full hover:border-brand-300 hover:shadow-md transition">
              <CardContent className="p-6">
                <Icon className="w-6 h-6 text-brand-600" />
                <CardTitle className="mt-3">{title}</CardTitle>
                <CardDescription>{desc}</CardDescription>
              </CardContent>
            </Card>
          </Link>
        ))}
      </section>

      <section className="card p-6">
        <h2 className="text-2xl font-semibold text-ink-900">How the prediction works</h2>
        <ol className="mt-3 space-y-2 text-ink-700 list-decimal list-inside">
          <li>We collect public allotment result PDFs/XLS from MCC and every state counselling authority.</li>
          <li>Each row is normalized to canonical category and quota codes (UR→OPEN, GN-EWS→EWS, BC-A/B/…, 2A/2B/3A/3B, EZ/MU, etc.).</li>
          <li>We compute closing rank per (college × course × category × quota × round) for the last three years.</li>
          <li>Projected cutoff = <strong>0.50·Y(t-1) + 0.30·Y(t-2) + 0.20·Y(t-3)</strong>. Confidence scoring then assigns Safe / Moderate / Aspirational / Unlikely.</li>
        </ol>
      </section>
    </div>
  );
}
