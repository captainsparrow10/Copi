/**
 * Pure copay calculation domain logic. PRD 7.4 "Reglas de negocio del calculo".
 *
 * No DB access, no LLM calls — a deterministic function of its inputs so the
 * agent (and the tests) can trust every dollar amount it produces.
 */

/** Specialties never subject to the waiting period (`carencia`). PRD 7.4 rule 3. */
export const MEDICINA_GENERAL_ID = "medicina_general";

export type CopayMark = "fuera_de_red" | "carencia";

export interface PlanRules {
  deducibleAnual: number;
  topeAnualBolsillo: number;
  carenciaEspecialidadDias: number;
}

export interface TierRules {
  /** Coinsurance rate, e.g. 0.20 = 20%. */
  coaseguro: number;
  copagoFijo: number;
}

export interface AseguradoState {
  activa: boolean;
  fechaInicio: Date;
  deducibleUsado: number;
  gastoAcumulado: number;
}

export interface CopayInput {
  precio: number;
  plan: PlanRules;
  tier: TierRules;
  asegurado: AseguradoState;
  especialidadId: string;
  enRed: boolean;
  fechaConsulta: Date;
}

export interface CopayResult {
  aDeducible: number;
  coaseguro: number;
  copagoFijo: number;
  totalPaciente: number;
  totalAseguradora: number;
  marcas: CopayMark[];
  /** Only set when the "carencia" mark applies. */
  diasRestantesCarencia?: number;
}

/** Thrown for PRD 7.4 rule 1: an inactive policy cannot be quoted. */
export class PolizaInactivaError extends Error {
  readonly code = "POLIZA_INACTIVA" as const;

  constructor() {
    super("La poliza esta inactiva y no puede cotizar.");
    this.name = "PolizaInactivaError";
  }
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Whole days elapsed between two dates (fechaConsulta assumed >= fechaInicio). */
function diasTranscurridos(fechaInicio: Date, fechaConsulta: Date): number {
  const diffMs = fechaConsulta.getTime() - fechaInicio.getTime();
  return Math.floor(diffMs / MS_PER_DAY);
}

/**
 * Rounds half-up (away from zero) to the given number of decimals.
 * `Math.round` already rounds .5 toward +Infinity for positive numbers, which
 * is half-up for the non-negative money values this domain deals with; the
 * `Number.EPSILON` nudge compensates for binary floating-point drift
 * (e.g. 33.33 * 0.173 landing a hair below the exact .5 boundary).
 */
function roundHalfUp(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Calculates the copay breakdown for a single consultation, following
 * PRD 7.4 steps 1-11 in order.
 *
 * @throws {PolizaInactivaError} if the policy is not active (rule 1).
 */
export function calcularCopago(input: CopayInput): CopayResult {
  const { precio, plan, tier, asegurado, especialidadId, enRed, fechaConsulta } = input;

  // 1. Inactive policy: nothing else can be computed.
  if (!asegurado.activa) {
    throw new PolizaInactivaError();
  }

  const marcas: CopayMark[] = [];
  let diasRestantesCarencia: number | undefined;

  // 2. Out-of-network hospital.
  if (!enRed) {
    marcas.push("fuera_de_red");
  }

  // 3. Waiting period, skipped for medicina_general.
  if (especialidadId !== MEDICINA_GENERAL_ID) {
    const dias = diasTranscurridos(asegurado.fechaInicio, fechaConsulta);
    if (dias < plan.carenciaEspecialidadDias) {
      marcas.push("carencia");
      diasRestantesCarencia = plan.carenciaEspecialidadDias - dias;
    }
  }

  // Rules 2 and 3 are both full-cost short-circuits: no deductible, coinsurance
  // or cap computation applies once either one fires.
  if (marcas.length > 0) {
    const totalPaciente = roundHalfUp(precio);
    return {
      aDeducible: 0,
      coaseguro: 0,
      copagoFijo: 0,
      totalPaciente,
      totalAseguradora: roundHalfUp(precio - totalPaciente),
      marcas,
      diasRestantesCarencia,
    };
  }

  // 4. Remaining deductible.
  const deducibleRestante = Math.max(plan.deducibleAnual - asegurado.deducibleUsado, 0);
  // 5. Portion of the price absorbed by the deductible.
  const aDeducible = roundHalfUp(Math.min(precio, deducibleRestante));
  // 6. Coinsurance on what's left after the deductible.
  const coaseguro = roundHalfUp((precio - aDeducible) * tier.coaseguro);
  // 7. Gross patient cost before the out-of-pocket cap.
  const copagoFijo = roundHalfUp(tier.copagoFijo);
  const bruto = aDeducible + coaseguro + copagoFijo;
  // 8. Remaining out-of-pocket cap.
  const topeRestante = Math.max(plan.topeAnualBolsillo - asegurado.gastoAcumulado, 0);
  // 9. Patient total: capped by the remaining out-of-pocket max and by the price itself.
  const totalPaciente = roundHalfUp(Math.min(bruto, topeRestante, precio));
  // 10. Insurer covers the rest.
  const totalAseguradora = roundHalfUp(precio - totalPaciente);

  return {
    aDeducible,
    coaseguro,
    copagoFijo,
    totalPaciente,
    totalAseguradora,
    marcas,
  };
}
