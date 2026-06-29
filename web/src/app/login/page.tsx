import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AuthForm } from "@/components/auth-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getSession()) redirect("/dashboard");
  return (
    <div className="min-h-screen grid place-items-center bg-surface-muted px-4 py-10">
      <Suspense>
        <AuthForm mode="login" />
      </Suspense>
    </div>
  );
}
