/**
 * Display-only fix for the "Copago fijo $8.00 shown while the whole price
 * went to the deductible" bug (QuoteCard). `lib/domain/copay.ts`'s
 * `a_deducible` / `coaseguro` / `copago_fijo` are exactly PRD 7.4 steps 5-7's
 * `bruto` components — they do NOT already reflect step 9's cap
 * (`total_paciente = min(bruto, topeRestante, precio)`), so when that cap
 * fires, the three raw components can sum to more than what the patient
 * actually paid. Deliberately NOT fixed in lib/domain/copay.ts itself: the
 * PRD 7.4 formulas (and the numbers `cotizar_consulta` returns, which the
 * amount validator grounds against) must stay exactly as specified — this is
 * a presentation-layer re-derivation for components/QuoteCard.tsx only.
 *
 * Caps each component, in the same order they're computed (a_deducible,
 * then coaseguro, then copago_fijo — PRD 7.4 steps 5-7), against what's left
 * of `total_paciente`, so the three effective components always sum exactly
 * to `total_paciente`.
 */

export interface RawBreakdown {
  a_deducible: number;
  coaseguro: number;
  copago_fijo: number;
  total_paciente: number;
}

export interface EffectiveBreakdown {
  aDeducible: number;
  coaseguro: number;
  copagoFijo: number;
}

function roundTo2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function computeEffectiveBreakdown(raw: RawBreakdown): EffectiveBreakdown {
  let remaining = raw.total_paciente;

  const aDeducible = roundTo2(Math.min(raw.a_deducible, Math.max(remaining, 0)));
  remaining -= aDeducible;

  const coaseguro = roundTo2(Math.min(raw.coaseguro, Math.max(remaining, 0)));
  remaining -= coaseguro;

  const copagoFijo = roundTo2(Math.min(raw.copago_fijo, Math.max(remaining, 0)));

  return { aDeducible, coaseguro, copagoFijo };
}
