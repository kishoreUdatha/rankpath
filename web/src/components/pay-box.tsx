"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

declare global { interface Window { Razorpay?: any } }

export function PayBox({ priceLabel }: { priceLabel: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") || "/predict";
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function done() {
    router.push(next);
    router.refresh();
  }

  async function confirm(paymentId: string, extra: any = {}) {
    const r = await fetch("/api/payment/confirm", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ paymentId, ...extra }),
    });
    if (!r.ok) throw new Error("confirm_failed");
    done();
  }

  function loadRazorpay(): Promise<boolean> {
    return new Promise((resolve) => {
      if (window.Razorpay) return resolve(true);
      const s = document.createElement("script");
      s.src = "https://checkout.razorpay.com/v1/checkout.js";
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.body.appendChild(s);
    });
  }

  async function pay() {
    setErr(""); setBusy(true);
    try {
      const r = await fetch("/api/payment/create", { method: "POST" });
      const d = await r.json();
      if (d.alreadyPaid) return done();
      if (!r.ok) throw new Error(d.error || "create_failed");

      if (d.provider === "razorpay") {
        const ok = await loadRazorpay();
        if (!ok) throw new Error("gateway_load_failed");
        const rzp = new window.Razorpay({
          key: d.keyId, order_id: d.orderId, amount: d.amount, currency: d.currency,
          name: "RankPath", description: "Prediction Unlock",
          handler: (resp: any) => confirm(d.paymentId, {
            razorpay_payment_id: resp.razorpay_payment_id,
            razorpay_signature: resp.razorpay_signature,
          }).catch(() => setErr("Payment verification failed.")),
          modal: { ondismiss: () => setBusy(false) },
        });
        rzp.open();
        return;
      }

      // Demo provider — simulate a successful payment.
      await confirm(d.paymentId);
    } catch {
      setErr("Payment could not be completed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button onClick={pay} disabled={busy}
        className="w-full h-12 rounded-md bg-brand-600 text-white font-semibold hover:bg-brand-700 disabled:opacity-60">
        {busy ? "Processing…" : `Pay ${priceLabel} & Unlock`}
      </button>
      {err && <p className="text-sm text-rose-600 mt-3">{err}</p>}
    </>
  );
}
