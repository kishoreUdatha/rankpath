import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const year = p.get("year");
  const round = p.get("round");
  const quota = p.get("quota");
  const category = p.get("category");
  const course = p.get("course");
  const state = p.get("state");
  const collegeType = p.get("collegeType");
  const q = p.get("q")?.trim();
  const page = Math.max(1, Number(p.get("page") ?? 1));
  const pageSize = Math.min(50, Number(p.get("pageSize") ?? 10));

  const collegeWhere: any = {};
  if (state) collegeWhere.state = { is: { code: state } };
  if (collegeType && collegeType !== "All") collegeWhere.type = collegeType;
  if (q) collegeWhere.name = { contains: q };

  const where: any = {
    ...(year ? { year: Number(year) } : {}),
    ...(round && round !== "All" ? { round } : {}),
    ...(quota && quota !== "All" ? { quota } : {}),
    ...(category && category !== "All" ? { category } : {}),
    ...(course && course !== "All" ? { course: { is: { name: course } } } : {}),
    ...(Object.keys(collegeWhere).length ? { college: { is: collegeWhere } } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.cutoffSummary.count({ where }),
    prisma.cutoffSummary.findMany({
      where,
      include: { college: { include: { state: true } }, course: true },
      orderBy: [{ closingRank: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return NextResponse.json({
    total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)),
    rows: rows.map((r) => ({
      id: r.id,
      college: r.college?.name ?? "—",
      collegeId: r.collegeId,
      type: r.college?.type ?? "—",
      state: r.college?.state?.code ?? "AIQ",
      course: r.course?.name ?? "—",
      category: r.category,
      quota: r.quota,
      year: r.year,
      round: r.round,
      opening: r.openingRank,
      closing: r.closingRank,
    })),
  });
}
