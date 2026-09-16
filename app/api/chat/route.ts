/**
 * POST /api/chat (PRD 7.6/7.7).
 *
 * Request body: `{ messages: { role: "user" | "assistant"; content: string }[] }`
 * — the last item must be the new user message. This is a deliberately
 * simple shape (not raw AI SDK `UIMessage[]`), documented as the Phase 4
 * contract (see lib/agent/run.ts's `ChatMessage` type).
 *
 * Response:
 * - Success or emergency bypass → a `useChat`-compatible UI message stream
 *   `Response` (SSE), built by lib/agent/run.ts.
 * - Guard-layer failure (no session / rate limit / invalid input / LLM
 *   unavailable) → JSON `{ error: { code, message } }` with the matching
 *   HTTP status, never a stream.
 */
import type { NextRequest } from "next/server";
import { type ChatMessage, runChat } from "../../../lib/agent/run";

interface ChatRequestBody {
  messages?: unknown;
}

function isValidMessages(value: unknown): value is ChatMessage[] {
  return (
    Array.isArray(value) &&
    value.every(
      (m) =>
        typeof m === "object" &&
        m !== null &&
        (m as { role?: unknown }).role !== undefined &&
        ((m as { role?: unknown }).role === "user" || (m as { role?: unknown }).role === "assistant") &&
        typeof (m as { content?: unknown }).content === "string",
    )
  );
}

/** Best-effort client IP for the per-IP rate limit (PRD 7.7 step 2). */
function clientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() ?? "unknown";
  return request.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(request: NextRequest): Promise<Response> {
  let body: ChatRequestBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: { code: "INVALID_INPUT", message: "Cuerpo de la solicitud inválido." } }, { status: 400 });
  }

  if (!isValidMessages(body.messages) || body.messages.length === 0) {
    return Response.json(
      { error: { code: "INVALID_INPUT", message: "Se esperaba { messages: [{ role, content }] }." } },
      { status: 400 },
    );
  }

  const result = await runChat({ ip: clientIp(request), messages: body.messages });

  if (result.kind === "error") {
    return Response.json({ error: { code: result.code, message: result.message } }, { status: result.status });
  }

  return result.response;
}
