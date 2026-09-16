/**
 * POST /api/session — validates a demo policy number and issues the
 * `copi_session` cookie (PRD 7.6). DELETE /api/session — clears it.
 */
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "../../../lib/db/client";
import { asegurados, planes } from "../../../lib/db/schema";
import { clearSessionCookie, createSessionToken, setSessionCookie } from "../../../lib/session";

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
