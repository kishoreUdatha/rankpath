import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Filter spec (per UI):
 *   year, round, state, authority, collegeId, courseId,
 *   category, quota, collegeType, rankMin, rankMax, feeBand
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const yr = sp.get("year");
  const where: any = {
    ...(yr ? { year: Number(yr) } : {}),
    ...(sp.get("round") ? { round: sp.get("round")! } : {}),
    ...(sp.get("state") ? { state: sp.get("state")! } : {}),
    ...(sp.get("authority") ? { authorityCode: sp.get("authority")! } : {}),
    ...(sp.get("collegeId") ? { collegeId: sp.get("collegeId")! } : {}),
    ...(sp.get("courseId") ? { courseId: sp.get("courseId")! } : {}),
    ...(sp.get("category") ? { normalizedCategory: sp.get("category")! } : {}),
    ...(sp.get("quota") ? { normalizedQuota: sp.get("quota")! } : {}),
    ...(sp.get("collegeType") ? { collegeType: sp.get("collegeType") as any } : {}),
    ...(sp.get("feeBand") ? { feeBand: sp.get("feeBand") as any } : {}),
  };
  const rankMin = sp.get("rankMin"), rankMax = sp.get("rankMax");
  if (rankMin || rankMax) {
    where.candidateRank = {
      ...(rankMin ? { gte: Number(rankMin) } : {}),
      ...(rankMax ? { lte: Number(rankMax) } : {}),
    };
  }

  const limit = Math.min(Number(sp.get("limit") ?? 200), 1000);
  const cursor = sp.get("cursor");

  const rows = await prisma.allotment.findMany({
    where,
    take: limit + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    orderBy: [{ candidateRank: "asc" }],
    include: { college: { select: { name: true, type: true } } },
  });

  const nextCursor = rows.length > limit ? rows.pop()!.id : null;
  return NextResponse.json({ count: rows.length, nextCursor, rows });
}
