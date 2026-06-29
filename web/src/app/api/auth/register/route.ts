import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, signSession, cookieOptions, SESSION_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";

const Schema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(160),
  password: z.string().min(6).max(100),
  phone: z.string().trim().regex(/^[0-9]{10}$/, "10-digit mobile number"),
  category: z.enum(["OPEN", "EWS", "OBC", "SC", "ST"]),
  domicileState: z.string().trim().min(2).max(40),
  gender: z.enum(["Male", "Female", "Other"]).optional(),
  neetRank: z.coerce.number().int().positive().max(2_000_000).optional(),
  neetScore: z.coerce.number().int().min(0).max(720).optional(),
  neetYear: z.coerce.number().int().min(2018).max(2030).optional(),
});

export async function POST(req: NextRequest) {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }
  const { name, email, password, phone, category, domicileState, gender, neetRank, neetScore, neetYear } = parsed.data;
  const lower = email.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email: lower } });
  if (existing) {
    return NextResponse.json({ error: "email_taken" }, { status: 409 });
  }

  const user = await prisma.user.create({
    data: {
      email: lower,
      name,
      passwordHash: await hashPassword(password),
      phone,
      category,
      domicileState,
      gender: gender ?? null,
      neetRank: neetRank ?? null,
      neetScore: neetScore ?? null,
      neetYear: neetYear ?? null,
    },
  });

  const token = await signSession({ sub: user.id, email: user.email, name: user.name, paid: user.hasPaid, role: user.role });
  const res = NextResponse.json({ ok: true, user: { id: user.id, email: user.email, name: user.name, paid: user.hasPaid } });
  res.cookies.set(SESSION_COOKIE, token, cookieOptions);
  return res;
}
