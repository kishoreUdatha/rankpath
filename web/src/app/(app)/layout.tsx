import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <Sidebar isAdmin={session.role === "ADMIN"} />
      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar name={session.name || session.email} paid={session.paid} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
