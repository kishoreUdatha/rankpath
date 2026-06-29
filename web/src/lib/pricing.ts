// One-time prediction-unlock price. Kept in one place so it's easy to change.
export const UNLOCK_PRICE_PAISE = Number(process.env.UNLOCK_PRICE_PAISE || 9900); // ₹99
export const CURRENCY = "INR";

export function rupees(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

// Razorpay is used only if both keys are present; otherwise the flow runs in demo mode.
export function razorpayEnabled() {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}
