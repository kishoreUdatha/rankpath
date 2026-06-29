import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { getSession, signSession, cookieOptions, SESSION_COOKIE } from "@/lib/auth";
import { razorpayEnabled } from "@/lib/pricing";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const paymentId: unknown = body.paymentId;
  if (typeof paymentId !== "string" || !paymentId) {
    return NextResponse.json({ error: "missing_payment" }, { status: 400 });
  }

  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.userId !== s.sub) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // For real Razorpay, verify the signature before trusting the payment.
  if (razorpayEnabled() && payment.provider === "RAZORPAY") {
    const { razorpay_payment_id, razorpay_signature } = body;
    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
      .update(`${payment.orderId}|${razorpay_payment_id}`)
      .digest("hex");
    if (expected !== razorpay_signature) {
      await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
      return NextResponse.json({ error: "signature_mismatch" }, { status: 400 });
    }
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "PAID", paymentRef: razorpay_payment_id },
    });
  } else {
    // Demo mode: mark paid.
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "PAID", paymentRef: "demo" } });
  }

  // Unlock the user and refresh the session cookie so `paid` is true everywhere.
  const user = await prisma.user.update({
    where: { id: s.sub },
    data: { hasPaid: true, paidAt: new Date() },
  });

  const token = await signSession({ sub: user.id, email: user.email, name: user.name, paid: true, role: user.role });
  const res = NextResponse.json({ ok: true, paid: true });
  res.cookies.set(SESSION_COOKIE, token, cookieOptions);
  return res;
}
