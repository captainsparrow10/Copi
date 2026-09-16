/**
 * POST /api/quote/select — stores the patient's hospital choice
 * server-side for the session's active quote (feature spec item 1). Body:
 * `{ hospital: string }`. The hospital must exist among the active quote's
 * `opciones` (lib/domain/quote-selection.ts validates this against the
 * server-stored payload — never against anything else the client claims).
 * Out-of-network hospitals CAN be selected (the quote already marks them
 * `fuera_de_red`; the UI is responsible for the "pagas el 100%" warning).
 *
 * Errors (PRD 7.6 shape `{ error: { code, message } }`):
 * - 401 NO_SESSION
 * - 400 INVALID_INPUT — missing/blank `hospital`
 * - 400 NO_ACTIVE_QUOTE — poliza has no quote yet this session
 * - 400 QUOTE_CLOSED — the active quote is already closed
 * - 400 HOSPITAL_NO_ENCONTRADO — `hospital` isn't one of the quote's options
 */
import type { NextRequest } from "next/server";
import { getSession } from "../../../../lib/session";
import { getActiveQuote, updateSelection, toQuoteResponse } from "../../../../lib/db/quotes";
import { validateSelection } from "../../../../lib/domain/quote-selection";
import { logTrace } from "../../../../lib/db/trace";

interface SelectRequestBody {
  hospital?: unknown;
}

export async function POST(request: NextRequest): Promise<Response> {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: { code: "NO_SESSION", message: "No hay una sesión activa." } }, { status: 401 });
  }

  let body: SelectRequestBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: { code: "INVALID_INPUT", message: "Cuerpo de la solicitud inválido." } }, { status: 400 });
  }

  const hospital = body.hospital;
  if (typeof hospital !== "string" || hospital.trim().length === 0) {
    return Response.json({ error: { code: "INVALID_INPUT", message: "Falta el nombre del hospital." } }, { status: 400 });
  }

  const active = await getActiveQuote(session.sid);
  if (!active) {
    return Response.json(
      { error: { code: "NO_ACTIVE_QUOTE", message: "Todavía no tienes una cotización activa." } },
      { status: 400 },
    );
  }
  if (active.estado === "cerrada") {
    return Response.json(
      { error: { code: "QUOTE_CLOSED", message: "Esta cotización ya está cerrada." } },
      { status: 400 },
    );
  }

  const validation = validateSelection(active.payload, hospital);
  if (!validation.valid || !validation.opcion) {
    return Response.json(
      { error: { code: "HOSPITAL_NO_ENCONTRADO", message: "Ese hospital no está entre las opciones de tu cotización." } },
      { status: 400 },
    );
  }

  const updated = await updateSelection(active.id, validation.opcion.hospital);
  await logTrace(session.sid, "quote_selected", {
    quoteId: updated.id,
    hospital: updated.seleccion,
    fueraDeRed: validation.opcion.marcas.includes("fuera_de_red"),
  });

  return Response.json({ quote: toQuoteResponse(updated) });
}
