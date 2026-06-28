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
  note?: string;
}

const YEAR_WEIGHTS: Array<{ offset: number; w: number }> = [
  { offset: 1, w: 0.50 },
  { offset: 2, w: 0.30 },
  { offset: 3, w: 0.20 },
];

function bandFor(score: number): PredictBand {
  if (score >= 80) return "HIGH";
  if (score >= 55) return "MODERATE";
  if (score >= 30) return "LOW";
  return "UNLIKELY";
}

function bucketFor(score: number, rank: number, projected: number): PredictBucket {
  if (score >= 80 && rank <= projected * 0.85) return "SAFE";
  if (score >= 55) return "MODERATE";
  if (score >= 30) return "ASPIRATIONAL";
  return "UNLIKELY";
}

/** Smooth scoring: 100 at rank << closing; 50 at rank == closing; → 0 as rank exceeds. */
function scoreFor(rank: number, projected: number): number {
  if (!projected || projected <= 0) return 0;
  const ratio = rank / projected;
  if (ratio <= 0.6)  return 100;
  if (ratio <= 0.85) return 90 - (ratio - 0.6) * (10 / 0.25);  // 90→80
  if (ratio <= 1.00) return 80 - (ratio - 0.85) * (25 / 0.15); // 80→55
  if (ratio <= 1.05) return 55 - (ratio - 1.00) * (10 / 0.05); // 55→45
  if (ratio <= 1.20) return 45 - (ratio - 1.05) * (15 / 0.15); // 45→30
  if (ratio <= 1.50) return 30 - (ratio - 1.20) * (20 / 0.30); // 30→10
  return Math.max(0, 10 - (ratio - 1.5) * 20);
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

  const where: any = {
    category: input.category,
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
    const bucket = bucketFor(score, input.rank, projected);
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

  return out.slice(0, topN);
}

export function groupByBucket(rows: PredictRow[]) {
  const buckets: Record<PredictBucket, PredictRow[]> = {
    SAFE: [], MODERATE: [], ASPIRATIONAL: [], UNLIKELY: [],
  };
  for (const r of rows) buckets[r.bucket].push(r);
  return buckets;
}
