/**
 * Shared shapes for a `cotizar_consulta` quote (PRD 7.5), split out of
 * lib/agent/tools.ts so lib/db/quotes.ts (server-side persistence for the
 * "select option" / "close quote" features) and lib/db/schema.ts (the
 * `cotizaciones.payload` jsonb column) can both import them without a
 * circular dependency (lib/agent/tools.ts -> lib/db/quotes.ts -> lib/agent/tools.ts).
 *
 * lib/agent/tools.ts re-exports these under their original names so existing
 * call sites (components/QuoteCard.tsx, lib/chat/ui-message.ts, tests) don't
 * need to change their import path.
 */

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

/** Success shape of `cotizar_consulta` — the shape persisted verbatim as `cotizaciones.payload`. */
export interface CotizarConsultaSuccess {
  plan: string;
  especialidad: string;
  carencia: CarenciaStatus;
  recomendado: string | null;
  opciones: OpcionCotizacion[];
}
