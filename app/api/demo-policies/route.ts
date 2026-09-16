/**
 * GET /api/demo-policies (PRD 7.6) — no session required. Lists the demo
 * policies for the picker on `app/page.tsx` (Phase 4): policy number,
 * fictitious insured name, and plan name.
 */
import { eq } from "drizzle-orm";
import { db } from "../../../lib/db/client";
import { asegurados, planes } from "../../../lib/db/schema";

export async function GET(): Promise<Response> {
  const rows = await db
    .select({ poliza: asegurados.poliza, nombre: asegurados.nombre, plan: planes.nombre })
    .from(asegurados)
    .innerJoin(planes, eq(asegurados.planId, planes.id))
    .orderBy(asegurados.poliza);

  return Response.json({ polizas: rows });
}
