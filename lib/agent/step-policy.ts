/**
 * Per-step tool policy for `streamText`'s `prepareStep` (lib/agent/run.ts).
 *
 * PRD Anexo A rule 3: buscar_especialidad -> cotizar_consulta, in that order.
 * - Until a same-turn search resolves a specialty, cotizar_consulta is not
 *   offered at all (the model can't quote an unconfirmed specialty).
 * - Once a specialty is found and nothing was quoted yet, the next step MUST
 *   call cotizar_consulta. qwen2.5:14b otherwise sometimes stops after the
 *   search and answers with prices it remembers from context (eval regression
 *   clear-04/05/08).
 */

export interface StepToolResult {
  toolName: string;
  output: unknown;
}

export type StepToolDecision =
  | { activeTools: string[] }
  | { toolChoice: { type: "tool"; toolName: "cotizar_consulta" } }
  | Record<string, never>;

const PRE_QUOTE_TOOLS = ["buscar_especialidad", "obtener_resumen_plan", "buscar_en_poliza"];

export function decideStepTools(toolResultsSoFar: readonly StepToolResult[]): StepToolDecision {
  const lastSearch = [...toolResultsSoFar].reverse().find((r) => r.toolName === "buscar_especialidad");
  const searchOutput = lastSearch?.output as { motivo?: string } | undefined;
  const specialtyFound = lastSearch !== undefined && searchOutput?.motivo !== "SIN_COINCIDENCIAS";

  if (!specialtyFound) {
    return { activeTools: PRE_QUOTE_TOOLS };
  }
  const alreadyQuoted = toolResultsSoFar.some((r) => r.toolName === "cotizar_consulta");
  if (!alreadyQuoted) {
    return { toolChoice: { type: "tool", toolName: "cotizar_consulta" } };
  }
  return {};
}
