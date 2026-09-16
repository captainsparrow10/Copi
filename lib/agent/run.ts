/**
 * `/api/chat` turn pipeline (PRD 7.7), orchestrating session, rate limit,
 * input validation, the emergency filter, `streamText`, and the grounding
 * validators — in that exact order.
 *
 * Framework-agnostic result: this module never touches `NextResponse`
 * status codes for guard-layer failures — it returns a small discriminated
 * union and the `/api/chat` route handler (app/api/chat/route.ts) turns
 * `{ kind: "error" }` into the actual `{ error: { code, message } }` JSON
 * response with the right HTTP status. `{ kind: "stream" }` already carries
 * a ready-to-return `Response` (streamText's own UI-message-stream Response
 * for a normal turn, or a single-shot one for the emergency fixed text).
 *
 * DEVIATION FROM PRD 7.10: the PRD asks for a random `sesion_id` in
 * `trazas`, decorrelated from the insured's identity. The Phase 3 spec
 * fixes the session JWT payload to exactly `{ poliza }` with no separate
 * session-id mechanism, so this implementation uses `poliza` directly as
 * both the rate-limit key and `trazas.sesion_id`. Acceptable here because
 * every asegurado in this system is fictitious demo data (PRD 7.10), but
 * flagged as a real deviation for a production deployment with real PII.
 */
import { eq } from "drizzle-orm";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  toUIMessageStream,
  type ModelMessage,
  type StreamTextTransform,
  type TextStreamPart,
  type ToolSet,
} from "ai";
import { db } from "../db/client";
import { asegurados, planes, trazas } from "../db/schema";
import { getSession } from "../session";
import { checkRateLimit } from "../guards/rate-limit";
import { buildEmergencyResponse, detectEmergency } from "../guards/emergency";
import { validateAmounts } from "../guards/amount-validator";
import { validateCitations } from "../guards/citation-validator";
import { buildSystemPrompt } from "./system-prompt";
import { buildTools } from "./tools";
import { getChatModel } from "./provider";

const MAX_MESSAGE_LENGTH = 500;
const HISTORY_LIMIT = 12;

const SAFE_FALLBACK_TEXT =
  "No puedo confirmar ese dato con la información disponible en este momento. Te recomiendo consultar directamente con tu aseguradora.";

const LLM_UNAVAILABLE_MESSAGE = "El asistente no está disponible en este momento. Intenta en unos minutos.";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export type RunChatErrorCode = "NO_SESSION" | "RATE_LIMITED" | "INVALID_INPUT" | "LLM_UNAVAILABLE";

export type RunChatResult =
  | { kind: "error"; status: number; code: RunChatErrorCode; message: string }
  | { kind: "stream"; response: Response };

interface ToolResultRecord {
  toolName: string;
  input: unknown;
  output: unknown;
}

async function logTrace(
  sesionId: string,
  evento: "tool_call" | "emergency_bypass" | "validation_block" | "error",
  detalle: Record<string, unknown>,
): Promise<void> {
  try {
    await db.insert(trazas).values({ sesionId, evento, detalle });
  } catch (err) {
    // Tracing must never break a chat turn.
    console.error("Failed to write traza:", err);
  }
}

async function loadNombrePlan(poliza: string): Promise<{ nombre: string; plan: string } | null> {
  const rows = await db
    .select({ nombre: asegurados.nombre, plan: planes.nombre })
    .from(asegurados)
    .innerJoin(planes, eq(asegurados.planId, planes.id))
    .where(eq(asegurados.poliza, poliza))
    .limit(1);
  return rows[0] ?? null;
}

/** Single-shot UI message stream carrying pre-baked fixed text (emergency bypass — no LLM call). */
function fixedTextResponse(text: string): Response {
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      writer.write({ type: "start" });
      writer.write({ type: "text-start", id: "fixed" });
      writer.write({ type: "text-delta", id: "fixed", delta: text });
      writer.write({ type: "text-end", id: "fixed" });
      writer.write({ type: "finish" });
    },
  });
  return createUIMessageStreamResponse({ stream });
}

/**
 * Grounding transform (PRD 7.8 layers 6-7): tool-call/tool-result parts pass
 * through untouched and live, so the UI can render the quote card as soon as
 * a tool resolves. Prose (`text-*` parts) is buffered per step and only
 * forwarded once its full text has been validated against every tool result
 * accumulated so far this turn; on failure it's swapped for a safe fallback
 * BEFORE anything is sent to the client. `onBlock` reports the failure so
 * the caller can log a `validation_block` trace.
 */
/**
 * Minimal, non-generic shapes for the three text part kinds. `TextStreamPart<TOOLS>`
 * is a generic union whose `Extract<..., { type: "text-start" }>` doesn't narrow
 * cleanly for an arbitrary `TOOLS` type parameter (TS can't fully distribute it),
 * so the buffer below uses these instead — the `id`/`text` fields themselves
 * don't depend on `TOOLS` at all.
 */
interface LocalTextStart {
  type: "text-start";
  id: string;
}
interface LocalTextDelta {
  type: "text-delta";
  id: string;
  text: string;
}
interface LocalTextEnd {
  type: "text-end";
  id: string;
}

function createGroundingTransform<TOOLS extends ToolSet>(
  toolResultsAcc: ToolResultRecord[],
  onBlock: (reason: { invalidAmounts: string[]; invalidCitations: string[] }) => void,
): StreamTextTransform<TOOLS> {
  return () => {
    type Part = TextStreamPart<TOOLS>;
    let textStart: LocalTextStart | null = null;
    let textEnd: LocalTextEnd | null = null;
    const deltas: LocalTextDelta[] = [];

    const flush = (controller: TransformStreamDefaultController<Part>) => {
      if (!textStart) return;
      const fullText = deltas.map((d) => d.text).join("");
      const amounts = validateAmounts(fullText, toolResultsAcc);
      const citations = validateCitations(fullText, toolResultsAcc);

      controller.enqueue(textStart as unknown as Part);
      if (fullText.length > 0 && (!amounts.valid || !citations.valid)) {
        onBlock({ invalidAmounts: amounts.invalidAmounts, invalidCitations: citations.invalidCitations });
        controller.enqueue({ type: "text-delta", id: textStart.id, text: SAFE_FALLBACK_TEXT } as unknown as Part);
      } else {
        for (const delta of deltas) controller.enqueue(delta as unknown as Part);
      }
      if (textEnd) controller.enqueue(textEnd as unknown as Part);

      textStart = null;
      textEnd = null;
      deltas.length = 0;
    };

    return new TransformStream<Part, Part>({
      transform(part, controller) {
        switch (part.type) {
          case "tool-result":
            toolResultsAcc.push({ toolName: part.toolName, input: part.input, output: part.output });
            controller.enqueue(part);
            break;
          case "text-start":
            textStart = part as unknown as LocalTextStart;
            break;
          case "text-delta":
            deltas.push(part as unknown as LocalTextDelta);
            break;
          case "text-end":
            textEnd = part as unknown as LocalTextEnd;
            flush(controller);
            break;
          case "finish-step":
          case "finish":
            flush(controller); // safety net if a step ends without a text-end part
            controller.enqueue(part);
            break;
          default:
            controller.enqueue(part);
        }
      },
      flush(controller) {
        flush(controller);
      },
    });
  };
}

export async function runChat({ ip, messages }: { ip: string; messages: ChatMessage[] }): Promise<RunChatResult> {
  // 1. Session.
  const session = await getSession();
  if (!session) {
    return { kind: "error", status: 401, code: "NO_SESSION", message: "No hay una sesión activa. Selecciona tu póliza para continuar." };
  }
  const { poliza } = session;
  const sesionId = poliza;

  // 2. Rate limit.
  const rate = checkRateLimit(sesionId, ip);
  if (!rate.allowed) {
    return {
      kind: "error",
      status: 429,
      code: "RATE_LIMITED",
      message: "Alcanzaste el límite de mensajes por ahora. Intenta de nuevo en un momento.",
    };
  }

  // 3. Input validation.
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage || lastMessage.role !== "user" || lastMessage.content.trim().length === 0) {
    return { kind: "error", status: 400, code: "INVALID_INPUT", message: "El mensaje está vacío." };
  }
  if (lastMessage.content.length > MAX_MESSAGE_LENGTH) {
    return {
      kind: "error",
      status: 400,
      code: "INVALID_INPUT",
      message: `El mensaje supera los ${MAX_MESSAGE_LENGTH} caracteres.`,
    };
  }

  // 4. Emergency filter — before any LLM call.
  const emergency = detectEmergency(lastMessage.content);
  if (emergency.isEmergency) {
    await logTrace(sesionId, "emergency_bypass", { matchedPhrase: emergency.matchedPhrase ?? null });
    return { kind: "stream", response: fixedTextResponse(buildEmergencyResponse(emergency)) };
  }

  const info = await loadNombrePlan(poliza);
  if (!info) {
    return { kind: "error", status: 401, code: "NO_SESSION", message: "La póliza de la sesión ya no es válida." };
  }

  // 5-7. streamText + grounding + tracing.
  try {
    const tools = await buildTools(poliza);
    const systemPrompt = buildSystemPrompt(info.nombre, info.plan);
    const history: ModelMessage[] = messages
      .slice(-HISTORY_LIMIT)
      .map((m) => ({ role: m.role, content: m.content }));

    const toolResultsAcc: ToolResultRecord[] = [];
    let blocked: { invalidAmounts: string[]; invalidCitations: string[] } | null = null;

    const result = streamText({
      model: getChatModel(),
      instructions: systemPrompt,
      messages: history,
      tools,
      temperature: 0.2,
      stopWhen: stepCountIs(5),
      experimental_transform: createGroundingTransform<typeof tools>(toolResultsAcc, (reason) => {
        blocked = reason;
      }),
      onFinish: async () => {
        if (blocked) {
          await logTrace(sesionId, "validation_block", { ...blocked });
        }
        if (toolResultsAcc.length > 0) {
          await logTrace(sesionId, "tool_call", { calls: toolResultsAcc });
        }
      },
      onError: ({ error }) => {
        console.error("streamText onError:", error);
        void logTrace(sesionId, "error", { message: error instanceof Error ? error.message : String(error) });
      },
    });

    const uiStream = toUIMessageStream({ stream: result.stream, tools });
    return { kind: "stream", response: createUIMessageStreamResponse({ stream: uiStream }) };
  } catch (err) {
    console.error("runChat LLM_UNAVAILABLE:", err);
    await logTrace(sesionId, "error", { message: err instanceof Error ? err.message : String(err) });
    return { kind: "error", status: 503, code: "LLM_UNAVAILABLE", message: LLM_UNAVAILABLE_MESSAGE };
  }
}
