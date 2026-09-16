/**
 * Closing summary builder ("Cerrar cotización", feature spec item 3). Pure —
 * takes already-trusted domain values (the persisted quote's chosen option,
 * the asegurado/plan row, the customer-service config) and shapes them into
 * the summary POST /api/quote/close returns. Never derives anything from
 * model text: every number here traces back to `cotizar_consulta`'s own
 * domain computation (lib/domain/copay.ts via lib/agent/tools.ts), stored
 * verbatim in `cotizaciones.payload` (lib/db/schema.ts).
 */
import { computeEffectiveBreakdown } from "./effective-breakdown";
import type { OpcionCotizacion } from "./quote-types";
import type { CustomerServiceContact } from "../config/customer-service";

export interface ClosingSummary {
  referencia: string;
  quoteId: string;
  estado: "abierta" | "cerrada";
  paciente: { nombre: string; plan: string };
  especialidad: string;
  hospital: string;
  zona: string;
  tier: string;
  precio: number;
  aDeducible: number;
  coaseguro: number;
  copagoFijo: number;
  totalPaciente: number;
  totalAseguradora: number;
  marcas: string[];
  fecha: string; // ISO 8601
  contacto: CustomerServiceContact;
}

export interface BuildClosingSummaryInput {
  quoteId: string;
  nombre: string;
  plan: string;
  especialidad: string;
  opcion: OpcionCotizacion;
  fecha: Date;
  contacto: CustomerServiceContact;
  estado: "abierta" | "cerrada";
}

/** Short, stable reference derived from the quote's uuid (`COT-` + first 8 hex chars, uppercased). */
function buildReferencia(quoteId: string): string {
  return `COT-${quoteId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

export function buildClosingSummary(input: BuildClosingSummaryInput): ClosingSummary {
  const { quoteId, nombre, plan, especialidad, opcion, fecha, contacto, estado } = input;
  return {
    referencia: buildReferencia(quoteId),
    quoteId,
    estado,
    paciente: { nombre, plan },
    especialidad,
    hospital: opcion.hospital,
    zona: opcion.zona,
    tier: opcion.tier,
    precio: opcion.precio,
    // Components actually charged (capped to total_paciente), same as the quote card shows.
    ...computeEffectiveBreakdown(opcion),
    totalPaciente: opcion.total_paciente,
    totalAseguradora: opcion.total_aseguradora,
    marcas: opcion.marcas,
    fecha: fecha.toISOString(),
    contacto,
  };
}
