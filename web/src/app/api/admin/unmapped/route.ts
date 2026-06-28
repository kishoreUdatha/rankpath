/**
 * Returns the list of raw seat-category and quota codes the ETL could not map.
 * Admins resolve these by adding rules to /etl/mappings/category_master.json
 * or /etl/mappings/quota_master.json, then re-running normalize_categories.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function isAuthed(req: NextRequest) {
  const tok = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return !!process.env.ADMIN_API_TOKEN && tok === process.env.ADMIN_API_TOKEN;
}

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [unmappedCats, unmappedQuotas] = await Promise.all([
    prisma.allotment.groupBy({
      by: ["rawSeatCategory"],
      where: { normalizedCategory: null, rawSeatCategory: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { rawSeatCategory: "desc" } },
      take: 100,
    }),
    prisma.allotment.groupBy({
      by: ["rawQuota"],
      where: { normalizedQuota: null, rawQuota: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { rawQuota: "desc" } },
      take: 100,
    }),
  ]);

  return NextResponse.json({
    unmappedCategories: unmappedCats.map((r) => ({ raw: r.rawSeatCategory, count: r._count._all })),
    unmappedQuotas:     unmappedQuotas.map((r) => ({ raw: r.rawQuota,        count: r._count._all })),
    hint: "Add a rule to etl/mappings/category_master.json or quota_master.json, then re-run `python -m etl.normalize_categories data/normalized/*.parquet` followed by `seed_database`.",
  });
}
