// Node-only auth helpers (bcrypt + next/headers). Do NOT import this in middleware.
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { SESSION_COOKIE, verifySession, type SessionUser } from "@/lib/session";

// Re-export edge-safe pieces so existing route imports keep working.
export {
  SESSION_COOKIE,
  signSession,
  verifySession,
  cookieOptions,
  type SessionUser,
} from "@/lib/session";

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}
export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

/** Server-component / route-handler session read (uses next/headers cookies). */
export async function getSession(): Promise<SessionUser | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  return verifySession(token);
}
