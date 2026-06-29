import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function StatesPage() {
  const states = await prisma.state.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { colleges: true } },
    },
  });
  const counts = await prisma.allotment.groupBy({
    by: ["state"],
    _count: { _all: true },
  });
  const countMap = new Map(counts.map((c) => [c.state, c._count._all]));

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">State-wise Allotment Explorer</h1>
        <p className="text-ink-500 text-sm">Each state aggregates rows from its counselling authority.</p>
      </header>
      <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {states.map((s) => (
          <Link key={s.id} href={{ pathname: "/colleges", query: { state: s.code } }}>
            <Card className="hover:border-brand-300 hover:shadow-md transition">
              <CardHeader>
                <CardTitle className="flex items-baseline justify-between">
                  <span>{s.name}</span>
                  <span className="text-xs text-ink-500">{s.code}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums">{countMap.get(s.code) ?? 0}</div>
                <div className="text-xs text-ink-500">allotment rows · {s._count.colleges} colleges</div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
