import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE } from "@/lib/session";

// Paths that require a PAID account (the actual prediction value).
function needsPaid(path: string) {
  return path === "/api/predict" || path.startsWith("/predict") || path.startsWith("/strategy");
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);

  // 1. Must be logged in for any matched (app) route.
  if (!session) {
    if (isApi) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }

  // 2. Admin area requires the ADMIN role.
  if (pathname.startsWith("/admin") && session.role !== "ADMIN") {
    if (isApi) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // 3. Prediction features additionally require payment.
  if (needsPaid(pathname) && !session.paid) {
    if (isApi) return NextResponse.json({ error: "payment_required" }, { status: 402 });
    const url = req.nextUrl.clone();
    url.pathname = "/payment";
    url.search = `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/predict/:path*",
    "/strategy/:path*",
    "/colleges/:path*",
    "/cutoff-explorer/:path*",
    "/college/:path*",
    "/states/:path*",
    "/mcc/:path*",
    "/management/:path*",
    "/nri/:path*",
    "/reports/:path*",
    "/admin/:path*",
    "/payment/:path*",
    "/api/predict",
  ],
};
