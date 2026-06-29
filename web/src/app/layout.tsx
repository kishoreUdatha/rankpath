import "@/styles/globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "RankPath — NEET UG MBBS Seat Predictor",
  description:
    "Probability-based NEET UG MBBS/BDS seat-allotment predictions using 3-year MCC AIQ and state counselling trends. Educational analytics, not admission advice.",
  metadataBase: new URL("https://example.invalid"),
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
