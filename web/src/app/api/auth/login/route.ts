import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword, signSession, cookieOptions, SESSION_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";

const Schema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const token = await signSession({ sub: user.id, email: user.email, name: user.name, paid: user.hasPaid, role: user.role });
  const res = NextResponse.json({ ok: true, user: { id: user.id, email: user.email, name: user.name, paid: user.hasPaid } });
  res.cookies.set(SESSION_COOKIE, token, cookieOptions);
  return res;
}
