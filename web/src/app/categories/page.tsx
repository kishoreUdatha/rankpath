import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const grouped = await prisma.allotment.groupBy({
    by: ["normalizedCategory"],
    _count: { _all: true },
    where: { normalizedCategory: { not: null } },
    orderBy: { _count: { normalizedCategory: "desc" } },
  });

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Category-wise Cutoff</h1>
        <p className="text-ink-500 text-sm">All normalized category codes across MCC + state counselling — click to drill down.</p>
      </header>
      <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {grouped.map((g) => (
          <Link key={g.normalizedCategory!} href={{ pathname: "/colleges", query: { category: g.normalizedCategory! } }}>
            <Card className="hover:border-brand-300 hover:shadow-md transition">
              <CardHeader><CardTitle>{g.normalizedCategory}</CardTitle></CardHeader>
              <CardContent>
                <div className="text-xl font-bold tabular-nums">{g._count._all}</div>
                <div className="text-xs text-ink-500">allotment rows</div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
