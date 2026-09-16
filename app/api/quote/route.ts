/**
 * GET /api/quote — the session's active quote + current selection (feature
 * spec: "Select an option" / page-reload support). Session required (PRD 7.6
 * error shape `{ error: { code, message } }`). Returns `{ quote: null }`
 * (200, not an error) when the poliza hasn't quoted anything yet this
 * session lifetime — that's a normal state, not a failure.
 */
import { getSession } from "../../../lib/session";
import { getActiveQuote, toQuoteResponse } from "../../../lib/db/quotes";

export async function GET(): Promise<Response> {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: { code: "NO_SESSION", message: "No hay una sesión activa." } }, { status: 401 });
  }

  const active = await getActiveQuote(session.sid);
  if (!active) {
    return Response.json({ quote: null });
  }

  return Response.json({ quote: toQuoteResponse(active) });
}
