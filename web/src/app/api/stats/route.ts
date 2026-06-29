import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const [colleges, cutoffs, states] = await Promise.all([
    prisma.college.count(),
    prisma.cutoffSummary.count(),
    prisma.state.count(),
  ]);

  const mbbsCut = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*) n FROM "CutoffSummary" cs JOIN "Course" c ON c.id=cs."courseId" WHERE c.name='MBBS'`
  );
  const bdsCut = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*) n FROM "CutoffSummary" cs JOIN "Course" c ON c.id=cs."courseId" WHERE c.name='BDS'`
  );

  // AIQ OPEN MBBS R1 — avg closing rank trend by year
  const trend = await prisma.$queryRawUnsafe<any[]>(
    `SELECT cs.year y, CAST(AVG(cs."closingRank") AS INTEGER) v
     FROM "CutoffSummary" cs JOIN "Course" c ON c.id=cs."courseId"
     WHERE cs.quota='AIQ' AND cs.category='OPEN' AND c.name='MBBS' AND cs.round='R1'
     GROUP BY cs.year ORDER BY cs.year`
  );

  // Category-wise avg closing rank (AIQ MBBS R1, latest year)
  const catAvg = await prisma.$queryRawUnsafe<any[]>(
    `SELECT cs.category cat, CAST(AVG(cs."closingRank") AS INTEGER) v
     FROM "CutoffSummary" cs JOIN "Course" c ON c.id=cs."courseId"
     WHERE cs.quota='AIQ' AND c.name='MBBS' AND cs.round='R1' AND cs.year=2024
       AND cs.category IN ('OPEN','EWS','OBC','SC','ST')
     GROUP BY cs.category`
  );

  const order = ["OPEN", "EWS", "OBC", "SC", "ST"];
  return NextResponse.json({
    colleges,
    cutoffs,
    states,
    mbbsCutoffs: Number(mbbsCut[0]?.n ?? 0),
    bdsCutoffs: Number(bdsCut[0]?.n ?? 0),
    years: "2023 – 2025",
    trend: trend.map((r) => ({ year: String(r.y), closing: Number(r.v) })),
    categoryAvg: order
      .map((cat) => {
        const row = catAvg.find((r) => r.cat === cat);
        return row ? { category: cat, avg: Number(row.v) } : null;
      })
      .filter(Boolean),
  });
}
