"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const MAIN = [
  { href: "/dashboard", label: "Dashboard", icon: "📊" },
  { href: "/predict", label: "Predict My Chances", icon: "🎯" },
  { href: "/strategy", label: "Counselling Strategy", icon: "🧭" },
  { href: "/colleges", label: "College Explorer", icon: "🏛️" },
  { href: "/cutoff-explorer", label: "Cutoff Explorer", icon: "📈" },
  { href: "/states", label: "State Dashboard", icon: "🗺️" },
  { href: "/mcc", label: "MCC AIQ Dashboard", icon: "🇮🇳" },
  { href: "/management", label: "Management Quota", icon: "💼" },
  { href: "/nri", label: "NRI Quota Explorer", icon: "🌐" },
  { href: "/reports", label: "Reports", icon: "📄" },
];
const ADMIN = [
  { href: "/admin/upload", label: "Data Upload", icon: "⬆️" },
  { href: "/admin/validation", label: "Data Validation", icon: "✅" },
  { href: "/admin/settings", label: "Settings", icon: "⚙️" },
];
const FOOTER = [
  { href: "/disclaimer", label: "Disclaimer", icon: "ℹ️" },
];

function Item({ href, label, icon, active }: { href: string; label: string; icon: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 px-4 py-2.5 text-sm rounded-md mx-2 transition-colors",
        active ? "bg-brand-600 text-white font-medium" : "text-brand-100/80 hover:bg-white/10 hover:text-white"
      )}
    >
      <span className="text-base w-5 text-center">{icon}</span>
      <span className="truncate">{label}</span>
    </Link>
  );
}

export function Sidebar({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const isActive = (href: string) => href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);
  return (
    <aside className="w-64 shrink-0 bg-brand-900 h-screen sticky top-0 self-start hidden md:flex flex-col">
      <div className="px-5 py-5 flex items-center gap-3 border-b border-white/10">
        <span className="inline-grid place-items-center w-9 h-9 rounded-lg bg-brand-600 text-white font-bold">R</span>
        <div className="leading-tight">
          <div className="text-white font-semibold text-sm">RankPath</div>
          <div className="text-brand-200 text-[11px]">NEET UG Predictor</div>
        </div>
      </div>
      <nav className="py-3 flex-1 overflow-y-auto">
        {MAIN.map((i) => <Item key={i.href} {...i} active={isActive(i.href)} />)}
        {isAdmin && (
          <>
            <div className="px-5 pt-4 pb-1 text-[11px] uppercase tracking-wider text-brand-300/70">Admin</div>
            {ADMIN.map((i) => <Item key={i.href} {...i} active={isActive(i.href)} />)}
          </>
        )}
        <div className="px-5 pt-4 pb-1 text-[11px] uppercase tracking-wider text-brand-300/70">More</div>
        {FOOTER.map((i) => <Item key={i.href} {...i} active={isActive(i.href)} />)}
      </nav>
    </aside>
  );
}
