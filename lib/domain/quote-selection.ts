/**
 * Selection validation for "Select an option" (feature spec, item 1). Pure —
 * no DB, no session — so POST /api/quote/select (app/api/quote/select/route.ts)
 * can validate the hospital exists in the poliza's active quote before
 * writing anything, and this rule is independently unit-testable.
 */
import type { CotizarConsultaSuccess, OpcionCotizacion } from "./quote-types";

export interface SelectionValidation {
  valid: boolean;
  opcion?: OpcionCotizacion;
  error?: "HOSPITAL_NO_ENCONTRADO";
}

/** Finds `hospital` among `payload.opciones` (exact match — the same string the quote itself returned). */
export function validateSelection(payload: CotizarConsultaSuccess, hospital: string): SelectionValidation {
  const opcion = payload.opciones.find((o) => o.hospital === hospital);
  if (!opcion) {
    return { valid: false, error: "HOSPITAL_NO_ENCONTRADO" };
  }
  return { valid: true, opcion };
}
