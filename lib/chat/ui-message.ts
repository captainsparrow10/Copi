/**
 * Pure helpers over `@ai-sdk/react`'s `UIMessage[]` (v7 — see `ai`'s
 * `UIMessagePart` union). No React here: these are unit-tested directly
 * (tests/chat-ui-message.test.ts) and consumed by app/chat/page.tsx,
 * components/QuoteCard.tsx, components/chat/EmergencyBanner.tsx and
 * components/TracePanel.tsx.
 */
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import type { ChatMessage } from "../agent/run";
import type { CotizarConsultaOutput } from "../agent/tools";

/**
 * Adapts `useChat`'s `UIMessage[]` to the `{ role, content }[]` shape
 * `/api/chat` expects (lib/agent/run.ts's `ChatMessage`, fixed in Phase 3).
 * Concatenates a message's `text` parts in order; non-text parts (tool
 * calls, data parts, etc.) don't have a server-side `content` equivalent
 * today, so they're dropped here rather than guessed at. System messages
 * are dropped too — the PRD's system prompt is server-injected
 * (lib/agent/system-prompt.ts), never sent by the client.
 */
export function toChatMessages(messages: UIMessage[]): ChatMessage[] {
  const result: ChatMessage[] = [];
  for (const message of messages) {
    if (message.role !== "user" && message.role !== "assistant") continue;
    const content = getMessageText(message);
    if (content.length === 0) continue;
    result.push({ role: message.role, content });
  }
  return result;
}

/**
 * A message's `text` parts, in order. Shared by `toChatMessages` and app/chat/page.tsx's
 * message bubbles. Each assistant text part comes from a separate model step (e.g. before
 * and after a tool call), so those become paragraphs instead of running together.
 */
export function getMessageText(message: UIMessage): string {
  const texts = message.parts
    .filter((part): part is Extract<UIMessage["parts"][number], { type: "text" }> => part.type === "text")
    .map((part) => part.text);
  if (message.role !== "assistant") return texts.join("");
  return texts
    .map((text) => text.trim())
    .filter((text) => text.length > 0)
    .join("\n\n");
}

export interface QuoteMatch {
  toolCallId: string;
  output: CotizarConsultaOutput;
}

/**
 * Finds the most recent completed `cotizar_consulta` tool result across
 * every message. The quote card renders from this — never by parsing the
 * model's prose (PRD Anexo C rule 4 / guia-construccion.md Parte 2 rule 4).
 */
export function extractLatestQuote(messages: UIMessage[]): QuoteMatch | null {
  let latest: QuoteMatch | null = null;
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type === "tool-cotizar_consulta" && "state" in part && part.state === "output-available") {
        const withOutput = part as unknown as { toolCallId: string; output: CotizarConsultaOutput };
        latest = { toolCallId: withOutput.toolCallId, output: withOutput.output };
      }
    }
  }
  return latest;
}

export interface EmergencyData {
  matchedPhrase: string | null;
  isSelfHarm: boolean;
}

/**
 * Finds the structured `data-emergency` part (lib/agent/run.ts's
 * `emergencyResponse`), so the UI can show the EmergencyBanner from
 * structured data instead of matching the fixed Spanish copy against the
 * streamed text.
 */
export function extractEmergencyData(message: UIMessage): EmergencyData | null {
  for (const part of message.parts) {
    if (part.type === "data-emergency") {
      const data = (part as unknown as { data?: Partial<EmergencyData> }).data;
      return { matchedPhrase: data?.matchedPhrase ?? null, isSelfHarm: data?.isSelfHarm ?? false };
    }
  }
  return null;
}

export interface ToolTraceEntry {
  toolCallId: string;
  toolName: string;
  state: string;
  input: unknown;
  output: unknown;
}

/**
 * Flattens every tool-invocation part (static or dynamic) across all
 * messages into a flat trace list for components/TracePanel.tsx (PRD P1-03,
 * "Cómo llegué a esto": herramientas llamadas, argumentos y resultados).
 */
export function extractToolTrace(messages: UIMessage[]): ToolTraceEntry[] {
  const entries: ToolTraceEntry[] = [];
  for (const message of messages) {
    for (const part of message.parts) {
      if (!isToolUIPart(part)) continue;
      const withState = part as unknown as {
        toolCallId: string;
        state: string;
        input?: unknown;
        output?: unknown;
      };
      entries.push({
        toolCallId: withState.toolCallId,
        toolName: getToolName(part),
        state: withState.state,
        input: withState.input,
        output: withState.output,
      });
    }
  }
  return entries;
}
