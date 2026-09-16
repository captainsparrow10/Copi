import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  char,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  vector,
} from "drizzle-orm/pg-core";
import type { CotizarConsultaSuccess } from "../domain/quote-types";

/**
 * Insurance plans. PRD 7.3 `planes`.
 */
export const planes = pgTable("planes", {
  id: text("id").primaryKey(), // e.g. 'basico'
  nombre: text("nombre").notNull(),
  deducibleAnual: numeric("deducible_anual", { precision: 10, scale: 2 }).notNull(),
  topeAnualBolsillo: numeric("tope_anual_bolsillo", { precision: 10, scale: 2 }).notNull(),
  carenciaEspecialidadDias: integer("carencia_especialidad_dias").notNull().default(0),
});

/**
 * Coinsurance + fixed copay rules per plan and hospital tier. PRD 7.3 `plan_tier_reglas`.
 */
export const planTierReglas = pgTable(
  "plan_tier_reglas",
  {
    planId: text("plan_id").references(() => planes.id),
    tier: char("tier", { length: 1 }).notNull(),
    coaseguro: numeric("coaseguro", { precision: 4, scale: 3 }).notNull(), // 0.200 = 20%
    copagoFijo: numeric("copago_fijo", { precision: 10, scale: 2 }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.planId, table.tier] }),
    check("plan_tier_reglas_tier_check", sql`${table.tier} IN ('A', 'B', 'C')`),
  ],
);

/**
 * Demo insured people. PRD 7.3 `asegurados`.
 */
export const asegurados = pgTable("asegurados", {
  poliza: text("poliza").primaryKey(), // e.g. 'POL-1002'
  nombre: text("nombre").notNull(),
  planId: text("plan_id").references(() => planes.id),
  fechaInicio: date("fecha_inicio").notNull(),
  deducibleUsado: numeric("deducible_usado", { precision: 10, scale: 2 }).notNull().default("0"),
  gastoAcumulado: numeric("gasto_acumulado", { precision: 10, scale: 2 }).notNull().default("0"),
  activa: boolean("activa").notNull().default(true),
});

/**
 * In-network hospitals. PRD 7.3 `hospitales`.
 */
export const hospitales = pgTable(
  "hospitales",
  {
    id: text("id").primaryKey(),
    nombre: text("nombre").notNull(), // fictitious names only
    tier: char("tier", { length: 1 }).notNull(),
    zona: text("zona").notNull(),
    enRed: boolean("en_red").notNull().default(true),
  },
  (table) => [
    check("hospitales_tier_check", sql`${table.tier} IN ('A', 'B', 'C')`),
  ],
);

/**
 * Medical specialties catalog. PRD 7.3 `especialidades`.
 */
export const especialidades = pgTable("especialidades", {
  id: text("id").primaryKey(), // e.g. 'traumatologia'
  nombre: text("nombre").notNull(),
});

/**
 * Consultation price list per hospital + specialty. PRD 7.3 `tarifario`.
 */
export const tarifario = pgTable(
  "tarifario",
  {
    hospitalId: text("hospital_id").references(() => hospitales.id),
    especialidadId: text("especialidad_id").references(() => especialidades.id),
    servicio: text("servicio").notNull().default("consulta"),
    precio: numeric("precio", { precision: 10, scale: 2 }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.hospitalId, table.especialidadId, table.servicio] }),
  ],
);

/**
 * RAG source documents (specialty guide and policy documents). PRD 7.3 `documentos`.
 */
export const documentos = pgTable(
  "documentos",
  {
    id: text("id").primaryKey(), // e.g. 'guia-especialidades', 'poliza-basico'
    tipo: text("tipo").notNull(), // 'guia' | 'poliza'
    planId: text("plan_id").references(() => planes.id), // NULL for the guide
    titulo: text("titulo").notNull(),
  },
  (table) => [
    check("documentos_tipo_check", sql`${table.tipo} IN ('guia', 'poliza')`),
  ],
);

/**
 * RAG chunks with embeddings. PRD 7.3 `fragmentos`.
 * vector(768) + HNSW cosine index, as required by section 7.3.
 */
export const fragmentos = pgTable(
  "fragmentos",
  {
    id: text("id").primaryKey(), // e.g. 'G-12', 'C-4.2'
    documentoId: text("documento_id").references(() => documentos.id),
    especialidadId: text("especialidad_id").references(() => especialidades.id), // only in the guide
    contenido: text("contenido").notNull(),
    embedding: vector("embedding", { dimensions: 768 }).notNull(),
    embeddingModel: text("embedding_model").notNull(),
  },
  (table) => [
    index("fragmentos_embedding_hnsw_idx")
      .using("hnsw", table.embedding.op("vector_cosine_ops")),
  ],
);

/**
 * Persisted quotes ("select an option" / "close the quote" feature, on top
 * of PRD 7.3). Not in the original PRD schema — added so:
 *  1. the patient's hospital selection survives across chat turns and page
 *     reloads (server-side, never trusted from the client — see
 *     POST /api/quote/select),
 *  2. a follow-up question ("qué diferencia hay con el recomendado") can be
 *     grounded against the SAME numbers the original quote used, even
 *     though `cotizar_consulta` isn't called again that turn (see
 *     lib/domain/quote-grounding.ts + lib/agent/run.ts), fixing the
 *     cross-turn `validation_block` bug,
 *  3. "close the quote" has a server-computed summary to recompute from
 *     (lib/domain/quote-summary.ts), never from the model's text.
 *
 * One row per successful `cotizar_consulta` call (lib/agent/tools.ts) — the
 * "active" quote for a poliza is simply its most recent row
 * (lib/db/quotes.ts's `getActiveQuote`). `payload` is the exact
 * `CotizarConsultaSuccess` the tool returned, so it's reusable both for
 * grounding and for the closing summary without recomputing anything.
 */
export const cotizaciones = pgTable(
  "cotizaciones",
  {
    id: text("id").primaryKey(), // uuid, generated in application code (lib/db/quotes.ts)
    // Browser session (JWT `sid`). Quotes are scoped to it, never to the policy:
    // demo policies are shared by every evaluator.
    sesionId: text("sesion_id").notNull(),
    poliza: text("poliza")
      .notNull()
      .references(() => asegurados.poliza),
    especialidadId: text("especialidad_id")
      .notNull()
      .references(() => especialidades.id),
    payload: jsonb("payload").notNull().$type<CotizarConsultaSuccess>(),
    seleccion: text("seleccion"), // chosen hospital name, or NULL until POST /api/quote/select
    estado: text("estado").notNull().default("abierta").$type<"abierta" | "cerrada">(),
    creadoEn: timestamp("creado_en", { withTimezone: true }).defaultNow().notNull(),
    actualizadoEn: timestamp("actualizado_en", { withTimezone: true }).defaultNow().notNull(),
    cerradoEn: timestamp("cerrado_en", { withTimezone: true }),
  },
  (table) => [
    check("cotizaciones_estado_check", sql`${table.estado} IN ('abierta', 'cerrada')`),
  ],
);

/**
 * Interaction traces (no personal data). PRD 7.3 `trazas`.
 */
export const trazas = pgTable("trazas", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  sesionId: text("sesion_id").notNull(),
  evento: text("evento").notNull(), // tool_call | emergency_bypass | validation_block | error | quote_selected | quote_closed
  detalle: jsonb("detalle").notNull(),
  creadoEn: timestamp("creado_en", { withTimezone: true }).defaultNow(),
});
