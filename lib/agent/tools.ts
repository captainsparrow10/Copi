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

export interface CarenciaStatus {
  enCarencia: boolean;
  diasRestantes?: number;
}

export interface OpcionCotizacion {
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

/** Success shape of `cotizar_consulta` (PRD 7.5). Shared with the UI (components/QuoteCard.tsx) so the
 * quote card renders straight from this type — never by parsing the model's text (PRD Anexo C rule 4). */
export interface CotizarConsultaSuccess {
  plan: string;
  especialidad: string;
  carencia: CarenciaStatus;
  recomendado: string | null;
  opciones: OpcionCotizacion[];
}

/** Error shape of `cotizar_consulta` when the policy is inactive (PRD 7.4 rule 1). */
export interface CotizarConsultaError {
  error: "POLIZA_INACTIVA";
  mensaje: string;
}

/**
 * Error shape of `cotizar_consulta` when the model skips the mandatory
 * first step (PRD Anexo A rule 3a / Phase 5 evals bug: mark-fueradered-01
 * called `cotizar_consulta` directly, with no `buscar_especialidad` call
 * this turn). Returned instead of a quote so the model can self-correct
 * within the same turn (`stepCountIs(5)` in lib/agent/run.ts leaves room for
 * a retry) rather than silently producing a quote from a specialty the
 * patient never confirmed via the guide.
 */
export interface CotizarConsultaOrderError {
  error: "FALTA_BUSCAR_ESPECIALIDAD";
  mensaje: string;
}

/**
 * Error shape of `cotizar_consulta` when `buscar_especialidad` was called
 * this turn but returned SIN_COINCIDENCIAS (PRD 6.2 ambiguous-symptom flow
 * / Phase 5 evals: ambig-03, ambig-04 — the model asked the required
 * clarifying question but then invented a specialty on its own and quoted
 * it anyway, in the same turn). The patient hasn't confirmed a specialty
 * yet, so there is nothing valid to cotizar until they answer the
 * clarifying question in a follow-up turn.
 */
export interface CotizarConsultaAmbiguousError {
  error: "SIN_ESPECIALIDAD_CONFIRMADA";
  mensaje: string;
}

export type CotizarConsultaOutput =
  | CotizarConsultaSuccess
  | CotizarConsultaError
  | CotizarConsultaOrderError
  | CotizarConsultaAmbiguousError;

/** Narrows a `cotizar_consulta` tool output to its success shape. */
export function isCotizarConsultaSuccess(output: CotizarConsultaOutput): output is CotizarConsultaSuccess {
  return !("error" in output);
}

/** Builds the four agent tools, closed over `poliza` (PRD 7.5: no tool accepts a policy number). */
export async function buildTools(poliza: string) {
  const [especialidadEnum, ctx] = await Promise.all([buildEspecialidadEnum(), loadAseguradoContext(poliza)]);

  // Per-turn ordering state (PRD Anexo A rule 3: buscar_especialidad ->
  // cotizar_consulta, in that order). `buildTools` is called once per
  // `/api/chat` turn (lib/agent/run.ts), so this flag naturally resets
  // every turn — it must NOT be hoisted above `buildTools` or it would leak
  // across turns/policies.
  let buscarEspecialidadCalledThisTurn = false;
  // Tracks the LAST buscar_especialidad result this turn: if it came back
  // SIN_COINCIDENCIAS, the patient hasn't confirmed a real specialty yet
  // (PRD 6.2) — cotizar_consulta must refuse until a later turn resolves it.
  let lastBuscarEspecialidadHadMatches = false;

  const buscar_especialidad = tool({
    description:
      "Busca en la guía de especialidades médicas cuál especialidad conviene según el síntoma del paciente. " +
      "OBLIGATORIO: debe ser la PRIMERA herramienta que llames ante cualquier síntoma nuevo, incluso si el " +
      "paciente ya menciona el nombre de un especialista (por ejemplo 'quiero ver un cardiólogo') — " +
      "cotizar_consulta rechaza la cotización si no la llamaste antes en este mismo turno. " +
      "Si devuelve SIN_COINCIDENCIAS, no cotices: haz una pregunta breve para aclarar el síntoma.",
    inputSchema: z.object({
      sintoma: z.string().min(3).max(300).describe("Descripción del síntoma en palabras del paciente."),
    }),
    execute: async ({ sintoma }) => {
      buscarEspecialidadCalledThisTurn = true;
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

      lastBuscarEspecialidadHadMatches = resultados.length > 0;
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
      "Devuelve las opciones ordenadas de más barata a más cara. OBLIGATORIO: llama primero a " +
      "buscar_especialidad en este mismo turno y usa la especialidad que eligió esa herramienta — si no la " +
      "llamaste antes, o si devolvió SIN_COINCIDENCIAS, esta herramienta devuelve un error en vez de una cotización.",
    inputSchema: z.object({
      especialidad: especialidadEnum.describe("Id de la especialidad del catálogo (no el nombre libre)."),
      zona: z.string().optional().describe("Zona/ciudad preferida del paciente, si la mencionó."),
    }),
    execute: async ({ especialidad, zona }) => {
      try {
        if (!ctx.activa) {
          throw new PolizaInactivaError();
        }
        // PRD Anexo A rule 3 / Phase 5 evals bug 4b (mark-fueradered-01):
        // cotizar_consulta must never run ahead of buscar_especialidad in
        // the same turn, even when the patient already named a specialist
        // by ordinary language ("quiero ver un cardiólogo") — the guide
        // lookup is what confirms/citas the specialty, not the model's own
        // reading of the message. A structured error (rather than a thrown
        // exception) lets the model self-correct within the same
        // multi-step turn (stepCountIs(5) in lib/agent/run.ts).
        if (!buscarEspecialidadCalledThisTurn) {
          return {
            error: "FALTA_BUSCAR_ESPECIALIDAD" as const,
            mensaje: "Debes llamar primero a buscar_especialidad en este turno antes de cotizar.",
          };
        }
        // PRD 6.2 ambiguous-symptom flow / Phase 5 evals bug (ambig-03,
        // ambig-04): buscar_especialidad returning SIN_COINCIDENCIAS means
        // the patient hasn't confirmed a real specialty — the model must
        // ask ONE clarifying question and stop, not guess a specialty on
        // its own and quote it anyway in the same turn.
        if (!lastBuscarEspecialidadHadMatches) {
          return {
            error: "SIN_ESPECIALIDAD_CONFIRMADA" as const,
            mensaje: "buscar_especialidad no encontró coincidencias: haz una pregunta para aclarar el síntoma, no cotices.",
          };
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
      "Busca en el documento de la póliza del plan del paciente actual la respuesta a una duda de cobertura: " +
      "deducible, coaseguro, tope anual de bolsillo, período de carencia, red de hospitales u hospitales fuera " +
      "de red, exclusiones, qué cubre el plan, glosario de términos, etc. OBLIGATORIO: llama SIEMPRE a esta " +
      "herramienta ante cualquiera de esas preguntas — nunca respondas de memoria ni con conocimiento propio " +
      "sobre pólizas. Cita cada afirmación con el id del fragmento devuelto, por ejemplo [C-4.2]. Si devuelve " +
      "NO_ENCONTRADO, responde exactamente: \"No encontré esa información en tu póliza. Te recomiendo consultar " +
      "con tu aseguradora.\"",
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
