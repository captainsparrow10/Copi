/**
 * GET /api/profile — the session patient's plan profile for the right-hand
 * panel (lib/domain/profile.ts). Session required; error shape per PRD 7.6.
 * Everything is loaded server-side from the session's policy, never from the client.
 */
import { eq } from "drizzle-orm";
import { db } from "../../../lib/db/client";
import { asegurados, planes, planTierReglas } from "../../../lib/db/schema";
import { buildPatientProfile } from "../../../lib/domain/profile";
import { getSession } from "../../../lib/session";

export async function GET(): Promise<Response> {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: { code: "NO_SESSION", message: "No hay una sesión activa." } }, { status: 401 });
  }

  const rows = await db
    .select({
      poliza: asegurados.poliza,
      nombre: asegurados.nombre,
      activa: asegurados.activa,
      fechaInicio: asegurados.fechaInicio,
      deducibleUsado: asegurados.deducibleUsado,
      gastoAcumulado: asegurados.gastoAcumulado,
      planId: planes.id,
      planNombre: planes.nombre,
      deducibleAnual: planes.deducibleAnual,
      topeAnualBolsillo: planes.topeAnualBolsillo,
      carenciaEspecialidadDias: planes.carenciaEspecialidadDias,
    })
    .from(asegurados)
    .innerJoin(planes, eq(asegurados.planId, planes.id))
    .where(eq(asegurados.poliza, session.poliza))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return Response.json({ error: { code: "NO_SESSION", message: "La póliza de la sesión ya no es válida." } }, { status: 401 });
  }

  const tiers = await db
    .select({ tier: planTierReglas.tier, coaseguro: planTierReglas.coaseguro, copagoFijo: planTierReglas.copagoFijo })
    .from(planTierReglas)
    .where(eq(planTierReglas.planId, row.planId));

  const profile = buildPatientProfile({
    poliza: row.poliza,
    nombre: row.nombre,
    activa: row.activa,
    fechaInicio: new Date(row.fechaInicio),
    deducibleUsado: Number(row.deducibleUsado),
    gastoAcumulado: Number(row.gastoAcumulado),
    plan: {
      id: row.planId,
      nombre: row.planNombre,
      deducibleAnual: Number(row.deducibleAnual),
      topeAnualBolsillo: Number(row.topeAnualBolsillo),
      carenciaEspecialidadDias: row.carenciaEspecialidadDias,
    },
    tiers: tiers.map((t) => ({ tier: t.tier, coaseguro: Number(t.coaseguro), copagoFijo: Number(t.copagoFijo) })),
    today: new Date(),
  });

  return Response.json({ profile });
}
