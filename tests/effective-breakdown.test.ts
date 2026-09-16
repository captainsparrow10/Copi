import { describe, expect, it } from "vitest";
import { computeEffectiveBreakdown } from "@/lib/domain/effective-breakdown";

/**
 * Display bug: QuoteCard showed "Copago fijo $8.00" even when the whole
 * price went to the deductible and `total_paciente` (capped at `precio` per
 * PRD 7.4 step 9, `min(bruto, topeRestante, precio)`) ended up LOWER than
 * `a_deducible + coaseguro + copago_fijo` (`bruto`). E.g. precio=38,
 * deducible_restante>=38 -> a_deducible=38, coaseguro=0, copago_fijo=8 (flat),
 * bruto=46, but total_paciente=min(46, topeRestante, 38)=38: the patient
 * never actually pays the $8 copago_fijo, but the raw field still shows it.
 *
 * computeEffectiveBreakdown caps each component, in the same order they're
 * computed (PRD 7.4 steps 5-7: a_deducible, then coaseguro, then
 * copago_fijo), against what's left of `total_paciente` — so the three
 * effective components always sum exactly to `total_paciente`, matching what
 * the patient was actually charged. It never changes `total_paciente` or
 * `total_aseguradora` themselves (PRD 7.4 math stays untouched) — display only.
 */
describe("computeEffectiveBreakdown — display bug fix", () => {
  it("caps copago_fijo down to zero when the deductible alone already covers total_paciente", () => {
    const result = computeEffectiveBreakdown({
      a_deducible: 38,
      coaseguro: 0,
      copago_fijo: 8,
      total_paciente: 38, // capped at precio=38, bruto was 46
    });
    expect(result).toEqual({ aDeducible: 38, coaseguro: 0, copagoFijo: 0 });
    expect(result.aDeducible + result.coaseguro + result.copagoFijo).toBe(38);
  });

  it("passes components through unchanged when they already sum to total_paciente (no cap in play)", () => {
    const result = computeEffectiveBreakdown({
      a_deducible: 20,
      coaseguro: 8,
      copago_fijo: 10,
      total_paciente: 38,
    });
    expect(result).toEqual({ aDeducible: 20, coaseguro: 8, copagoFijo: 10 });
  });

  it("partially caps coaseguro when only it exceeds what's left after a_deducible", () => {
    // a_deducible=10, then only 5 of total_paciente=15 remains for coaseguro (raw 12), copago_fijo raw 8 -> 0 left.
    const result = computeEffectiveBreakdown({
      a_deducible: 10,
      coaseguro: 12,
      copago_fijo: 8,
      total_paciente: 15,
    });
    expect(result).toEqual({ aDeducible: 10, coaseguro: 5, copagoFijo: 0 });
    expect(result.aDeducible + result.coaseguro + result.copagoFijo).toBe(15);
  });

  it("handles the tope-alcanzado case (total_paciente capped by the remaining out-of-pocket max)", () => {
    // bruto = 50+10+8 = 68, but tope_restante left only 30.
    const result = computeEffectiveBreakdown({
      a_deducible: 50,
      coaseguro: 10,
      copago_fijo: 8,
      total_paciente: 30,
    });
    expect(result.aDeducible).toBe(30);
    expect(result.coaseguro).toBe(0);
    expect(result.copagoFijo).toBe(0);
    expect(result.aDeducible + result.coaseguro + result.copagoFijo).toBe(30);
  });

  it("returns all-zero components for the carencia/fuera_de_red full-cost short-circuit (total_paciente = precio, no component was charged)", () => {
    const result = computeEffectiveBreakdown({
      a_deducible: 0,
      coaseguro: 0,
      copago_fijo: 0,
      total_paciente: 45,
    });
    expect(result).toEqual({ aDeducible: 0, coaseguro: 0, copagoFijo: 0 });
  });
});
