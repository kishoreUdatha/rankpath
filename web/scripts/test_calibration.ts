// Direct test of the calibrated predict() — bypasses the auth-gated API route.
// Run:  npx tsx scripts/test_calibration.ts
import { predict } from "../src/lib/prediction";

// old hand-drawn curve, to show the shift at the same ratio
function oldScore(ratio: number): number {
  let s: number;
  if (ratio <= 0.6) s = 100;
  else if (ratio <= 0.85) s = 90 - (ratio - 0.6) * (10 / 0.25);
  else if (ratio <= 1.0) s = 80 - (ratio - 0.85) * (25 / 0.15);
  else if (ratio <= 1.05) s = 55 - (ratio - 1.0) * (10 / 0.05);
  else if (ratio <= 1.2) s = 45 - (ratio - 1.05) * (15 / 0.15);
  else if (ratio <= 1.5) s = 30 - (ratio - 1.2) * (20 / 0.30);
  else s = Math.max(0, 10 - (ratio - 1.5) * 20);
  return Math.round(s);
}

async function main() {
  const rank = 15000;
  const rows = await predict({
    rank, category: "OPEN", quota: "AIQ", topN: 500, includeUnlikely: true,
  });
  console.log(`predict rank=${rank} OPEN/AIQ -> ${rows.length} rows\n`);

  const buckets: Record<string, number> = {};
  for (const r of rows) buckets[r.bucket] = (buckets[r.bucket] ?? 0) + 1;
  console.log("bucket counts:", buckets, "\n");

  console.log(
    "college".padEnd(38) + "proj".padStart(8) + "ratio".padStart(7) +
    "NEW".padStart(5) + "OLD".padStart(5) + "  bucket");
  const sorted = [...rows].sort((a, b) => a.projectedClosingRank - b.projectedClosingRank);
  const step = Math.max(1, Math.floor(sorted.length / 16));
  for (let i = 0; i < sorted.length; i += step) {
    const r = sorted[i];
    const ratio = rank / r.projectedClosingRank;
    console.log(
      r.collegeName.slice(0, 37).padEnd(38) +
      String(r.projectedClosingRank).padStart(8) +
      ratio.toFixed(2).padStart(7) +
      String(r.confidenceScore).padStart(5) +
      String(oldScore(ratio)).padStart(5) +
      "  " + r.bucket);
  }
  process.exit(0);
}
main();
