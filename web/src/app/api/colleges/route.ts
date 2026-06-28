import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const q = url.searchParams.get("q")?.trim() ?? "";
  const state = url.searchParams.get("state");
  const type = url.searchParams.get("type");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);

  const colleges = await prisma.college.findMany({
    where: {
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
      ...(state ? { state: { is: { code: state } } } : {}),
      ...(type ? { type: type as any } : {}),
    },
    include: { state: true },
    orderBy: { name: "asc" },
    take: limit,
  });

  return NextResponse.json({
    count: colleges.length,
    colleges: colleges.map((c) => ({
      id: c.id, name: c.name, code: c.code, type: c.type,
      state: c.state?.code, stateName: c.state?.name,
      isDeemed: c.isDeemed, isCentral: c.isCentral,
      feeBand: c.feeBandDefault,
    })),
  });
}
