import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtRank } from "@/lib/utils";
import { CutoffChart } from "@/components/cutoff-chart";

export const dynamic = "force-dynamic";

export default async function CollegePage({ params }: { params: { id: string } }) {
  const college = await prisma.college.findUnique({
    where: { id: params.id },
    include: { state: true },
  });
  if (!college) notFound();

  const cutoffs = await prisma.cutoffSummary.findMany({
    where: { collegeId: college.id },
    include: { course: true },
    orderBy: [{ year: "desc" }, { round: "asc" }, { category: "asc" }, { quota: "asc" }],
  });

  // Build trend series per (category, quota, course)
  type Key = string;
  const trendMap = new Map<Key, { year: number; closingRank: number }[]>();
  for (const c of cutoffs) {
    const k = `${c.course.name}|${c.category}|${c.quota}`;
    const arr = trendMap.get(k) ?? [];
    arr.push({ year: c.year, closingRank: c.closingRank });
    trendMap.set(k, arr);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{college.name}</h1>
        <p className="text-ink-500 text-sm">
          {college.type} · {college.state?.name ?? "—"} {college.code ? `· code ${college.code}` : ""}
          {college.isDeemed && " · Deemed"}
          {college.isCentral && " · Central Institution"}
        </p>
      </header>

      <Card>
        <CardHeader><CardTitle>Closing-rank trend (last 3 years)</CardTitle></CardHeader>
        <CardContent>
          <CutoffChart series={[...trendMap.entries()].slice(0, 6).map(([k, points]) => ({
            label: k, points: points.sort((a, b) => a.year - b.year),
          }))} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>All cutoffs</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted"><tr>
                <th className="text-left p-3">Year</th>
                <th className="text-left p-3">Round</th>
                <th className="text-left p-3">Course</th>
                <th className="text-left p-3">Category</th>
                <th className="text-left p-3">Quota</th>
                <th className="text-right p-3">Opening</th>
                <th className="text-right p-3">Closing</th>
                <th className="text-right p-3">Allotments</th>
              </tr></thead>
              <tbody>
                {cutoffs.map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="p-3">{c.year}</td>
                    <td className="p-3">{c.round}</td>
                    <td className="p-3">{c.course.name}</td>
                    <td className="p-3">{c.category}</td>
                    <td className="p-3">{c.quota}</td>
                    <td className="p-3 text-right tabular-nums">{fmtRank(c.openingRank)}</td>
                    <td className="p-3 text-right tabular-nums">{fmtRank(c.closingRank)}</td>
                    <td className="p-3 text-right tabular-nums">{c.allotmentCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
