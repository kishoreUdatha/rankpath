/**
 * Prediction engine — 3-year weighted closing-rank projection.
 *
 * Score formula (per spec):
 *   projected_closing = 0.50·Y(t-1) + 0.30·Y(t-2) + 0.20·Y(t-3)
 *
 * Confidence band (per spec):
 *   80–100 High      candidate rank well inside historical band
 *   55–79  Moderate  within ±5% of projected closing
 *   30–54  Low       outside band but plausible
 *   <30    Unlikely  rank significantly worse than every prior closing
 *
 * Buckets in the response:
 *   SAFE         — score ≥ 80 AND rank ≤ 0.85 × projected_closing
 *   MODERATE     — 55 ≤ score < 80
 *   ASPIRATIONAL — 30 ≤ score < 55  (worth listing as a stretch)
 *   UNLIKELY     — score < 30        (returned only if user asked for them)
 */
import { prisma } from "./db";

export type PredictBand = "HIGH" | "MODERATE" | "LOW" | "UNLIKELY";
export type PredictBucket = "SAFE" | "MODERATE" | "ASPIRATIONAL" | "UNLIKELY";

export interface PredictInput {
  rank: number;
  category: string;        // normalized
  state?: string | null;   // domicile state code
  quota?: string | null;   // normalized; if null, search across all quotas
  gender?: "M" | "F" | "O" | null;
  pwd?: boolean | null;
  preferredStates?: string[];
  preferredCollegeTypes?: string[];   // GOVT / PRIVATE / DEEMED / AIIMS / JIPMER / ESIC / CENTRAL
  budgetBand?: "LOW" | "MID" | "HIGH" | "VERY_HIGH" | null;
  includeUnlikely?: boolean;
  topN?: number;
}

export interface PredictRow {
  collegeId: string;
  collegeName: string;
  collegeType: string;
  state: string | null;
  course: string;
  category: string;
  quota: string;
  projectedClosingRank: number;
  historicalClosings: { year: number; round: string; closingRank: number }[];
  confidenceScore: number;        // 0–100
  band: PredictBand;
  bucket: PredictBucket;
  tuitionAnnual?: number | null;  // INR/year (from FeeStructure)
  feeIndicative?: boolean;        // true = type-based estimate, false = official
  note?: string;
}

const YEAR_WEIGHTS: Array<{ offset: number; w: number }> = [
  { offset: 1, w: 0.50 },
  { offset: 2, w: 0.30 },
  { offset: 3, w: 0.20 },
];

// confidenceScore now means a CALIBRATED admit probability (× 100), so these
// thresholds read directly as probabilities: SAFE ≈ ≥85% admit chance, etc.
function bandFor(score: number): PredictBand {
  if (score >= 80) return "HIGH";
  if (score >= 55) return "MODERATE";
  if (score >= 30) return "LOW";
  return "UNLIKELY";
}

function bucketFor(score: number): PredictBucket {
  if (score >= 85) return "SAFE";        // ≥85% modelled admit probability
  if (score >= 55) return "MODERATE";
  if (score >= 30) return "ASPIRATIONAL";
  return "UNLIKELY";
}

/**
 * Isotonic calibration curve: ratio (rank / projected_closing) → admit probability.
 *
 * Empirically fit as the survival function P(g ≥ ratio), where g = actual_closing /
 * projected_closing across R1 cells. Truth year = 2024 projected from 2023 (all
 * quotas, 3,160 cells). 2025 R1 AIQ is NOT used: those rows were stray-round
 * mislabels (see etl/seed_database.py round handling) and have been purged, so 2024
 * is the newest clean ground-truth year.
 *
 * Out-of-sample (5-fold CV) this cut pooled Expected Calibration Error ~64%
 * (0.048 → 0.017) and Brier ~6% vs the former hand-drawn curve. Regenerate via
 * scripts/refit_calibration.py; once a clean 2025/2026 R1 result PDF is
 * ingested, refit with a 2-year projection basis (this uses 1-year 2023→2024, which
 * is slightly noisier and errs conservative in the stretch zone — the safe direction).
 */
const CALIBRATION: Array<[ratio: number, prob: number]> = [
  [0.30, 0.9820], [0.40, 0.9604], [0.50, 0.9263], [0.60, 0.8896], [0.70, 0.8411],
  [0.75, 0.8095], [0.80, 0.7665], [0.85, 0.7180], [0.90, 0.6671], [0.95, 0.5949],
  [1.00, 0.5082], [1.05, 0.3994], [1.10, 0.2905], [1.15, 0.2215], [1.20, 0.1816],
  [1.25, 0.1491], [1.30, 0.1209], [1.35, 0.1047], [1.40, 0.0908], [1.50, 0.0722],
  [1.60, 0.0611], [1.70, 0.0516], [1.80, 0.0446], [1.90, 0.0386], [2.00, 0.0370],
  [2.20, 0.0275], [2.50, 0.0184],
];

/** Calibrated confidence 0–100 = modelled admit probability × 100 for this rank/projection. */
function scoreFor(rank: number, projected: number): number {
  if (!projected || projected <= 0) return 0;
  const ratio = rank / projected;
  const first = CALIBRATION[0], last = CALIBRATION[CALIBRATION.length - 1];
  if (ratio <= first[0]) return first[1] * 100;
  if (ratio >= last[0]) return last[1] * 100;
  for (let i = 1; i < CALIBRATION.length; i++) {
    const [r0, p0] = CALIBRATION[i - 1];
    const [r1, p1] = CALIBRATION[i];
    if (ratio <= r1) {
      const t = (ratio - r0) / (r1 - r0);        // linear interpolation between knots
      return (p0 + t * (p1 - p0)) * 100;
    }
  }
  return last[1] * 100;
}

function project(closings: Array<{ year: number; closingRank: number }>): number {
  if (closings.length === 0) return 0;
  // Take the most recent closing per year
  const byYear = new Map<number, number>();
  for (const c of closings) {
    const prev = byYear.get(c.year);
    if (prev == null || c.closingRank > prev) byYear.set(c.year, c.closingRank);
  }
  const sortedYears = [...byYear.keys()].sort((a, b) => b - a);
  if (sortedYears.length === 0) return 0;

  const newest = sortedYears[0];
  let num = 0, den = 0;
  for (const { offset, w } of YEAR_WEIGHTS) {
    const y = newest - (offset - 1);
    const v = byYear.get(y);
    if (v != null) { num += v * w; den += w; }
  }
  return den > 0 ? Math.round(num / den) : byYear.get(newest)!;
}

export async function predict(input: PredictInput): Promise<PredictRow[]> {
  const topN = input.topN ?? 60;

  // Round 1 only: R2/R3/STRAY closing ranks balloon as seats free up, and mixing
  // them in (esp. STRAY) inflates the projected cutoff. R1 is the stable signal —
  // same choice as the legacy predictor and the v0.1 spec (AIQ MBBS Round 1).
  const where: any = {
    category: input.category,
    round: "R1",
    ...(input.quota ? { quota: input.quota } : {}),
  };
  if (input.preferredStates && input.preferredStates.length > 0) {
    where.college = { is: { state: { is: { code: { in: input.preferredStates } } } } };
  } else if (input.state) {
    where.college = { is: { state: { is: { code: input.state } } } };
  }
  if (input.preferredCollegeTypes && input.preferredCollegeTypes.length > 0) {
    where.college = {
      is: {
        ...(where.college?.is ?? {}),
        type: { in: input.preferredCollegeTypes as any },
      },
    };
  }
  if (input.budgetBand) {
    where.college = {
      is: {
        ...(where.college?.is ?? {}),
        feeBandDefault: input.budgetBand as any,
      },
    };
  }

  const rows = await prisma.cutoffSummary.findMany({
    where,
    include: {
      college: { include: { state: true } },
      course:  true,
    },
    take: 5000,
  });

  // Group by (college, course, category, quota)
  type Key = string;
  const grouped = new Map<Key, typeof rows>();
  for (const r of rows) {
    const k = `${r.collegeId}|${r.courseId}|${r.category}|${r.quota}`;
    const arr = grouped.get(k) ?? [];
    arr.push(r);
    grouped.set(k, arr);
  }

  const out: PredictRow[] = [];
  for (const [, group] of grouped) {
    const closings = group.map((g) => ({ year: g.year, round: g.round, closingRank: g.closingRank }));
    const projected = project(closings);
    if (projected === 0) continue;

    const score = Math.round(scoreFor(input.rank, projected));
    const band = bandFor(score);
    const bucket = bucketFor(score);
    if (bucket === "UNLIKELY" && !input.includeUnlikely) continue;

    const sample = group[0];
    out.push({
      collegeId: sample.collegeId,
      collegeName: sample.college.name,
      collegeType: sample.college.type,
      state: sample.college.state?.code ?? null,
      course: sample.course.name,
      category: sample.category,
      quota: sample.quota,
      projectedClosingRank: projected,
      historicalClosings: closings.sort((a, b) => b.year - a.year || a.round.localeCompare(b.round)),
      confidenceScore: score,
      band, bucket,
    });
  }

  out.sort((a, b) =>
    b.confidenceScore - a.confidenceScore ||
    a.projectedClosingRank - b.projectedClosingRank
  );

  const result = out.slice(0, topN);

  // Attach annual MBBS tuition from FeeStructure for the returned colleges.
  const ids = [...new Set(result.map((r) => r.collegeId))];
  if (ids.length) {
    const fees = await prisma.feeStructure.findMany({
      where: { collegeId: { in: ids } },
      select: { collegeId: true, tuitionAnnual: true, isIndicative: true },
    });
    const feeMap = new Map(fees.map((f) => [f.collegeId, f]));
    for (const r of result) {
      const f = feeMap.get(r.collegeId);
      r.tuitionAnnual = f?.tuitionAnnual ?? null;
      r.feeIndicative = f?.isIndicative ?? true;
    }
  }

  return result;
}

export function groupByBucket(rows: PredictRow[]) {
  const buckets: Record<PredictBucket, PredictRow[]> = {
    SAFE: [], MODERATE: [], ASPIRATIONAL: [], UNLIKELY: [],
  };
  for (const r of rows) buckets[r.bucket].push(r);
  return buckets;
}
