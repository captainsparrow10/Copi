import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit, IP_RATE_LIMIT_PER_HOUR, resetRateLimitStore } from "@/lib/guards/rate-limit";

const ORIGINAL_ENV = process.env.MAX_MESSAGES_PER_SESSION;

describe("checkRateLimit — PRD 7.7 step 2 (in-memory, demo-only)", () => {
  beforeEach(() => {
    resetRateLimitStore();
    process.env.MAX_MESSAGES_PER_SESSION = "3";
  });

  afterEach(() => {
    vi.useRealTimers();
    if (ORIGINAL_ENV === undefined) delete process.env.MAX_MESSAGES_PER_SESSION;
    else process.env.MAX_MESSAGES_PER_SESSION = ORIGINAL_ENV;
  });

  it("allows requests under both the session and IP limits", () => {
    const result = checkRateLimit("sess-1", "1.2.3.4");
    expect(result.allowed).toBe(true);
  });

  it("blocks once a session hits MAX_MESSAGES_PER_SESSION", () => {
    checkRateLimit("sess-2", "1.2.3.5");
    checkRateLimit("sess-2", "1.2.3.5");
    checkRateLimit("sess-2", "1.2.3.5");
    const fourth = checkRateLimit("sess-2", "1.2.3.5");
    expect(fourth.allowed).toBe(false);
    expect(fourth.reason).toBe("SESSION_LIMIT");
  });

  it("blocks once an IP hits IP_RATE_LIMIT_PER_HOUR, independent of session", () => {
    // Different sessions, same IP, each session well under its own limit.
    for (let i = 0; i < IP_RATE_LIMIT_PER_HOUR; i++) {
      checkRateLimit(`sess-ip-${i}`, "9.9.9.9");
    }
    const overIp = checkRateLimit("sess-ip-final", "9.9.9.9");
    expect(overIp.allowed).toBe(false);
    expect(overIp.reason).toBe("IP_LIMIT");
  });

  it("session and IP limits are independent — a blocked session doesn't block other sessions on the same IP under the IP cap", () => {
    checkRateLimit("sess-3", "5.5.5.5");
    checkRateLimit("sess-3", "5.5.5.5");
    checkRateLimit("sess-3", "5.5.5.5");
    const sessionBlocked = checkRateLimit("sess-3", "5.5.5.5");
    expect(sessionBlocked.allowed).toBe(false);
    expect(sessionBlocked.reason).toBe("SESSION_LIMIT");

    // A different session on the same IP, still well under the IP cap, is fine.
    const otherSessionSameIp = checkRateLimit("sess-4", "5.5.5.5");
    expect(otherSessionSameIp.allowed).toBe(true);
  });

  it("expires old entries outside the 1-hour window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    checkRateLimit("sess-5", "8.8.8.8");
    checkRateLimit("sess-5", "8.8.8.8");
    checkRateLimit("sess-5", "8.8.8.8");
    const blocked = checkRateLimit("sess-5", "8.8.8.8");
    expect(blocked.allowed).toBe(false);

    vi.setSystemTime(new Date("2026-01-01T01:00:01Z"));
    const afterWindow = checkRateLimit("sess-5", "8.8.8.8");
    expect(afterWindow.allowed).toBe(true);
  });
});
