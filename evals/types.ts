/**
 * Shared types for the Phase 5 eval harness (PRD 7.9). `EvalCase` is the
 * shape of every line in `evals/casos.jsonl`; `ObservedTurn` is what
 * `evals/run.ts` extracts from a real `runChatForPoliza` turn (lib/agent/run.ts)
 * after replaying its UI message stream. `evals/scoring.ts` is pure over
 * these two — it never touches the DB, the LLM, or the network — so it can
 * be unit tested directly (tests/eval-scoring.test.ts).
 */
import type { ToolTraceEntry, EmergencyData } from "../lib/chat/ui-message";

export type EvalCategory =
  | "sintoma_claro"
  | "sintoma_ambiguo"
  | "emergencia"
  | "carencia_tope_inactiva"
  | "rag_poliza"
  | "fuera_de_alcance"
  | "manipulacion";

/** A single `[C-x.y]` / `[G-x]` fragment citation the model is expected to be able to cite. */
export interface ExpectSpec {
  /** PRD 6.3: no LLM call, fixed 911 text, logged as `emergency_bypass`. */
  emergencyBypass?: boolean;
  /** Ordered subsequence of tool names that must appear in the turn's tool trace. */
  toolSequence?: string[];
  /** Per-tool partial match against that tool's first-call `input` (Zod-resolved args). */
  toolArgs?: Record<string, Record<string, unknown>>;
  /** Tool names that must NOT appear anywhere in the turn's tool trace. */
  forbiddenTools?: string[];
  /** `marcas` values (PRD 7.4: fuera_de_red / carencia / tope) that must appear on at least one `cotizar_consulta` option. */
  expectMarks?: string[];
  /** A specific tool's output must carry this `error` code (e.g. `cotizar_consulta` + `POLIZA_INACTIVA`). */
  toolError?: { tool: string; error: string };
  /** PRD 6.2: ambiguous symptom — the model should ask one clarifying question instead of quoting. */
  clarifyingQuestion?: boolean;
  /** PRD 6.5 / Anexo A "ALCANCE": out-of-scope request rejected. */
  scopeRejection?: boolean;
  /** `buscar_en_poliza` returned `{ motivo: "NO_ENCONTRADO" }` and the model used the fixed refusal text. */
  noEncontrado?: boolean;
  /** `buscar_en_poliza` returned fragments and the model cited at least one with a valid `[C-x.y]`. */
  validCitation?: boolean;
  /** Manipulation resistance: if `cotizar_consulta` was called, its `plan` must equal the session's REAL plan. */
  expectedPlanNombre?: string;
}

export interface EvalCase {
  id: string;
  category: EvalCategory;
  poliza: string;
  messages: { role: "user" | "assistant"; content: string }[];
  expect: ExpectSpec;
}

/** What evals/run.ts extracts from a real turn's UI message stream — the observable surface `evaluateCase` scores against. */
export interface ObservedTurn {
  finalText: string;
  toolTrace: ToolTraceEntry[];
  emergencyData: EmergencyData | null;
  durationMs: number;
  /** Set when the turn errored or timed out before producing a UI message at all. */
  fatalError?: string;
}

export interface CheckResult {
  name: string;
  passed: boolean;
  expected?: unknown;
  observed?: unknown;
  detail?: string;
}

export interface CaseResult {
  id: string;
  category: EvalCategory;
  poliza: string;
  message: string;
  passed: boolean;
  checks: CheckResult[];
  durationMs: number;
  finalText: string;
  /** True when `expect.toolSequence` includes `cotizar_consulta` — a "quotation" case for the tool-use and rapidity metrics. */
  isQuoteCase: boolean;
}
