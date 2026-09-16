/**
 * Persistence for the poliza's active quote (feature spec items 1-3: select
 * an option, ask about options across turns, close the quote). See
 * lib/db/schema.ts's `cotizaciones` table doc comment for the full
 * rationale. Never trusts anything the client sends beyond the hospital name
 * to select — every stored number comes from `cotizar_consulta`'s own
 * domain computation (lib/agent/tools.ts).
 */
import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { db } from "./client";
import { cotizaciones } from "./schema";
import type { CotizarConsultaSuccess } from "../domain/quote-types";

export interface QuoteRow {
  id: string;
  sesionId: string;
  poliza: string;
  especialidadId: string;
  payload: CotizarConsultaSuccess;
  seleccion: string | null;
  estado: "abierta" | "cerrada";
  creadoEn: Date;
  actualizadoEn: Date;
  cerradoEn: Date | null;
}

/**
 * Inserts a new quote row for `poliza` — becomes the poliza's active quote
 * (the most recent row by `creadoEn`; see `getActiveQuote`). Called by
 * `cotizar_consulta`'s `execute` (lib/agent/tools.ts) on every successful
 * quote, so a new symptom/specialty naturally supersedes the previous one.
 */
export async function saveQuote(args: {
  sesionId: string;
  poliza: string;
  especialidadId: string;
  payload: CotizarConsultaSuccess;
}): Promise<QuoteRow> {
  const id = randomUUID();
  const rows = await db
    .insert(cotizaciones)
    .values({ id, sesionId: args.sesionId, poliza: args.poliza, especialidadId: args.especialidadId, payload: args.payload })
    .returning();
  const row = rows[0];
  if (!row) throw new Error("saveQuote: insert returned no row");
  return toQuoteRow(row);
}

/** The session's active quote: its most recent row, open or closed, or `null` if it has never quoted anything. */
export async function getActiveQuote(sesionId: string): Promise<QuoteRow | null> {
  const rows = await db
    .select()
    .from(cotizaciones)
    .where(eq(cotizaciones.sesionId, sesionId))
    .orderBy(desc(cotizaciones.creadoEn))
    .limit(1);
  const row = rows[0];
  return row ? toQuoteRow(row) : null;
}

export async function getQuoteById(id: string): Promise<QuoteRow | null> {
  const rows = await db.select().from(cotizaciones).where(eq(cotizaciones.id, id)).limit(1);
  const row = rows[0];
  return row ? toQuoteRow(row) : null;
}

/** Updates the selected hospital on an existing (open) quote. Caller validates the hospital first (lib/domain/quote-selection.ts). */
export async function updateSelection(id: string, hospital: string): Promise<QuoteRow> {
  const rows = await db
    .update(cotizaciones)
    .set({ seleccion: hospital, actualizadoEn: new Date() })
    .where(eq(cotizaciones.id, id))
    .returning();
  const row = rows[0];
  if (!row) throw new Error(`updateSelection: no quote with id ${id}`);
  return toQuoteRow(row);
}

/** Marks a quote closed. Idempotent by design at the call site (app/api/quote/close/route.ts): if already closed, callers skip calling this again and just re-read the existing row. */
export async function closeQuoteRow(id: string): Promise<QuoteRow> {
  const now = new Date();
  const rows = await db
    .update(cotizaciones)
    .set({ estado: "cerrada", cerradoEn: now, actualizadoEn: now })
    .where(eq(cotizaciones.id, id))
    .returning();
  const row = rows[0];
  if (!row) throw new Error(`closeQuoteRow: no quote with id ${id}`);
  return toQuoteRow(row);
}

/**
 * Shape returned by GET /api/quote and POST /api/quote/select (app/api/quote/*)
 * — the stored payload's fields flattened alongside the row's id/seleccion/estado,
 * so it doubles as `CotizarConsultaOutput` for QuoteCard (components/QuoteCard.tsx)
 * plus the selection/close state the UI needs.
 */
export interface QuoteResponse {
  id: string;
  especialidad: string;
  plan: string;
  carencia: CotizarConsultaSuccess["carencia"];
  recomendado: string | null;
  opciones: CotizarConsultaSuccess["opciones"];
  seleccion: string | null;
  estado: "abierta" | "cerrada";
}

export function toQuoteResponse(row: QuoteRow): QuoteResponse {
  return {
    id: row.id,
    especialidad: row.payload.especialidad,
    plan: row.payload.plan,
    carencia: row.payload.carencia,
    recomendado: row.payload.recomendado,
    opciones: row.payload.opciones,
    seleccion: row.seleccion,
    estado: row.estado,
  };
}

function toQuoteRow(row: typeof cotizaciones.$inferSelect): QuoteRow {
  return {
    id: row.id,
    sesionId: row.sesionId,
    poliza: row.poliza,
    especialidadId: row.especialidadId,
    payload: row.payload,
    seleccion: row.seleccion,
    estado: row.estado,
    creadoEn: row.creadoEn,
    actualizadoEn: row.actualizadoEn,
    cerradoEn: row.cerradoEn,
  };
}
