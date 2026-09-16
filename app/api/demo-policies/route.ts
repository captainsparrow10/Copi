/**
 * GET /api/demo-policies (PRD 7.6) — no session required. Lists the demo
 * policies for the patient list: policy number, fictitious insured name, plan
 * name, and a one-line highlight of their situation (lib/domain/profile.ts).
 */
import { eq } from "drizzle-orm";
import { db } from "../../../lib/db/client";
import { asegurados, planes } from "../../../lib/db/schema";
import { patientHighlight } from "../../../lib/domain/profile";

export async function GET(): Promise<Response> {
  const rows = await db
    .select({
      poliza: asegurados.poliza,
      nombre: asegurados.nombre,
      activa: asegurados.activa,
      fechaInicio: asegurados.fechaInicio,
      deducibleUsado: asegurados.deducibleUsado,
      gastoAcumulado: asegurados.gastoAcumulado,
      planId: planes.id,
      plan: planes.nombre,
      deducibleAnual: planes.deducibleAnual,
      topeAnualBolsillo: planes.topeAnualBolsillo,
      carenciaEspecialidadDias: planes.carenciaEspecialidadDias,
    })
    .from(asegurados)
    .innerJoin(planes, eq(asegurados.planId, planes.id))
    .orderBy(asegurados.poliza);

  const today = new Date();
  const polizas = rows.map((row) => ({
    poliza: row.poliza,
    nombre: row.nombre,
    plan: row.plan,
    destacado: patientHighlight({
      poliza: row.poliza,
      nombre: row.nombre,
      activa: row.activa,
      fechaInicio: new Date(row.fechaInicio),
      deducibleUsado: Number(row.deducibleUsado),
      gastoAcumulado: Number(row.gastoAcumulado),
      plan: {
        id: row.planId,
        nombre: row.plan,
        deducibleAnual: Number(row.deducibleAnual),
        topeAnualBolsillo: Number(row.topeAnualBolsillo),
        carenciaEspecialidadDias: row.carenciaEspecialidadDias,
      },
      today,
    }),
  }));

  return Response.json({ polizas });
}
