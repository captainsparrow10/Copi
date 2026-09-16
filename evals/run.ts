/**
 * Phase 5 eval runner (PRD 7.9 / guia-construccion.md Parte 2 FASE 5).
 *
 * Reads `evals/casos.jsonl`, runs every case against the REAL pipeline —
 * `lib/agent/run.ts`'s `runChatForPoliza` (the same `streamText` + grounding
 * + tracing pipeline `/api/chat` uses, minus only the cookie-session lookup,
 * which this script sidesteps by knowing each case's `poliza` up front) —
 * and scores the observed turn with the pure functions in `evals/scoring.ts`.
 * Never reimplements the agent: this file's only job is to (1) drive
 * `runChatForPoliza`, (2) replay its UI message stream back into a
 * `UIMessage` with the SAME helpers the client uses (`lib/chat/ui-message.ts`),
 * and (3) score what was actually delivered.
 *
 * Emergency cases (PRD 6.3) never reach the LLM — `runChatForPoliza` returns
 * before calling `streamText` — so those resolve in milliseconds. Every
 * other case is a real Ollama qwen2.5:14b round trip against a single LAN
 * GPU; cases run strictly sequentially (never in parallel) and each gets a
 * generous per-case timeout so one stuck turn can't hang the whole run.
 *
 * Writes `evals/reporte.md` with the PRD section 4 metrics table, a
 * per-category breakdown, and full detail for every failing case (expected
 * vs. observed) so failures can be triaged without re-running anything.
 */
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
config({ path: ".env.local" });

import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import { parseJsonEventStream, readUIMessageStream, uiMessageChunkSchema, type UIMessage, type UIMessageChunk } from "ai";
import type { ParseResult } from "@ai-sdk/provider-utils";
import { runChatForPoliza, type ChatMessage } from "../lib/agent/run";
import { resetRateLimitStore } from "../lib/guards/rate-limit";
import { chatProviderName } from "../lib/agent/provider";
import { extractEmergencyData, extractToolTrace, getMessageText } from "../lib/chat/ui-message";
import { evaluateCase, computeMetrics } from "./scoring";
import type { CaseResult, EvalCase, EvalCategory, ObservedTurn } from "./types";

const CASOS_PATH = new URL("./casos.jsonl", import.meta.url);
const REPORTE_PATH = new URL("./reporte.md", import.meta.url);

/** Generous — a case can involve 2-3 sequential Ollama round trips on a single shared GPU (PRD env notes). */
const PER_CASE_TIMEOUT_MS = 240_000;
// Pause between cases so hosted free tiers (e.g. Gemini's per-minute request cap) aren't exceeded.
const CASE_DELAY_MS = Number(process.env.EVAL_CASE_DELAY_MS ?? "0");

const EVAL_CATEGORIES = [
  "sintoma_claro",
  "sintoma_ambiguo",
  "emergencia",
  "carencia_tope_inactiva",
  "rag_poliza",
  "fuera_de_alcance",
  "manipulacion",
] as const satisfies readonly EvalCategory[];

const evalCaseSchema = z.object({
  id: z.string().min(1),
  category: z.enum(EVAL_CATEGORIES),
  poliza: z.string().min(1),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1) }))
    .min(1),
  expect: z.object({
    emergencyBypass: z.boolean().optional(),
    toolSequence: z.array(z.string()).optional(),
    toolArgs: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
    forbiddenTools: z.array(z.string()).optional(),
    expectMarks: z.array(z.string()).optional(),
    toolError: z.object({ tool: z.string(), error: z.string() }).optional(),
    clarifyingQuestion: z.boolean().optional(),
    scopeRejection: z.boolean().optional(),
    noEncontrado: z.boolean().optional(),
    validCitation: z.boolean().optional(),
    expectedPlanNombre: z.string().optional(),
  }),
});

async function loadCases(): Promise<EvalCase[]> {
  const raw = await readFile(CASOS_PATH, "utf-8");
  const lines = raw.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  const cases: EvalCase[] = [];
  for (const [i, line] of lines.entries()) {
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch (err) {
      throw new Error(`evals/casos.jsonl line ${i + 1}: invalid JSON — ${err instanceof Error ? err.message : String(err)}`);
    }
    const parsed = evalCaseSchema.safeParse(json);
    if (!parsed.success) {
      throw new Error(`evals/casos.jsonl line ${i + 1} (${(json as { id?: string }).id ?? "?"}): ${parsed.error.message}`);
    }
    cases.push(parsed.data);
  }
  return cases;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
    void label;
  });
}

/** Drains a `runChatForPoliza` stream Response into the final accumulated `UIMessage`, reusing the exact chunk format `useChat` consumes. */
async function drainToUIMessage(response: Response): Promise<UIMessage | undefined> {
  const body = response.body;
  if (!body) throw new Error("stream response has no body");

  const parsed = parseJsonEventStream({ stream: body, schema: uiMessageChunkSchema });
  const chunks = parsed.pipeThrough(
    new TransformStream<ParseResult<UIMessageChunk>, UIMessageChunk>({
      transform(chunk, controller) {
        if (chunk.success) controller.enqueue(chunk.value);
        else console.error("  SSE chunk parse error:", chunk.error);
      },
    }),
  );

  let last: UIMessage | undefined;
  for await (const message of readUIMessageStream({ stream: chunks })) {
    last = message;
  }
  return last;
}

async function runOneCase(evalCase: EvalCase): Promise<ObservedTurn> {
  // Fresh rate-limit counters per case. Each case also gets its own session
  // id, so a quote persisted by one case can never leak into another
  // (regression: a gastro case answered with a stored traumatologia price).
  resetRateLimitStore();

  const start = Date.now();
  try {
    const last = await withTimeout(
      (async () => {
        const result = await runChatForPoliza({
          poliza: evalCase.poliza,
          sesionId: `eval-${evalCase.id}-${randomUUID()}`,
          ip: "127.0.0.1",
          messages: evalCase.messages as ChatMessage[],
        });
        if (result.kind === "error") {
          throw new Error(`runChatForPoliza returned a guard-layer error: ${result.code} — ${result.message}`);
        }
        return drainToUIMessage(result.response);
      })(),
      PER_CASE_TIMEOUT_MS,
      evalCase.id,
    );

    const durationMs = Date.now() - start;
    if (!last) {
      return { finalText: "", toolTrace: [], emergencyData: null, durationMs, fatalError: "no UI message was produced" };
    }
    return {
      finalText: getMessageText(last),
      toolTrace: extractToolTrace([last]),
      emergencyData: extractEmergencyData(last),
      durationMs,
    };
  } catch (err) {
    const durationMs = Date.now() - start;
    return {
      finalText: "",
      toolTrace: [],
      emergencyData: null,
      durationMs,
      fatalError: err instanceof Error ? err.message : String(err),
    };
  }
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function jsonSnippet(value: unknown): string {
  if (value === undefined) return "—";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 300 ? `${text.slice(0, 300)}…` : text;
}

function buildReport(results: CaseResult[], totalDurationMs: number): string {
  const report = computeMetrics(results);
  const now = new Date().toISOString();
  const provider = chatProviderName();
  const model = process.env.CHAT_MODEL ?? "(unset)";
  const embedModel = process.env.EMBED_MODEL ?? "(unset)";
  const ragMinScore = process.env.RAG_MIN_SCORE ?? "0.70";

  const lines: string[] = [];
  lines.push("# Copi — Reporte de evaluaciones (Fase 5)");
  lines.push("");
  lines.push(`- Fecha: ${now}`);
  lines.push(`- Proveedor LLM: \`${provider}\``);
  lines.push(`- Modelo de chat: \`${model}\``);
  lines.push(`- Modelo de embeddings: \`${embedModel}\``);
  lines.push(`- RAG_MIN_SCORE: \`${ragMinScore}\``);
  lines.push(`- Casos totales: ${report.overall.total} (\`evals/casos.jsonl\`, PRD 7.9)`);
  lines.push(`- Aprobados: ${report.overall.passed} / ${report.overall.total}`);
  lines.push(`- Duración total de la corrida: ${formatDuration(totalDurationMs)}`);
  lines.push("");
  lines.push(
    "> Entorno: Ollama LAN (192.168.0.220), un solo GPU compartido, casos corridos en serie. " +
      "La meta de rapidez de la PRD (\"p95 < 8s, nube\") está pensada para el proveedor de producción " +
      "(Gemini Flash-Lite en Vercel), no para este entorno local — se reporta igual para referencia.",
  );
  lines.push("");

  lines.push("## Métricas (PRD sección 4)");
  lines.push("");
  lines.push("| Objetivo | Métrica | Meta | Actual | Cumple |");
  lines.push("|---|---|---|---|---|");
  for (const row of report.rows) {
    lines.push(`| ${row.objetivo} | ${row.metrica} | ${row.meta} | ${row.actual} | ${row.cumple ? "✅" : "❌"} |`);
  }
  lines.push("");

  lines.push("## Resultados por categoría");
  lines.push("");
  lines.push("| Categoría | Casos | Aprobados | % |");
  lines.push("|---|---|---|---|");
  for (const category of EVAL_CATEGORIES) {
    const bucket = report.byCategory[category] ?? { total: 0, passed: 0 };
    const pct = bucket.total > 0 ? ((bucket.passed / bucket.total) * 100).toFixed(1) : "—";
    lines.push(`| ${category} | ${bucket.total} | ${bucket.passed} | ${pct}% |`);
  }
  lines.push("");

  const failures = results.filter((r) => !r.passed);
  lines.push(`## Casos fallidos (${failures.length})`);
  lines.push("");
  if (failures.length === 0) {
    lines.push("Ninguno.");
  } else {
    for (const failure of failures) {
      lines.push(`### \`${failure.id}\` — ${failure.category} (${failure.poliza})`);
      lines.push("");
      lines.push(`- Mensaje del paciente: "${failure.message}"`);
      lines.push(`- Duración: ${failure.durationMs}ms`);
      lines.push(`- Texto final del modelo: "${failure.finalText || "(vacío)"}"`);
      lines.push("- Checks fallidos:");
      for (const check of failure.checks.filter((c) => !c.passed)) {
        const expected = jsonSnippet(check.expected);
        const observed = jsonSnippet(check.observed);
        const detail = check.detail ? ` — ${check.detail}` : "";
        lines.push(`  - **${check.name}**: esperado \`${expected}\`, observado \`${observed}\`${detail}`);
      }
      lines.push("");
    }
  }

  lines.push("## Todos los casos");
  lines.push("");
  lines.push("| ID | Categoría | Póliza | Resultado | Duración |");
  lines.push("|---|---|---|---|---|");
  for (const r of results) {
    lines.push(`| \`${r.id}\` | ${r.category} | ${r.poliza} | ${r.passed ? "✅ PASS" : "❌ FAIL"} | ${r.durationMs}ms |`);
  }
  lines.push("");

  return lines.join("\n");
}

async function main(): Promise<void> {
  const cases = await loadCases();
  console.log(`Copi evals — ${cases.length} casos (PRD 7.9), proveedor=${chatProviderName()}, modelo=${process.env.CHAT_MODEL}\n`);

  const results: CaseResult[] = [];
  const runStart = Date.now();

  for (const [i, evalCase] of cases.entries()) {
    if (i > 0 && CASE_DELAY_MS > 0) await new Promise((resolve) => setTimeout(resolve, CASE_DELAY_MS));
    const progress = `[${i + 1}/${cases.length}]`;
    process.stdout.write(`${progress} ${evalCase.id} (${evalCase.category}, ${evalCase.poliza}) ... `);
    const observed = await runOneCase(evalCase);
    const result = evaluateCase(evalCase, observed);
    results.push(result);
    console.log(`${result.passed ? "PASS" : "FAIL"} (${result.durationMs}ms)`);
    if (!result.passed) {
      for (const check of result.checks.filter((c) => !c.passed)) {
        console.log(`    ✗ ${check.name}: expected=${jsonSnippet(check.expected)} observed=${jsonSnippet(check.observed)}`);
      }
    }
  }

  const totalDurationMs = Date.now() - runStart;
  const report = buildReport(results, totalDurationMs);
  await writeFile(REPORTE_PATH, report, "utf-8");

  const summary = computeMetrics(results);
  console.log(`\n${summary.overall.passed} / ${summary.overall.total} casos aprobados.`);
  console.log(`Reporte escrito en evals/reporte.md (duración total: ${formatDuration(totalDurationMs)}).`);

  if (summary.overall.passed < summary.overall.total) {
    process.exitCode = 1;
  }
}

// The Postgres pool keeps the event loop alive, so exit explicitly once the
// report is written (a hung process previously looked like a still-running eval).
main()
  .catch((err) => {
    console.error("evals/run.ts failed:", err);
    process.exitCode = 1;
  })
  .finally(() => {
    setTimeout(() => process.exit(process.exitCode ?? 0), 500);
  });
