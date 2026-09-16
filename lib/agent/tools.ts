/**
 * Agent tools (PRD 7.5). All four are read-only and closed over the
 * session's `poliza` — NONE of them accepts a policy number as a Zod
 * input, matching PRD 7.8 layer 3 ("datos de sesion fuera del LLM").
 *
 * `buildTools(poliza)` is called once per `/api/chat` turn (lib/agent/run.ts),
 * after the session cookie has been resolved. It fetches the asegurado+plan
 * row and the especialidad enum once up front (cheap, not cached across
 * turns — fine for a hackathon demo) and closes every tool's `execute` over
 * that data plus `poliza`, so the model can never redirect a query at
 * another policy.
 */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { tool } from "ai";
import { db } from "../db/client";
import { asegurados, especialidades, hospitales, planes, planTierReglas, tarifario } from "../db/schema";
import { buscarEnGuiaEspecialidades, buscarEnPoliza } from "../rag/search";
import { calcularCopago, PolizaInactivaError, type PlanRules } from "../domain/copay";
import { pickRecommended } from "../domain/recommend";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function roundTo2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Builds the dynamic Zod enum of specialty ids from the `especialidades` table (PRD 7.5, 7.8 layer 2). */
async function buildEspecialidadEnum() {
  const rows = await db.select({ id: especialidades.id }).from(especialidades);
  const ids = rows.map((row) => row.id);
  if (ids.length === 0) {
    throw new Error("No especialidades found in DB — run npm run db:seed.");
  }
  return z.enum(ids as [string, ...string[]]);
}

interface AseguradoContext {
  planId: string;
  planNombre: string;
  activa: boolean;
  fechaInicio: Date;
  deducibleUsado: number;
  gastoAcumulado: number;
  plan: PlanRules;
}

/** Fetches the asegurado + plan row for `poliza` once per turn. */
async function loadAseguradoContext(poliza: string): Promise<AseguradoContext> {
  const rows = await db
    .select({
      planId: asegurados.planId,
      activa: asegurados.activa,
      fechaInicio: asegurados.fechaInicio,
      deducibleUsado: asegurados.deducibleUsado,
      gastoAcumulado: asegurados.gastoAcumulado,
      planNombre: planes.nombre,
      deducibleAnual: planes.deducibleAnual,
      topeAnualBolsillo: planes.topeAnualBolsillo,
      carenciaEspecialidadDias: planes.carenciaEspecialidadDias,
    })
    .from(asegurados)
    .innerJoin(planes, eq(asegurados.planId, planes.id))
    .where(eq(asegurados.poliza, poliza))
    .limit(1);

  const row = rows[0];
  if (!row || !row.planId) {
    throw new Error(`No asegurado/plan found for poliza ${poliza}`);
  }

  return {
    planId: row.planId,
    planNombre: row.planNombre,
    activa: row.activa,
    fechaInicio: new Date(row.fechaInicio),
    deducibleUsado: Number(row.deducibleUsado),
    gastoAcumulado: Number(row.gastoAcumulado),
    plan: {
      deducibleAnual: Number(row.deducibleAnual),
      topeAnualBolsillo: Number(row.topeAnualBolsillo),
      carenciaEspecialidadDias: row.carenciaEspecialidadDias,
    },
  };
}

interface CarenciaStatus {
  enCarencia: boolean;
  diasRestantes?: number;
}

interface OpcionCotizacion {
  hospital: string;
  tier: string;
  zona: string;
  precio: number;
  a_deducible: number;
  coaseguro: number;
  copago_fijo: number;
  total_paciente: number;
  total_aseguradora: number;
  marcas: string[];
}

/** Builds the four agent tools, closed over `poliza` (PRD 7.5: no tool accepts a policy number). */
export async function buildTools(poliza: string) {
  const [especialidadEnum, ctx] = await Promise.all([buildEspecialidadEnum(), loadAseguradoContext(poliza)]);

  const buscar_especialidad = tool({
    description:
      "Busca en la guía de especialidades médicas cuál especialidad conviene según el síntoma del paciente. " +
      "Debe llamarse SIEMPRE como primer paso ante cualquier síntoma nuevo, antes de cotizar. " +
      "Si devuelve SIN_COINCIDENCIAS, no cotices: haz una pregunta breve para aclarar el síntoma.",
    inputSchema: z.object({
      sintoma: z.string().min(3).max(300).describe("Descripción del síntoma en palabras del paciente."),
    }),
    execute: async ({ sintoma }) => {
      const matches = await buscarEnGuiaEspecialidades(sintoma);

      // Dedup by especialidadId, keeping the highest score. `matches` is
      // already ordered by score desc (lib/rag/search.ts), so the first
      // time an especialidadId is seen is its best-scoring fragment.
      const seen = new Set<string>();
      const resultados: { especialidad: string; razon: string; fragmento_id: string; score: number }[] = [];
      for (const match of matches) {
        if (seen.has(match.especialidadId)) continue;
        seen.add(match.especialidadId);
        resultados.push({
          especialidad: match.especialidadId,
          razon: match.contenido,
          fragmento_id: match.id,
          score: match.score,
        });
      }

      if (resultados.length === 0) {
        return { resultados: [], motivo: "SIN_COINCIDENCIAS" as const };
      }
      return { resultados };
    },
  });

  const cotizar_consulta = tool({
    description:
      "Cotiza el copago de una consulta para una especialidad, en todos los hospitales que la ofrecen. " +
      "Usa el plan y la póliza del paciente actual (ya identificados por el sistema); nunca pidas un número de póliza. " +
      "Devuelve las opciones ordenadas de más barata a más cara. Llama a esta herramienta solo después de " +
      "buscar_especialidad, con la especialidad elegida.",
    inputSchema: z.object({
      especialidad: especialidadEnum.describe("Id de la especialidad del catálogo (no el nombre libre)."),
      zona: z.string().optional().describe("Zona/ciudad preferida del paciente, si la mencionó."),
    }),
    execute: async ({ especialidad, zona }) => {
      try {
        if (!ctx.activa) {
          throw new PolizaInactivaError();
        }

        const tierRows = await db
          .select({ tier: planTierReglas.tier, coaseguro: planTierReglas.coaseguro, copagoFijo: planTierReglas.copagoFijo })
          .from(planTierReglas)
          .where(eq(planTierReglas.planId, ctx.planId));
        const tierRules = new Map(
          tierRows.map((row) => [row.tier, { coaseguro: Number(row.coaseguro), copagoFijo: Number(row.copagoFijo) }]),
        );

        let hospitalRows = await db
          .select({
            nombre: hospitales.nombre,
            tier: hospitales.tier,
            zona: hospitales.zona,
            enRed: hospitales.enRed,
            precio: tarifario.precio,
          })
          .from(tarifario)
          .innerJoin(hospitales, eq(tarifario.hospitalId, hospitales.id))
          .where(and(eq(tarifario.especialidadId, especialidad), eq(tarifario.servicio, "consulta")));

        if (zona) {
          hospitalRows = hospitalRows.filter((row) => row.zona === zona);
        }

        const fechaConsulta = new Date();
        let carencia: CarenciaStatus = { enCarencia: false };

        const opciones: OpcionCotizacion[] = hospitalRows.map((row) => {
          const tier = tierRules.get(row.tier);
          if (!tier) {
            throw new Error(`No plan_tier_reglas for plan=${ctx.planId} tier=${row.tier}`);
          }
          const precio = Number(row.precio);
          const result = calcularCopago({
            precio,
            plan: ctx.plan,
            tier,
            asegurado: {
              activa: ctx.activa,
              fechaInicio: ctx.fechaInicio,
              deducibleUsado: ctx.deducibleUsado,
              gastoAcumulado: ctx.gastoAcumulado,
            },
            especialidadId: especialidad,
            enRed: row.enRed,
            fechaConsulta,
          });

          if (result.marcas.includes("carencia")) {
            carencia = { enCarencia: true, diasRestantes: result.diasRestantesCarencia };
          }

          return {
            hospital: row.nombre,
            tier: row.tier,
            zona: row.zona,
            precio,
            a_deducible: result.aDeducible,
            coaseguro: result.coaseguro,
            copago_fijo: result.copagoFijo,
            total_paciente: result.totalPaciente,
            total_aseguradora: result.totalAseguradora,
            marcas: result.marcas,
          };
        });

        opciones.sort((a, b) => {
          if (a.total_paciente !== b.total_paciente) return a.total_paciente - b.total_paciente;
          if (a.tier !== b.tier) return a.tier < b.tier ? -1 : 1;
          return a.hospital.localeCompare(b.hospital);
        });

        return {
          plan: ctx.planNombre,
          especialidad,
          carencia,
          recomendado: pickRecommended(opciones),
          opciones,
        };
      } catch (err) {
        if (err instanceof PolizaInactivaError) {
          return { error: "POLIZA_INACTIVA" as const, mensaje: err.message };
        }
        throw err;
      }
    },
  });

  const obtener_resumen_plan = tool({
    description:
      "Devuelve el resumen del plan del paciente actual: deducible restante, tope de bolsillo restante y si está " +
      "en período de carencia para especialistas. No recibe argumentos.",
    inputSchema: z.object({}),
    execute: async () => {
      const deducibleRestante = roundTo2(Math.max(ctx.plan.deducibleAnual - ctx.deducibleUsado, 0));
      const topeRestante = roundTo2(Math.max(ctx.plan.topeAnualBolsillo - ctx.gastoAcumulado, 0));

      const dias = Math.floor((Date.now() - ctx.fechaInicio.getTime()) / MS_PER_DAY);
      const enCarencia = dias < ctx.plan.carenciaEspecialidadDias;
      const carencia: CarenciaStatus = enCarencia
        ? { enCarencia: true, diasRestantes: ctx.plan.carenciaEspecialidadDias - dias }
        : { enCarencia: false };

      return {
        plan: ctx.planNombre,
        deducible_restante: deducibleRestante,
        tope_restante: topeRestante,
        carencia,
      };
    },
  });

  const buscar_en_poliza = tool({
    description:
      "Busca en el documento de la póliza del plan del paciente actual la respuesta a una duda de cobertura. " +
      "Cita cada afirmación con el id del fragmento devuelto, por ejemplo [C-4.2]. Si devuelve NO_ENCONTRADO, " +
      "responde exactamente: \"No encontré esa información en tu póliza. Te recomiendo consultar con tu aseguradora.\"",
    inputSchema: z.object({
      pregunta: z.string().min(3).max(300).describe("Pregunta de cobertura del paciente."),
    }),
    execute: async ({ pregunta }) => {
      const fragmentos = await buscarEnPoliza(pregunta, ctx.planId);
      if (fragmentos.length === 0) {
        return { motivo: "NO_ENCONTRADO" as const };
      }
      return { fragmentos };
    },
  });

  return { buscar_especialidad, cotizar_consulta, obtener_resumen_plan, buscar_en_poliza };
}
