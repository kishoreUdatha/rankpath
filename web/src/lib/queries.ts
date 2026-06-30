import { prisma } from "@/lib/db";

export async function getStats() {
  const [colleges, cutoffs, states] = await Promise.all([
    prisma.college.count(),
    prisma.cutoffSummary.count(),
    prisma.state.count(),
  ]);
  const mbbsCut = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*) n FROM "CutoffSummary" cs JOIN "Course" c ON c.id=cs."courseId" WHERE c.name='MBBS'`);
  const bdsCut = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*) n FROM "CutoffSummary" cs JOIN "Course" c ON c.id=cs."courseId" WHERE c.name='BDS'`);
  const trend = await prisma.$queryRawUnsafe<any[]>(
    `SELECT cs.year y, CAST(AVG(cs."closingRank") AS INTEGER) v
     FROM "CutoffSummary" cs JOIN "Course" c ON c.id=cs."courseId"
     WHERE cs.quota='AIQ' AND cs.category='OPEN' AND c.name='MBBS' AND cs.round='R1'
     GROUP BY cs.year ORDER BY cs.year`);
  const catAvg = await prisma.$queryRawUnsafe<any[]>(
    `SELECT cs.category cat, CAST(AVG(cs."closingRank") AS INTEGER) v
     FROM "CutoffSummary" cs JOIN "Course" c ON c.id=cs."courseId"
     WHERE cs.quota='AIQ' AND c.name='MBBS' AND cs.round='R1' AND cs.year=2024
       AND cs.category IN ('OPEN','EWS','OBC','SC','ST') GROUP BY cs.category`);
  // Official NMC nationwide MBBS sanctioned intake (UG Seat Matrix 2024-25)
  const byState = await prisma.$queryRawUnsafe<any[]>(
    `SELECT s.code code, s.name name,
            COUNT(DISTINCT sm."collegeId") colleges,
            SUM(sm.seats) seats
     FROM "SeatMatrix" sm
     JOIN "College" col ON col.id = sm."collegeId"
     JOIN "State" s ON s.id = col."stateId"
     WHERE sm."sourceFile" = 'nmc:ug_2024_25'
     GROUP BY s.code, s.name
     ORDER BY seats DESC`);
  const order = ["OPEN", "EWS", "OBC", "SC", "ST"];
  return {
    colleges, cutoffs, states,
    mbbsCutoffs: Number(mbbsCut[0]?.n ?? 0),
    bdsCutoffs: Number(bdsCut[0]?.n ?? 0),
    years: "2023 – 2025",
    trend: trend.map((r) => ({ year: String(r.y), closing: Number(r.v) })),
    categoryAvg: order.map((cat) => {
      const row = catAvg.find((r) => r.cat === cat);
      return { category: cat, avg: row ? Number(row.v) : 0 };
    }),
    byState: byState.map((r) => ({
      code: r.code as string,
      name: r.name as string,
      colleges: Number(r.colleges),
      seats: Number(r.seats),
    })),
  };
}
