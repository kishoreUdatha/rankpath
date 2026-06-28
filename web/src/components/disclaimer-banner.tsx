import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export function DisclaimerBanner() {
  return (
    <div className="bg-gold-50 border-b border-gold-400 text-amber-900">
      <div className="container mx-auto py-2 px-4 flex items-start gap-3 text-sm">
        <AlertTriangle className="w-4 h-4 mt-0.5 flex-none" />
        <p className="leading-snug">
          <strong>Not an admission guarantee.</strong> All shortlists are probability-based on past
          3-year MCC &amp; state allotment trends. Always verify against the official counselling notice.{" "}
          <Link href="/disclaimer" className="underline font-medium">Read more</Link>
        </p>
      </div>
    </div>
  );
}
