/**
 * Embedding provider switch (PRD 7.2 / guia-construccion Parte 2 rule 6).
 *
 * This is the only file that knows how to talk to an embedding provider.
 * `EMBED_PROVIDER` (defaults to `LLM_PROVIDER`): `ollama` calls Ollama's `/api/embed`; `google`
 * uses `@ai-sdk/google`'s embedding model through the `ai` package. Both
 * branches must return vectors of `EMBED_DIM` dimensions (768) so the
 * `fragmentos.embedding` column and pgvector index never need to change.
 */
import { config } from "dotenv";
import { embed } from "ai";
import { google } from "@ai-sdk/google";

// Next.js auto-loads .env.local at runtime; scripts run via tsx do not, so
// load it explicitly here (same pattern as lib/db/client.ts).
config({ path: ".env.local" });

/**
 * nomic-embed-text (and Gemini's embedding models) are trained with distinct
 * instructions for what is being embedded — a stored document chunk vs. an
 * incoming search query. Using the right one measurably improves retrieval,
 * so every caller must say which one this text is.
 */
export type EmbedTask = "document" | "query";

// Embeddings can come from a different provider than chat (e.g. DeepSeek chat has
// no embeddings API, so Gemini embeds). Defaults to the chat provider.
const EMBED_PROVIDER = process.env.EMBED_PROVIDER ?? process.env.LLM_PROVIDER ?? "ollama";
const OLLAMA_URL = process.env.OLLAMA_URL;
const EMBED_MODEL = process.env.EMBED_MODEL;
const EMBED_DIM = Number(process.env.EMBED_DIM ?? "768");

interface OllamaEmbedResponse {
  embeddings: number[][];
}

/** nomic-embed-text task prefixes — see lib/rag/embed.ts module doc. */
function nomicPrefix(task: EmbedTask): string {
  return task === "document" ? "search_document: " : "search_query: ";
}

async function embedOllama(text: string, task: EmbedTask): Promise<number[]> {
  if (!OLLAMA_URL) throw new Error("OLLAMA_URL is not set. Define it in .env.local.");
  if (!EMBED_MODEL) throw new Error("EMBED_MODEL is not set. Define it in .env.local.");

  const res = await fetch(`${OLLAMA_URL}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, input: `${nomicPrefix(task)}${text}` }),
  });
  if (!res.ok) {
    throw new Error(`Ollama embed request failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as OllamaEmbedResponse;
  const vector = data.embeddings?.[0];
  if (!vector) {
    throw new Error("Ollama embed response did not include an embedding.");
  }
  return vector;
}

/**
 * Google branch: implemented against the currently installed `@ai-sdk/google`
 * (EmbeddingModelV4, `google.textEmbeddingModel`) so it's ready to switch to
 * for production, but it is NOT exercised in this environment — there is no
 * GOOGLE_GENERATIVE_AI_API_KEY available here. `outputDimensionality` pins
 * gemini-embedding-001 to EMBED_DIM (768) to match the pgvector schema, and
 * `taskType` is Gemini's equivalent of nomic's document/query prefixes.
 */
async function embedGoogle(text: string, task: EmbedTask): Promise<number[]> {
  if (!EMBED_MODEL) throw new Error("EMBED_MODEL is not set. Define it in .env.local.");

  const { embedding } = await embed({
    model: google.textEmbeddingModel(EMBED_MODEL),
    value: text,
    providerOptions: {
      google: {
        outputDimensionality: EMBED_DIM,
        taskType: task === "document" ? "RETRIEVAL_DOCUMENT" : "RETRIEVAL_QUERY",
      },
    },
  });
  return embedding;
}

/** Embeds `text` for the configured provider, validating the resulting dimension. */
export async function embedText(text: string, task: EmbedTask): Promise<number[]> {
  const vector = EMBED_PROVIDER === "google" ? await embedGoogle(text, task) : await embedOllama(text, task);
  if (vector.length !== EMBED_DIM) {
    throw new Error(
      `Embedding dimension mismatch: provider returned ${vector.length}, expected EMBED_DIM=${EMBED_DIM}.`,
    );
  }
  return vector;
}

/** Stored alongside each fragment's embedding (PRD 7.3 `fragmentos.embedding_model`). */
export function embeddingModelLabel(): string {
  return `${EMBED_PROVIDER}:${EMBED_MODEL ?? "unknown"}`;
}
