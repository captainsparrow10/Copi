/**
 * Rate limiter (PRD 7.7 step 2 / 9 risks — "en memoria; suficiente para la
 * demo, no distribuido").
 *
 * IMPORTANT: this is a plain in-process `Map`, not backed by Redis or any
 * shared store. It resets on every server restart/redeploy and does not
 * coordinate across multiple instances. That's an explicit risk acceptance
 * for the hackathon demo (PRD section 9), not an oversight — a real
 * production deployment on Vercel (serverless, multi-instance) would need a
 * distributed store instead.
 *
 * Two independent sliding-window (1 hour) counters: per session id
 * (`MAX_MESSAGES_PER_SESSION`, env-configurable, fallback 20) and per IP
 * (`IP_RATE_LIMIT_PER_HOUR`, hardcoded — the PRD names this limit in 7.7 but
 * provides no env var for it).
 */

const WINDOW_MS = 60 * 60 * 1000;

/** PRD 7.7: "60 por IP por hora" — no env var provided for this one. */
export const IP_RATE_LIMIT_PER_HOUR = 60;

const DEFAULT_MAX_MESSAGES_PER_SESSION = 20;

const sessionHits = new Map<string, number[]>();
const ipHits = new Map<string, number[]>();

function maxMessagesPerSession(): number {
  const raw = process.env.MAX_MESSAGES_PER_SESSION;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_MESSAGES_PER_SESSION;
}

/** Drops timestamps older than the 1-hour window, mutating the array in place. */
function purge(hits: number[], now: number): number[] {
  return hits.filter((t) => now - t < WINDOW_MS);
}

export interface RateLimitResult {
  allowed: boolean;
  reason?: "SESSION_LIMIT" | "IP_LIMIT";
}

/** Checks and (if allowed) records one request for `sessionId` + `ip`. */
export function checkRateLimit(sessionId: string, ip: string): RateLimitResult {
  const now = Date.now();

  const sessionTimestamps = purge(sessionHits.get(sessionId) ?? [], now);
  sessionHits.set(sessionId, sessionTimestamps);
  if (sessionTimestamps.length >= maxMessagesPerSession()) {
    return { allowed: false, reason: "SESSION_LIMIT" };
  }

  const ipTimestamps = purge(ipHits.get(ip) ?? [], now);
  ipHits.set(ip, ipTimestamps);
  if (ipTimestamps.length >= IP_RATE_LIMIT_PER_HOUR) {
    return { allowed: false, reason: "IP_LIMIT" };
  }

  sessionTimestamps.push(now);
  ipTimestamps.push(now);
  return { allowed: true };
}

/** Test-only: clears both counters. Never called from production code paths. */
export function resetRateLimitStore(): void {
  sessionHits.clear();
  ipHits.clear();
}
