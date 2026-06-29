import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function QuotasPage() {
  const grouped = await prisma.allotment.groupBy({
    by: ["normalizedQuota"],
    _count: { _all: true },
    where: { normalizedQuota: { not: null } },
    orderBy: { _count: { normalizedQuota: "desc" } },
  });
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Quota-wise Cutoff</h1>
        <p className="text-ink-500 text-sm">AIQ, State, Management, NRI, Deemed, Central, AIIMS, JIPMER, ESIC, BHU/AMU/DU/Jamia and minority quotas.</p>
      </header>
      <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {grouped.map((g) => (
          <Link key={g.normalizedQuota!} href={{ pathname: "/colleges", query: { quota: g.normalizedQuota! } }}>
            <Card className="hover:border-brand-300 hover:shadow-md transition">
              <CardHeader><CardTitle>{g.normalizedQuota}</CardTitle></CardHeader>
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
