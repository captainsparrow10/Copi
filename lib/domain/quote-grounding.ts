/**
 * Cross-turn grounding for the session's active quote (bug fix — see
 * lib/agent/run.ts's `runChatForPoliza`).
 *
 * Root cause: `lib/guards/amount-validator.ts`'s `validateAmounts` only ever
 * sees `toolResultsAcc`, which `lib/agent/run.ts`'s grounding transform
 * builds from THIS turn's `tool-result` stream events alone. A follow-up
 * question ("qué diferencia hay entre el tier A y el recomendado", "cuánto
 * pagaría en Centro Medico Las Palmas") never calls `cotizar_consulta`
 * again — chat history sent to the model is text-only (PRD 7.7 step 5) — so
 * every dollar amount the model repeats from the PREVIOUS turn's quote gets
 * flagged as unsupported and replaced by the safe-fallback text.
 *
 * Fix: fold the poliza's persisted quote (lib/db/quotes.ts) into the exact
 * same `ToolResultRecord[]` shape the validator already accepts, so amounts
 * from that stored quote ground just like a real tool result would — while
 * anything NOT in the stored quote or this turn's tool outputs is still
 * blocked (see tests/quote-grounding.test.ts).
 */
import { computeEffectiveBreakdown } from "./effective-breakdown";
import type { CotizarConsultaSuccess } from "./quote-types";

/** Matches lib/agent/run.ts's private `ToolResultRecord` shape structurally, without importing it (avoids a run.ts <-> here cycle). */
export interface ToolResultRecord {
  toolName: string;
  input: unknown;
  output: unknown;
}

/** The subset of `lib/db/quotes.ts`'s `QuoteRow` this module needs — kept minimal so this stays DB-free/pure. */
export interface StoredQuoteContext {
  especialidadId: string;
  seleccion: string | null;
  estado: "abierta" | "cerrada";
  payload: CotizarConsultaSuccess;
}

const GROUNDING_TOOL_NAME = "cotizacion_activa_sesion";
const DIFFERENCES_TOOL_NAME = "diferencias_cotizacion_activa";

/**
 * Tools whose presence in the current turn means the patient is on a NEW
 * quote flow (new symptom, or a fresh quote was just produced). In that case
 * the stored quote must not ground anything: its prices belong to another
 * specialty or were superseded (eval regression clear-04: a gastroenterologia
 * answer reused the stored traumatologia price and the validator accepted it).
 */
const NEW_QUOTE_FLOW_TOOLS: ReadonlySet<string> = new Set(["buscar_especialidad", "cotizar_consulta"]);

/**
 * Grounding set for the amount/citation validators: this turn's real tool
 * results, plus the session's stored quote ONLY for pure follow-up turns
 * (no specialty search and no fresh quote this turn). Always returns a new array.
 */
export function buildGroundedToolResults(
  current: ToolResultRecord[],
  stored: StoredQuoteContext | null,
): ToolResultRecord[] {
  const startsNewQuoteFlow = current.some((result) => NEW_QUOTE_FLOW_TOOLS.has(result.toolName));
  if (!stored || startsNewQuoteFlow) return [...current];
  // Differences are computed here, server-side, so "cuánto más pago que en el
  // recomendado" answers are grounded without accepting arbitrary arithmetic.
  const diferencias = differencesVsRecommended(stored.payload).map((d) => Math.abs(d.diferencia));
  // The context block describes the components actually charged, so ground those too.
  const componentesCobrados = stored.payload.opciones.map((o) => computeEffectiveBreakdown(o));
  return [
    ...current,
    { toolName: GROUNDING_TOOL_NAME, input: {}, output: stored.payload },
    { toolName: DIFFERENCES_TOOL_NAME, input: {}, output: { diferencias, componentesCobrados } },
  ];
}

/** Each option's patient total minus the recommended option's (null recommended -> no differences). */
export function differencesVsRecommended(
  payload: CotizarConsultaSuccess,
): { hospital: string; diferencia: number }[] {
  const recommended = payload.opciones.find((o) => o.hospital === payload.recomendado);
  if (!recommended) return [];
  return payload.opciones.map((o) => ({
    hospital: o.hospital,
    diferencia: Math.round((o.total_paciente - recommended.total_paciente) * 100) / 100,
  }));
}

function formatMoney(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/**
 * Builds the compact, clearly delimited context block injected into the
 * model's instructions (lib/agent/run.ts) so it can answer follow-up
 * questions about the active quote without re-calling `cotizar_consulta`.
 * Returns `null` when there's no active quote to summarize.
 */
export function formatQuoteContextBlock(stored: StoredQuoteContext | null): string | null {
  if (!stored) return null;

  const { payload } = stored;
  const lines: string[] = [];
  lines.push("=== COTIZACIÓN ACTIVA DE LA SESIÓN (contexto, no la repitas completa) ===");
  lines.push(
    `Especialidad: ${payload.especialidad}. Estos precios valen SOLO para ${payload.especialidad}; ` +
      "nunca uses estos montos para otra especialidad.",
  );
  lines.push(`Estado: ${stored.estado === "cerrada" ? "cerrada" : "abierta"}`);
  lines.push(
    stored.seleccion
      ? `Selección actual del paciente: ${stored.seleccion}`
      : "Selección actual del paciente: ninguna todavía (no ha elegido hospital).",
  );

  const diferencias = new Map(differencesVsRecommended(payload).map((d) => [d.hospital, d.diferencia]));
  for (const opcion of payload.opciones) {
    const efectivo = computeEffectiveBreakdown(opcion);
    const outOfNetwork = opcion.marcas.includes("fuera_de_red");
    const seleccionadaTxt = stored.seleccion === opcion.hospital ? " [ELEGIDA POR EL PACIENTE]" : "";
    const recomendadaTxt = payload.recomendado === opcion.hospital ? " [RECOMENDADA]" : "";
    const diferencia = diferencias.get(opcion.hospital);
    const diferenciaTxt =
      diferencia === undefined || diferencia === 0 || payload.recomendado === opcion.hospital
        ? ""
        : ` Son ${formatMoney(Math.abs(diferencia))} ${diferencia > 0 ? "más" : "menos"} que el recomendado.`;
    const marcasTxt = [
      opcion.marcas.includes("carencia") ? " En carencia." : "",
      opcion.marcas.includes("tope") ? " Alcanza el tope anual." : "",
      outOfNetwork ? " Fuera de red: el plan no la cubre, pagas el 100% del precio." : "",
    ].join("");
    lines.push(
      `- ${opcion.hospital} (tier ${opcion.tier}, ${opcion.zona})${recomendadaTxt}${seleccionadaTxt}: ` +
        `precio de la consulta ${formatMoney(opcion.precio)}; pagas ${formatMoney(opcion.total_paciente)} ` +
        `(deducible ${formatMoney(efectivo.aDeducible)}, coaseguro ${formatMoney(efectivo.coaseguro)}, ` +
        `copago fijo ${formatMoney(efectivo.copagoFijo)}); la aseguradora paga ${formatMoney(opcion.total_aseguradora)}.` +
        `${diferenciaTxt}${marcasTxt}`,
    );
  }

  lines.push(
    "Usa estos datos, textualmente, para responder preguntas de seguimiento sobre esta cotización " +
      "(diferencias entre opciones, cuánto pagaría en un hospital puntual, qué significa cada marca) " +
      "Para comparar con el recomendado usa la diferencia ya indicada; no hagas otras cuentas. " +
      "Nunca copies este bloque completo: responde solo lo que el paciente pregunta, en pocas frases. " +
      "sin volver a llamar a cotizar_consulta — salvo que el paciente describa un síntoma nuevo o pida " +
      "otra especialidad.",
  );
  lines.push("=== FIN COTIZACIÓN ACTIVA ===");

  return lines.join("\n");
}

/**
 * Whether the patient's new message is still about the stored quote. The
 * caller runs the specialty guide search on the message BEFORE the LLM, so
 * this doesn't depend on the model calling any tool: a message that clearly
 * points to another specialty must never see or be grounded by the old prices.
 */
export function isFollowUpToStoredQuote(messageSpecialty: string | null, storedSpecialty: string): boolean {
  return messageSpecialty === null || messageSpecialty === storedSpecialty;
}
