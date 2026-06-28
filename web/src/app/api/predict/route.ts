import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { predict, groupByBucket } from "@/lib/prediction";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const Schema = z.object({
  rank: z.number().int().positive().max(2_000_000),
  category: z.string().min(1),
  state: z.string().nullable().optional(),
  quota: z.string().nullable().optional(),
  gender: z.enum(["M", "F", "O"]).nullable().optional(),
  pwd: z.boolean().nullable().optional(),
  preferredStates: z.array(z.string()).optional(),
  preferredCollegeTypes: z.array(z.string()).optional(),
  budgetBand: z.enum(["LOW", "MID", "HIGH", "VERY_HIGH"]).nullable().optional(),
  includeUnlikely: z.boolean().optional(),
  topN: z.number().int().min(1).max(500).optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;
  const results = await predict(input);
  const buckets = groupByBucket(results);

  // Audit log — no PII, just the query and result counts
  await prisma.predictionLog.create({
    data: {
      inputRank: input.rank,
      inputCategory: input.category,
      inputQuota: input.quota ?? "ANY",
      inputState: input.state ?? null,
      inputGender: input.gender ?? null,
      inputPwd: input.pwd ?? null,
      inputCollegeType: (input.preferredCollegeTypes ?? []).join(","),
      inputBudget: input.budgetBand ?? null,
      resultCount: results.length,
      topResults: results.slice(0, 10).map(r => ({
        collegeId: r.collegeId, collegeName: r.collegeName,
        score: r.confidenceScore, band: r.band, bucket: r.bucket,
        projected: r.projectedClosingRank,
      })),
      appVersion: "0.2.0",
    },
  }).catch(() => {});

  return NextResponse.json({
    disclaimer: "Probability based on past 3-year allotment trends. Not a guarantee of admission.",
    counts: {
      safe: buckets.SAFE.length,
      moderate: buckets.MODERATE.length,
      aspirational: buckets.ASPIRATIONAL.length,
      unlikely: buckets.UNLIKELY.length,
    },
    buckets,
  });
}
