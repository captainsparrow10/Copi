/**
 * Parses the `Error` thrown by `@ai-sdk/react`'s `useChat` when `/api/chat`
 * answers with a guard-layer failure (PRD 7.6: `{ error: { code, message } }`
 * JSON, never a stream). `ai`'s `HttpChatTransport` sets `error.message` to
 * the raw response body text on a non-2xx response (see
 * `node_modules/ai/dist/index.js`'s `createUIApiCallError`), so the JSON is
 * recovered by parsing `error.message` itself — there's no separate
 * `statusCode`/body field exposed to `onError`.
 */
export type ChatErrorCode = "NO_SESSION" | "RATE_LIMITED" | "INVALID_INPUT" | "LLM_UNAVAILABLE";

export interface ChatApiError {
  code: ChatErrorCode;
  message: string;
}

const KNOWN_CODES: ChatErrorCode[] = ["NO_SESSION", "RATE_LIMITED", "INVALID_INPUT", "LLM_UNAVAILABLE"];

/** Returns the structured `{ code, message }` for a guard-layer failure, or `null` if `error` isn't one (e.g. a network failure, or an unrecognized body). */
export function parseChatError(error: unknown): ChatApiError | null {
  if (!(error instanceof Error)) return null;
  try {
    const parsed = JSON.parse(error.message) as { error?: { code?: unknown; message?: unknown } };
    const code = parsed.error?.code;
    const message = parsed.error?.message;
    if (typeof code === "string" && typeof message === "string" && KNOWN_CODES.includes(code as ChatErrorCode)) {
      return { code: code as ChatErrorCode, message };
    }
  } catch {
    // Not JSON (network error, HTML error page, etc.) — fall through to null.
  }
  return null;
}
