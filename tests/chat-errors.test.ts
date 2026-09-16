import { describe, expect, it } from "vitest";
import { parseChatError } from "@/lib/chat/errors";

describe("parseChatError (PRD 7.6 { error: { code, message } } guard-layer failures)", () => {
  it("parses a RATE_LIMITED error body", () => {
    const error = new Error(JSON.stringify({ error: { code: "RATE_LIMITED", message: "Alcanzaste el límite." } }));
    expect(parseChatError(error)).toEqual({ code: "RATE_LIMITED", message: "Alcanzaste el límite." });
  });

  it("parses an LLM_UNAVAILABLE error body", () => {
    const error = new Error(JSON.stringify({ error: { code: "LLM_UNAVAILABLE", message: "No disponible." } }));
    expect(parseChatError(error)).toEqual({ code: "LLM_UNAVAILABLE", message: "No disponible." });
  });

  it("returns null for a non-JSON error message", () => {
    expect(parseChatError(new Error("network error"))).toBeNull();
  });

  it("returns null for JSON that isn't the { error: { code, message } } shape", () => {
    expect(parseChatError(new Error(JSON.stringify({ ok: true })))).toBeNull();
  });

  it("returns null for an unrecognized error code", () => {
    const error = new Error(JSON.stringify({ error: { code: "SOMETHING_ELSE", message: "x" } }));
    expect(parseChatError(error)).toBeNull();
  });

  it("returns null for a non-Error value", () => {
    expect(parseChatError("plain string")).toBeNull();
    expect(parseChatError(undefined)).toBeNull();
  });
});
