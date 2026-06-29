import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { UNLOCK_PRICE_PAISE, CURRENCY, razorpayEnabled } from "@/lib/pricing";

export const dynamic = "force-dynamic";

export async function POST() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: s.sub } });
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.hasPaid) return NextResponse.json({ alreadyPaid: true });

  // Create a local payment record first.
  const payment = await prisma.payment.create({
    data: {
      userId: user.id,
      amount: UNLOCK_PRICE_PAISE,
      currency: CURRENCY,
      provider: razorpayEnabled() ? "RAZORPAY" : "DEMO",
      status: "CREATED",
    },
  });

  if (razorpayEnabled()) {
    // Create a Razorpay order. Requires RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET in .env.
    const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
    const r = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "content-type": "application/json" },
      body: JSON.stringify({ amount: UNLOCK_PRICE_PAISE, currency: CURRENCY, receipt: payment.id }),
    });
    if (!r.ok) {
      await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
      return NextResponse.json({ error: "gateway_error" }, { status: 502 });
    }
    const order = await r.json();
    await prisma.payment.update({ where: { id: payment.id }, data: { orderId: order.id } });
    return NextResponse.json({
      provider: "razorpay",
      paymentId: payment.id,
      orderId: order.id,
      keyId: process.env.RAZORPAY_KEY_ID,
      amount: UNLOCK_PRICE_PAISE,
      currency: CURRENCY,
    });
  }

  // Demo mode: no gateway. The client confirms immediately to simulate a successful payment.
  return NextResponse.json({ provider: "demo", paymentId: payment.id, amount: UNLOCK_PRICE_PAISE, currency: CURRENCY });
}
