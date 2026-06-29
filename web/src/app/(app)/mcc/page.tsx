import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { fmtRank } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function MCCDashboard() {
  // MCC = AIQ + DEEMED + CENTRAL + AIIMS + JIPMER + ESIC
  const rows = await prisma.cutoffSummary.findMany({
    where: { quota: { in: ["AIQ", "DEEMED"] } },
    include: { college: true, course: true },
    orderBy: [{ category: "asc" }, { closingRank: "asc" }],
    take: 200,
  });
  const byCat = new Map<string, typeof rows>();
  for (const r of rows) {
    const arr = byCat.get(r.category) ?? [];
    arr.push(r); byCat.set(r.category, arr);
  }
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">MCC AIQ Cutoff Dashboard</h1>
        <p className="text-ink-500 text-sm">All India Quota (15%) + Deemed + Central institutions. Pulled from public mcc.nic.in result PDFs.</p>
      </header>
      {[...byCat.entries()].map(([cat, list]) => (
        <Card key={cat}>
          <CardHeader><CardTitle>Category: {cat}</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-muted"><tr>
                  <th className="text-left p-3">College</th>
                  <th className="text-left p-3">Course</th>
                  <th className="text-left p-3">Year / Round</th>
                  <th className="text-right p-3">Closing rank</th>
                </tr></thead>
                <tbody>
                  {list.slice(0, 30).map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="p-3"><Link href={`/college/${r.collegeId}`} className="text-brand-700 hover:underline">{r.college.name}</Link><div className="text-xs text-ink-500">{r.college.type}</div></td>
                      <td className="p-3">{r.course.name}</td>
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
