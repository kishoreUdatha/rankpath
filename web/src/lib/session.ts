// Edge-safe session helpers (no bcrypt, no next/headers). Safe to import in middleware.
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "rp_session";
const ALG = "HS256";
export const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

const secret = new TextEncoder().encode(
  process.env.AUTH_SECRET || "rankpath-dev-secret-change-me-in-production"
);

export type SessionUser = {
  sub: string;
  email: string;
  name?: string | null;
  paid: boolean;
  role?: string;
};

export async function signSession(payload: SessionUser): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret);
}

/** Edge- and node-safe token verification. */
export async function verifySession(token?: string | null): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return {
      sub: String(payload.sub),
      email: String(payload.email),
      name: (payload.name as string) ?? null,
      paid: Boolean(payload.paid),
      role: (payload.role as string) ?? "STUDENT",
    };
  } catch {
    return null;
  }
}

export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE,
};
