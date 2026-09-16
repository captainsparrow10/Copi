/**
 * POST /api/quote/close — closes the session's active quote and returns the
 * closing summary (feature spec item 3, "Cerrar cotización"). Everything in
 * the summary is recomputed/validated server-side from the stored quote row
 * (DB) + domain helpers — never from the model's text (see
 * lib/domain/quote-summary.ts). Idempotent: closing an already-closed quote
 * returns the same summary without re-closing it or re-logging the trace.
 *
 * Errors (PRD 7.6 shape):
 * - 401 NO_SESSION
 * - 400 NO_ACTIVE_QUOTE — poliza has no quote yet this session
 * - 400 NO_SELECTION — no hospital selected yet (POST /api/quote/select first)
 */
import { getSession } from "../../../../lib/session";
import { getActiveQuote, closeQuoteRow, type QuoteRow } from "../../../../lib/db/quotes";
import { buildClosingSummary } from "../../../../lib/domain/quote-summary";
import { getCustomerServiceContact } from "../../../../lib/config/customer-service";
import { logTrace } from "../../../../lib/db/trace";
import { loadNombrePlan } from "../../../../lib/agent/run";

export async function POST(): Promise<Response> {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: { code: "NO_SESSION", message: "No hay una sesión activa." } }, { status: 401 });
  }

  const active = await getActiveQuote(session.sid);
  if (!active) {
    return Response.json(
      { error: { code: "NO_ACTIVE_QUOTE", message: "Todavía no tienes una cotización activa." } },
      { status: 400 },
    );
  }
  if (!active.seleccion) {
    return Response.json(
      { error: { code: "NO_SELECTION", message: "Elige un hospital antes de cerrar la cotización." } },
      { status: 400 },
    );
  }

  const info = await loadNombrePlan(session.poliza);
  if (!info) {
    return Response.json({ error: { code: "NO_SESSION", message: "La póliza de la sesión ya no es válida." } }, { status: 401 });
  }

  let quote: QuoteRow = active;
  if (quote.estado !== "cerrada") {
    quote = await closeQuoteRow(active.id);
    await logTrace(session.sid, "quote_closed", { quoteId: quote.id, hospital: quote.seleccion });
  }

  const opcion = quote.payload.opciones.find((o) => o.hospital === quote.seleccion);
  if (!opcion) {
    // Defensive: seleccion is only ever set via POST /api/quote/select, which
    // already validates it against payload.opciones — this should be unreachable.
    return Response.json(
      { error: { code: "INVALID_INPUT", message: "La selección de la cotización ya no es válida." } },
      { status: 400 },
    );
  }

  const summary = buildClosingSummary({
    quoteId: quote.id,
    nombre: info.nombre,
    plan: info.plan,
    especialidad: quote.payload.especialidad,
    opcion,
    fecha: quote.cerradoEn ?? new Date(),
    contacto: getCustomerServiceContact(),
    estado: quote.estado,
  });

  return Response.json({ summary });
}
