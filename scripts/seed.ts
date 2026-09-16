/**
 * Idempotent seed script for phase 1 (PRD 7.3 "Datos semilla").
 *
 * Uses upsert (`onConflictDoUpdate`) keyed by each table's primary key, so
 * running this script any number of times converges to the same rows
 * instead of duplicating or erroring out.
 *
 * RAG tables (`documentos`, `fragmentos`) are seeded in phase 2 by
 * `scripts/ingest.ts`, not here.
 */
import { db } from "../lib/db/client";
import {
  asegurados,
  especialidades,
  hospitales,
  planTierReglas,
  planes,
  tarifario,
} from "../lib/db/schema";
import { conflictUpdateSet, stripMeta } from "../lib/db/upsert";
import especialidadesSeed from "../data/seeds/especialidades.json" with { type: "json" };
import hospitalesSeed from "../data/seeds/hospitales.json" with { type: "json" };
import planTierReglasSeed from "../data/seeds/plan_tier_reglas.json" with { type: "json" };
import planesSeed from "../data/seeds/planes.json" with { type: "json" };
import tarifarioSeed from "../data/seeds/tarifario.json" with { type: "json" };
import aseguradosSeedRaw from "../data/seeds/asegurados.json" with { type: "json" };

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Returns `YYYY-MM-DD` for `dias` days before today (UTC), for date columns. */
function fechaHaceDias(dias: number): string {
  const fecha = new Date(Date.now() - dias * MS_PER_DAY);
  return fecha.toISOString().slice(0, 10);
}

/**
 * POL-1004 must always be "in carencia" for its plan (basico, 30 dias): its
 * `fechaInicio` is computed at seed time as today minus 10 days instead of a
 * hardcoded date in the JSON fixture, so the demo case stays valid however
 * much time passes between seed runs.
 */
const POL_1004_DIAS_DESDE_INICIO = 10;

const aseguradosSeed = (aseguradosSeedRaw as Record<string, unknown>[]).map(stripMeta).map((row) =>
  row.poliza === "POL-1004"
    ? { ...row, fechaInicio: fechaHaceDias(POL_1004_DIAS_DESDE_INICIO) }
    : row,
);

async function seed() {
  console.log("Seeding planes...");
  await db
    .insert(planes)
    .values(planesSeed)
    .onConflictDoUpdate({ target: planes.id, set: conflictUpdateSet(planes, [planes.id]) });

  console.log("Seeding especialidades...");
  await db
    .insert(especialidades)
    .values(especialidadesSeed)
    .onConflictDoUpdate({
      target: especialidades.id,
      set: conflictUpdateSet(especialidades, [especialidades.id]),
    });

  console.log("Seeding hospitales...");
  await db
    .insert(hospitales)
    .values(hospitalesSeed)
    .onConflictDoUpdate({
      target: hospitales.id,
      set: conflictUpdateSet(hospitales, [hospitales.id]),
    });

  console.log("Seeding plan_tier_reglas...");
  await db
    .insert(planTierReglas)
    .values(planTierReglasSeed)
    .onConflictDoUpdate({
      target: [planTierReglas.planId, planTierReglas.tier],
      set: conflictUpdateSet(planTierReglas, [planTierReglas.planId, planTierReglas.tier]),
    });

  console.log("Seeding asegurados...");
  await db
    .insert(asegurados)
    .values(aseguradosSeed as (typeof asegurados.$inferInsert)[])
    .onConflictDoUpdate({
      target: asegurados.poliza,
      set: conflictUpdateSet(asegurados, [asegurados.poliza]),
    });

  console.log("Seeding tarifario...");
  await db
    .insert(tarifario)
    .values(tarifarioSeed)
    .onConflictDoUpdate({
      target: [tarifario.hospitalId, tarifario.especialidadId, tarifario.servicio],
      set: conflictUpdateSet(tarifario, [
        tarifario.hospitalId,
        tarifario.especialidadId,
        tarifario.servicio,
      ]),
    });

  console.log("Seed complete.");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
