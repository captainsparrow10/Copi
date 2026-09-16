/**
 * Patient profile for the right-hand panel: what the plan covers and where the
 * patient stands this year. Pure (no DB); app/api/profile/route.ts loads the rows
 * and `obtener_resumen_plan` (lib/agent/tools.ts) reuses the same numbers, so the
 * panel and the agent never disagree.
 */

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export interface ProfileInput {
  poliza: string;
  nombre: string;
  activa: boolean;
  fechaInicio: Date;
  deducibleUsado: number;
  gastoAcumulado: number;
  plan: {
    id: string;
    nombre: string;
    deducibleAnual: number;
    topeAnualBolsillo: number;
    carenciaEspecialidadDias: number;
  };
  tiers: { tier: string; coaseguro: number; copagoFijo: number }[];
  today: Date;
}

export interface CarenciaProfile {
  dias: number;
  enCarencia: boolean;
  diasRestantes?: number;
}

export interface PatientProfile {
  poliza: string;
  nombre: string;
  activa: boolean;
  fechaInicio: string;
  plan: { id: string; nombre: string };
  deducible: { anual: number; usado: number; restante: number; porcentajeUsado: number };
  tope: { anual: number; gastado: number; restante: number; porcentajeUsado: number };
  carencia: CarenciaProfile;
  tiers: { tier: string; coaseguroPorcentaje: number; copagoFijo: number }[];
  /** Plain-language notes about this patient's situation, most important first. */
  enTuCaso: string[];
}

function roundTo2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function percentUsed(used: number, total: number): number {
  if (total <= 0) return 100;
  return Math.min(100, Math.floor((used / total) * 100));
}

function money(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/** Waiting period for specialists, same rule as lib/domain/copay.ts (whole days since policy start). */
export function computeCarencia(fechaInicio: Date, carenciaDias: number, today: Date): CarenciaProfile {
  const dias = Math.floor((today.getTime() - fechaInicio.getTime()) / MS_PER_DAY);
  return dias < carenciaDias
    ? { dias: carenciaDias, enCarencia: true, diasRestantes: carenciaDias - dias }
    : { dias: carenciaDias, enCarencia: false };
}

export function buildPatientProfile(input: ProfileInput): PatientProfile {
  const { plan } = input;
  const deducibleRestante = roundTo2(Math.max(plan.deducibleAnual - input.deducibleUsado, 0));
  const topeRestante = roundTo2(Math.max(plan.topeAnualBolsillo - input.gastoAcumulado, 0));
  const carencia = computeCarencia(input.fechaInicio, plan.carenciaEspecialidadDias, input.today);

  const enTuCaso: string[] = [];
  if (!input.activa) {
    enTuCaso.push("Tu póliza está inactiva: no se pueden cotizar consultas hasta que se reactive.");
  }
  if (carencia.enCarencia) {
    enTuCaso.push(
      `Estás en período de carencia: faltan ${carencia.diasRestantes} días para que el plan cubra especialistas. ` +
        "Mientras tanto pagas el 100% de esas consultas; medicina general sí está cubierta.",
    );
  }
  if (plan.deducibleAnual > 0 && deducibleRestante > 0) {
    enTuCaso.push(
      `Te faltan ${money(deducibleRestante)} de deducible: hasta cubrirlo, pagas las consultas completas.`,
    );
  } else if (plan.deducibleAnual > 0) {
    enTuCaso.push("Ya cubriste tu deducible: desde ahora solo pagas coaseguro y copago fijo.");
  } else {
    enTuCaso.push("Tu plan no tiene deducible: desde la primera consulta pagas solo coaseguro y copago fijo.");
  }
  if (topeRestante === 0) {
    enTuCaso.push("Alcanzaste tu tope anual de bolsillo: este año la aseguradora cubre el resto de tus consultas.");
  } else if (topeRestante <= plan.topeAnualBolsillo * 0.1) {
    enTuCaso.push(
      `Estás cerca de tu tope anual: te quedan ${money(topeRestante)}, después la aseguradora paga todo.`,
    );
  }

  return {
    poliza: input.poliza,
    nombre: input.nombre,
    activa: input.activa,
    fechaInicio: input.fechaInicio.toISOString().slice(0, 10),
    plan: { id: plan.id, nombre: plan.nombre },
    deducible: {
      anual: plan.deducibleAnual,
      usado: input.deducibleUsado,
      restante: deducibleRestante,
      porcentajeUsado: percentUsed(input.deducibleUsado, plan.deducibleAnual),
    },
    tope: {
      anual: plan.topeAnualBolsillo,
      gastado: input.gastoAcumulado,
      restante: topeRestante,
      porcentajeUsado: percentUsed(input.gastoAcumulado, plan.topeAnualBolsillo),
    },
    carencia,
    tiers: [...input.tiers]
      .sort((a, b) => a.tier.localeCompare(b.tier))
      .map((t) => ({ tier: t.tier, coaseguroPorcentaje: Math.round(t.coaseguro * 100), copagoFijo: t.copagoFijo })),
    enTuCaso,
  };
}
