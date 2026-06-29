import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { rupees, UNLOCK_PRICE_PAISE, razorpayEnabled } from "@/lib/pricing";
import { PayBox } from "@/components/pay-box";

export const dynamic = "force-dynamic";

export default async function PaymentPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/payment");
  if (session.paid) redirect("/predict");

  const price = rupees(UNLOCK_PRICE_PAISE);

  return (
    <div className="max-w-md mx-auto">
      <div className="bg-white border border-border rounded-2xl p-8 shadow-sm">
        <div className="text-center">
          <div className="mx-auto w-12 h-12 grid place-items-center rounded-full bg-gold-50 text-2xl">🔓</div>
          <h1 className="mt-4 text-xl font-bold text-ink-900">Unlock NEET Predictions</h1>
          <p className="text-sm text-ink-500 mt-1">A one-time payment unlocks all predictions and counselling tools.</p>
          <div className="mt-5 text-4xl font-extrabold text-ink-900">{price}<span className="text-base font-medium text-ink-500"> one-time</span></div>
        </div>

        <ul className="mt-6 space-y-2 text-sm">
          {[
            "Unlimited rank-based predictions",
            "Dream / Realistic / Safe college lists",
            "Counselling & web-options strategy",
            "Cutoff explorer & college profiles",
          ].map((b) => (
            <li key={b} className="flex items-start gap-2"><span className="text-emerald-600">✓</span><span className="text-ink-700">{b}</span></li>
          ))}
        </ul>

        <div className="mt-7">
          <Suspense>
            <PayBox priceLabel={price} />
          </Suspense>
        </div>

        <p className="text-center text-xs text-ink-500 mt-4">
          {razorpayEnabled()
            ? "Secure payment via Razorpay (UPI / cards / netbanking)."
            : "Demo mode — no real charge is made. Configure Razorpay keys to accept live payments."}
        </p>
      </div>
      <p className="text-center text-xs text-ink-400 mt-4">
        Educational analytics only — predictions are probability estimates, not a guarantee of admission.
      </p>
    </div>
  );
}
