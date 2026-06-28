import "@/styles/globals.css";
import type { Metadata } from "next";
import { DisclaimerBanner } from "@/components/disclaimer-banner";
import { Nav } from "@/components/nav";

export const metadata: Metadata = {
  title: "RankPath — NEET UG MBBS Allotment Analytics & Predictor",
  description:
    "Probability-based NEET UG MBBS/BDS seat-allotment predictions using 3-year MCC AIQ and state counselling trends. Educational analytics, not admission advice.",
  metadataBase: new URL("https://example.invalid"),
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <DisclaimerBanner />
        <Nav />
        <main className="container mx-auto px-4 py-8">{children}</main>
        <footer className="border-t border-border bg-white">
          <div className="container mx-auto px-4 py-6 text-xs text-ink-500 flex flex-col md:flex-row gap-2 md:justify-between">
            <p>© {new Date().getFullYear()} RankPath. Data sourced from public MCC &amp; state counselling pages.</p>
            <p>हिंदी / తెలుగు / English UI ready. <a className="underline" href="/disclaimer">Disclaimer</a></p>
          </div>
        </footer>
      </body>
    </html>
  );
}
