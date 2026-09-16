/**
 * Session handling (PRD 7.2 "Sesion" row / 7.6 `copi_session` cookie).
 *
 * The JWT payload only ever carries the policy number — never a name, plan,
 * or amount (PRD 7.10: keep PII and money out of anything that leaves the
 * server unencrypted-at-rest). `lib/agent/tools.ts` and `lib/agent/run.ts`
 * look up the asegurado/plan rows fresh from the DB using this `poliza`,
 * rather than trusting anything else from the client.
 *
 * The sign/verify functions are pure (no `next/headers`) so they're
 * unit-testable without a request context; the cookie helpers below wrap
 * the async Next 16 `cookies()` API and are meant to be called from route
 * handlers only.
 */
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";

export const SESSION_COOKIE_NAME = "copi_session";

/** 2 hours, matching both the JWT `exp` and the cookie `maxAge`. */
export const SESSION_TTL_SECONDS = 2 * 60 * 60;

export interface SessionPayload {
  poliza: string;
}

function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not set. Define it in .env.local.");
  }
  return new TextEncoder().encode(secret);
}

/** Signs a session JWT (HS256) carrying only the policy number. */
export async function createSessionToken(poliza: string): Promise<string> {
  return new SignJWT({ poliza })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecretKey());
}

/**
 * Verifies a session JWT. Returns `null` (never throws) on any failure —
 * missing token, bad signature, expired, or a payload missing `poliza` — so
 * callers can treat "no valid session" uniformly.
 */
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (typeof payload.poliza !== "string" || payload.poliza.length === 0) {
      return null;
    }
    return { poliza: payload.poliza };
  } catch {
    return null;
  }
}

/** Sets the `copi_session` cookie. Must run before any streaming Response starts. */
export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

/** Reads and verifies the `copi_session` cookie from the current request. */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/** Clears the `copi_session` cookie (used by `DELETE /api/session`). */
export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
}
