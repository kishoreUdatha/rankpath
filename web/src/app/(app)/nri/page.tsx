import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtRank } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function NRIPage() {
  const rows = await prisma.cutoffSummary.findMany({
    where: { quota: { in: ["NRI", "MANAGEMENT"] } },
    include: { college: true, course: true },
    orderBy: [{ quota: "asc" }, { closingRank: "asc" }],
    take: 300,
  });
  const byQuota = new Map<string, typeof rows>();
  for (const r of rows) {
    const a = byQuota.get(r.quota) ?? [];
    a.push(r); byQuota.set(r.quota, a);
  }
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">NRI / Management Quota Explorer</h1>
        <p className="text-ink-500 text-sm">
          High-fee deemed and private seats. Disclaimer note: these closing ranks vary much more year-to-year and are
          highly sensitive to seat-matrix updates; treat the projection with caution.
        </p>
      </header>
      {[...byQuota.entries()].map(([q, list]) => (
        <Card key={q}>
          <CardHeader><CardTitle>{q}</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-muted"><tr>
                  <th className="text-left p-3">College</th>
                  <th className="text-left p-3">Course</th>
                  <th className="text-left p-3">Category</th>
                  <th className="text-left p-3">Year / Round</th>
                  <th className="text-right p-3">Closing rank</th>
                </tr></thead>
                <tbody>
                  {list.slice(0, 40).map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="p-3"><Link href={`/college/${r.collegeId}`} className="text-brand-700 hover:underline">{r.college.name}</Link></td>
                      <td className="p-3">{r.course.name}</td>
                      <td className="p-3">{r.category}</td>
                      <td className="p-3">{r.year} · {r.round}</td>
                      <td className="p-3 text-right tabular-nums">{fmtRank(r.closingRank)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
