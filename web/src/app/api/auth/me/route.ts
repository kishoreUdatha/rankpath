import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ user: null }, { status: 200 });

  const profile = await prisma.user.findUnique({
    where: { id: s.sub },
    select: { phone: true, gender: true, category: true, domicileState: true, neetRank: true, neetScore: true, neetYear: true },
  });

  return NextResponse.json({
    user: {
      id: s.sub, email: s.email, name: s.name, paid: s.paid, role: s.role,
      ...profile,
    },
  });
}
