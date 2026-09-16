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
  InvalidResponseDataError,
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
import { buildEmergencyResponse, detectEmergency, type EmergencyDetection } from "../guards/emergency";
import { validateAmounts } from "../guards/amount-validator";
import { validateCitations } from "../guards/citation-validator";
import { containsToolCallArtifact } from "../guards/tool-syntax-validator";
import { isDegenerateRepetition } from "../guards/text-quality-validator";
import { buildSystemPrompt } from "./system-prompt";
import { buildTools } from "./tools";
import { getChatModel } from "./provider";

// PRD 7.7 step 3. Kept in sync by hand with lib/chat/constants.ts's copy,
// which is what app/chat/page.tsx (a Client Component) imports instead —
// importing this module client-side would pull `postgres`/`drizzle` into
// the browser bundle (see that file's comment).
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

/**
 * Single-shot UI message stream carrying pre-baked fixed text (emergency
 * bypass — no LLM call). Also emits a `data-emergency` part BEFORE the text,
 * so the client (components/chat/EmergencyBanner.tsx) can key off structured
 * data instead of matching the fixed Spanish copy against the streamed text.
 */
function emergencyResponse(text: string, detection: EmergencyDetection): Response {
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      writer.write({ type: "start" });
      writer.write({
        type: "data-emergency",
        id: "emergency",
        data: { matchedPhrase: detection.matchedPhrase ?? null, isSelfHarm: detection.isSelfHarm ?? false },
      });
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
  onBlock: (reason: {
    invalidAmounts: string[];
    invalidCitations: string[];
    toolSyntaxLeak?: boolean;
    degenerateOutput?: boolean;
  }) => void,
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
      // PRD 7.8 grounding, Phase 5 evals bug 4a: qwen2.5:14b occasionally
      // leaks raw tool-call syntax as prose instead of issuing a real tool
      // call (_icall_ markers, <tool_call> blocks, bare {"name":...,
      // "arguments":...} JSON). That's never a valid answer for the
      // patient — block it the same way an ungrounded amount/citation is
      // blocked, before it ever reaches the client.
      const toolSyntaxLeak = fullText.length > 0 && containsToolCallArtifact(fullText);
      // PRD bug 7 (ambig-01): a transient Ollama/qwen2.5:14b decoding
      // glitch can produce the same short token repeated dozens of times
      // instead of real prose or a clean stream error — degrade that the
      // same way as any other ungrounded/invalid text.
      const degenerateOutput = fullText.length > 0 && isDegenerateRepetition(fullText);

      controller.enqueue(textStart as unknown as Part);
      if (fullText.length > 0 && (!amounts.valid || !citations.valid || toolSyntaxLeak || degenerateOutput)) {
        onBlock({
          invalidAmounts: amounts.invalidAmounts,
          invalidCitations: citations.invalidCitations,
          ...(toolSyntaxLeak ? { toolSyntaxLeak: true } : {}),
          ...(degenerateOutput ? { degenerateOutput: true } : {}),
        });
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
  return runChatForPoliza({ poliza: session.poliza, ip, messages });
}

/**
 * Steps 2-7 of the PRD 7.7 pipeline, factored out of `runChat` so callers
 * that already have a resolved `poliza` can drive the exact same rate
 * limit / input validation / emergency filter / streamText / grounding /
 * tracing pipeline without going through `lib/session.ts`'s `getSession()`
 * (which reads the `copi_session` cookie via `next/headers` and only works
 * inside a Next.js request context).
 *
 * `runChat` (the `/api/chat` route's entry point) is the only production
 * caller and behaves exactly as before this split — it just resolves
 * `poliza` from the cookie first. `evals/run.ts` is the other caller: it
 * knows each case's `poliza` from `evals/casos.jsonl` and calls this
 * directly, exercising the real pipeline instead of reimplementing it.
 */
export async function runChatForPoliza({
  poliza,
  ip,
  messages,
}: {
  poliza: string;
  ip: string;
  messages: ChatMessage[];
}): Promise<RunChatResult> {
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
    return { kind: "stream", response: emergencyResponse(buildEmergencyResponse(emergency), emergency) };
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
    let blocked: {
      invalidAmounts: string[];
      invalidCitations: string[];
      toolSyntaxLeak?: boolean;
      degenerateOutput?: boolean;
    } | null = null;
    // PRD bug 7 (ambig-01, AI_InvalidResponseDataError): Ollama's streaming
    // endpoint occasionally sends a chunk the AI SDK can't parse into the
    // expected shape, surfacing as `InvalidResponseDataError` mid-stream.
    // That's transient — retry it once via the SDK's own retry-capable
    // `onError` (returning `{ retry: true }` re-attempts the call; see
    // `streamRetries`/`onError` in `ai`'s `streamText` docs) instead of
    // letting it reach the client as a crash. Any other error, or a second
    // occurrence of this one, falls through to normal error logging and
    // `toUIMessageStream`'s `onError` below turns it into a clean message.
    let retriedInvalidResponseData = false;

    const result = streamText({
      model: getChatModel(),
      instructions: systemPrompt,
      messages: history,
      tools,
      temperature: 0.2,
      stopWhen: stepCountIs(5),
      // PRD Anexo A rule 3 / PRD 6.2, Phase 5 evals (mark-fueradered-01,
      // ambig-03, ambig-04): `cotizar_consulta`'s own structured-error
      // guards (see lib/agent/tools.ts) stop a WRONG quote from being
      // returned, but the model can still attempt the call — which still
      // shows up as a "cotizar_consulta was called" tool-use event even
      // though it errored. `prepareStep` removes the tool from the
      // candidate set entirely for any step where it isn't legal yet, so
      // the model can't call it at all until a same-turn
      // buscar_especialidad step has resolved to a real specialty. This is
      // pure allow-list narrowing over already-defined tools (no new
      // tool-call round trip, no extra prompt text) — the execute-level
      // errors stay as a defense-in-depth fallback for any edge case this
      // narrowing doesn't cover (e.g. a provider that ignores activeTools).
      prepareStep: ({ steps }) => {
        const toolResultsSoFar = steps.flatMap((step) => step.toolResults);
        const lastBuscarEspecialidad = [...toolResultsSoFar]
          .reverse()
          .find((result) => result.toolName === "buscar_especialidad");
        const output = lastBuscarEspecialidad?.output as { motivo?: string } | undefined;
        const canQuote = lastBuscarEspecialidad !== undefined && output?.motivo !== "SIN_COINCIDENCIAS";
        if (!canQuote) {
          return { activeTools: ["buscar_especialidad", "obtener_resumen_plan", "buscar_en_poliza"] };
        }
        return undefined;
      },
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
        if (!retriedInvalidResponseData && InvalidResponseDataError.isInstance(error)) {
          retriedInvalidResponseData = true;
          void logTrace(sesionId, "error", { message: "retrying once after AI_InvalidResponseDataError" });
          return { retry: true };
        }
      },
    });

    const uiStream = toUIMessageStream({
      stream: result.stream,
      tools,
      // Never leak a raw provider/SDK error (stack traces, internal
      // messages) to the patient — degrade to the same copy used for a
      // guard-layer LLM_UNAVAILABLE failure.
      onError: (error) => {
        console.error("toUIMessageStream onError:", error);
        void logTrace(sesionId, "error", { message: error instanceof Error ? error.message : String(error) });
        return LLM_UNAVAILABLE_MESSAGE;
      },
    });
    return { kind: "stream", response: createUIMessageStreamResponse({ stream: uiStream }) };
  } catch (err) {
    console.error("runChat LLM_UNAVAILABLE:", err);
    await logTrace(sesionId, "error", { message: err instanceof Error ? err.message : String(err) });
    return { kind: "error", status: 503, code: "LLM_UNAVAILABLE", message: LLM_UNAVAILABLE_MESSAGE };
  }
}
