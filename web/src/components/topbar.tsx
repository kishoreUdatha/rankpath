"use client";
import { useRouter } from "next/navigation";
import Link from "next/link";

export function Topbar({ name, paid }: { name: string; paid: boolean }) {
  const router = useRouter();
  const initial = (name || "U").trim().charAt(0).toUpperCase();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <header className="h-14 bg-white border-b border-border flex items-center justify-end gap-3 px-6 sticky top-0 z-20">
      {paid ? (
        <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1">✓ Premium</span>
      ) : (
        <Link href="/payment" className="text-xs font-medium text-white bg-gold-500 hover:bg-gold-600 rounded-full px-3 py-1">Unlock Predictions</Link>
      )}
      <button className="relative text-ink-500 hover:text-ink-700" aria-label="Notifications">🔔</button>
      <div className="flex items-center gap-2">
        <span className="inline-grid place-items-center w-8 h-8 rounded-full bg-brand-100 text-brand-700 text-sm font-semibold">{initial}</span>
        <span className="text-sm text-ink-700 max-w-[160px] truncate hidden sm:block">{name}</span>
      </div>
      <button onClick={logout} className="text-sm text-ink-500 hover:text-ink-800 border border-border rounded-md px-2.5 py-1">Logout</button>
    </header>
  );
}
