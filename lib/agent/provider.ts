/**
 * Chat model provider switch (PRD 7.2 / guia-construccion Parte 2 rule 6).
 *
 * Mirrors the branching pattern in lib/rag/embed.ts: this is the only file
 * that knows how to build a chat `LanguageModel`. `LLM_PROVIDER=ollama` goes
 * through Ollama's OpenAI-compatible endpoint; `LLM_PROVIDER=deepseek` through
 * DeepSeek's OpenAI-compatible API; `LLM_PROVIDER=google` uses `@ai-sdk/google`.
 * No other file should import `createOpenAICompatible` or `google` directly for chat.
 */
import { config } from "dotenv";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { google } from "@ai-sdk/google";
import type { LanguageModel } from "ai";

// Next.js auto-loads .env.local at runtime; scripts run via tsx do not, so
// load it explicitly here (same pattern as lib/db/client.ts / lib/rag/embed.ts).
config({ path: ".env.local" });

type ChatProvider = "ollama" | "google" | "deepseek";

const LLM_PROVIDER: ChatProvider =
  process.env.LLM_PROVIDER === "google" || process.env.LLM_PROVIDER === "deepseek" ? process.env.LLM_PROVIDER : "ollama";
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
const OLLAMA_URL = process.env.OLLAMA_URL;
const CHAT_MODEL = process.env.CHAT_MODEL;

function ollamaModel(): LanguageModel {
  if (!OLLAMA_URL) throw new Error("OLLAMA_URL is not set. Define it in .env.local.");
  if (!CHAT_MODEL) throw new Error("CHAT_MODEL is not set. Define it in .env.local.");
  const ollama = createOpenAICompatible({
    name: "ollama",
    baseURL: `${OLLAMA_URL}/v1`,
    // Ollama ignores the API key entirely, but sending a placeholder avoids
    // relying on "no Authorization header" behavior across client versions.
    apiKey: "ollama",
  });
  return ollama(CHAT_MODEL);
}

function googleModel(): LanguageModel {
  if (!CHAT_MODEL) throw new Error("CHAT_MODEL is not set. Define it in .env.local.");
  return google(CHAT_MODEL);
}

function deepseekModel(): LanguageModel {
  if (!CHAT_MODEL) throw new Error("CHAT_MODEL is not set. Define it in .env.local.");
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not set. Define it in .env.local.");
  const deepseek = createOpenAICompatible({ name: "deepseek", baseURL: DEEPSEEK_BASE_URL, apiKey });
  return deepseek(CHAT_MODEL);
}

/** Returns the chat `LanguageModel` for the configured provider. */
export function getChatModel(): LanguageModel {
  switch (LLM_PROVIDER) {
    case "google":
      return googleModel();
    case "deepseek":
      return deepseekModel();
    default:
      return ollamaModel();
  }
}

/** Which provider is configured (used by /api/health for a cheap reachability check). */
export function chatProviderName(): ChatProvider {
  return LLM_PROVIDER;
}

/**
 * Cheap reachability check for /api/health — not a full chat completion
 * (would cost tokens/quota and be slow). Ollama: list local models.
 * Google: presence of the API key stands in for a network probe, since a
 * real one would consume paid quota just for a health check.
 */
export async function checkChatProviderHealth(timeoutMs = 3000): Promise<boolean> {
  try {
    if (LLM_PROVIDER === "google") {
      return Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
    }
    if (LLM_PROVIDER === "deepseek") {
      return Boolean(process.env.DEEPSEEK_API_KEY);
    }
    if (!OLLAMA_URL) return false;
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch {
    return false;
  }
}
