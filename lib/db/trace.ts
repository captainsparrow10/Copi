/**
 * Traza logger (PRD 7.3 `trazas` / 7.10 "sin datos personales"). Factored
 * out of lib/agent/run.ts so the new /api/quote/select and /api/quote/close
 * routes (which log `quote_selected` / `quote_closed`, per this feature's
 * spec) can reuse the exact same "never break the caller" behavior instead
 * of duplicating it.
 */
import { db } from "./client";
import { trazas } from "./schema";

export type TrazaEvento =
  | "tool_call"
  | "emergency_bypass"
  | "validation_block"
  | "error"
  | "quote_selected"
  | "quote_closed";

/** Inserts one traza row. Tracing must never break the caller's request — any DB error is logged and swallowed. */
export async function logTrace(sesionId: string, evento: TrazaEvento, detalle: Record<string, unknown>): Promise<void> {
  try {
    await db.insert(trazas).values({ sesionId, evento, detalle });
  } catch (err) {
    console.error("Failed to write traza:", err);
  }
}
