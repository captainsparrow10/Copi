/**
 * POST /api/session — validates a demo policy number and issues the
 * `copi_session` cookie (PRD 7.6). DELETE /api/session — clears it.
 * GET /api/session — Phase 4 addition (not in PRD 7.6's table): lets
 * app/chat/page.tsx check for an existing session on mount so it can redirect
 * to `/` instead of guessing from a failed chat call. Returns only the
 * insured's display name/plan, never the policy number itself, matching the
 * PRD 7.10 rule to keep the policy out of anything client-observable.
 */
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "../../../lib/db/client";
import { asegurados, planes } from "../../../lib/db/schema";
import { clearSessionCookie, createSessionToken, getSession, setSessionCookie } from "../../../lib/session";

export async function GET(): Promise<Response> {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: { code: "NO_SESSION", message: "No hay una sesión activa." } }, { status: 401 });
  }

  const rows = await db
    .select({ nombre: asegurados.nombre, plan: planes.nombre })
    .from(asegurados)
    .innerJoin(planes, eq(asegurados.planId, planes.id))
    .where(eq(asegurados.poliza, session.poliza))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return Response.json({ error: { code: "NO_SESSION", message: "La póliza de la sesión ya no es válida." } }, { status: 401 });
  }

  return Response.json({ ok: true, nombre: row.nombre, plan: row.plan });
}

interface SessionRequestBody {
  poliza?: unknown;
}

export async function POST(request: NextRequest): Promise<Response> {
  let body: SessionRequestBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: { code: "INVALID_INPUT", message: "Cuerpo de la solicitud inválido." } }, { status: 400 });
  }

  const poliza = body.poliza;
  if (typeof poliza !== "string" || poliza.trim().length === 0) {
    return Response.json({ error: { code: "INVALID_INPUT", message: "Falta el número de póliza." } }, { status: 400 });
  }

  const rows = await db
    .select({ nombre: asegurados.nombre, plan: planes.nombre })
    .from(asegurados)
    .innerJoin(planes, eq(asegurados.planId, planes.id))
    .where(eq(asegurados.poliza, poliza))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return Response.json({ error: { code: "INVALID_INPUT", message: "Póliza no encontrada." } }, { status: 400 });
  }

  const token = await createSessionToken(poliza);
  await setSessionCookie(token);

  return Response.json({ ok: true, nombre: row.nombre, plan: row.plan });
}

export async function DELETE(): Promise<Response> {
  await clearSessionCookie();
  return Response.json({ ok: true });
}
