"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/",          label: "Home" },
  { href: "/predictor", label: "Rank Predictor" },
  { href: "/colleges",  label: "Cutoff Explorer" },
  { href: "/states",    label: "By State" },
  { href: "/categories",label: "By Category" },
  { href: "/quotas",    label: "By Quota" },
  { href: "/mcc",       label: "MCC AIQ" },
  { href: "/nri",       label: "NRI / Management" },
  { href: "/admin",     label: "Admin" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <header className="bg-white border-b border-border sticky top-0 z-30">
      <div className="container mx-auto flex items-center justify-between h-16 px-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="inline-block w-8 h-8 rounded-md bg-brand-600 text-white grid place-items-center font-bold">R</span>
          <span className="font-semibold text-ink-900">RankPath</span>
          <span className="text-xs text-ink-500 hidden sm:inline">NEET UG Allotment Analytics</span>
        </Link>
        <nav className="hidden lg:flex items-center gap-1">
          {NAV.map((item) => {
            const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "px-3 py-2 rounded-md text-sm font-medium",
                  active ? "bg-brand-50 text-brand-700" : "text-ink-700 hover:bg-surface-muted"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
