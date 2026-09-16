import { describe, expect, it } from "vitest";
import { validateAmounts } from "@/lib/guards/amount-validator";

/**
 * validateAmounts scans responseText for money-shaped substrings and checks
 * each exists verbatim (as a number, formatting-insensitive re: leading "$"
 * and trailing ".00") somewhere in the JSON-stringified tool results for the
 * same turn. See lib/guards/amount-validator.ts for the regex's documented
 * scope/limits.
 */
describe("validateAmounts — PRD 7.8 layer 6", () => {
  const toolResults = [
    {
      toolName: "cotizar_consulta",
      output: {
        opciones: [
          { hospital: "Clinica San Rafael del Istmo", total_paciente: 45, total_aseguradora: 20 },
          { hospital: "Hospital Central Bienestar", total_paciente: 62.5, total_aseguradora: 27.5 },
        ],
      },
    },
  ];

  it("passes when every amount in the text exists in the tool results, plain format", () => {
    const text = "En Clinica San Rafael del Istmo pagarías 45 por la consulta.";
    const result = validateAmounts(text, toolResults);
    expect(result.valid).toBe(true);
    expect(result.invalidAmounts).toEqual([]);
  });

  it("passes with a dollar-sign + two-decimal format that matches a tool amount", () => {
    const text = "El costo es de $45.00 en esa clínica.";
    expect(validateAmounts(text, toolResults).valid).toBe(true);
  });

  it("passes with a bare two-decimal format that matches a tool amount", () => {
    const text = "El costo es de 62.50 en Hospital Central Bienestar.";
    expect(validateAmounts(text, toolResults).valid).toBe(true);
  });

  it("fails when the text contains a fabricated amount not present in any tool result", () => {
    const text = "Te va a salir en $12.00 nada más.";
    const result = validateAmounts(text, toolResults);
    expect(result.valid).toBe(false);
    expect(result.invalidAmounts).toContain("12.00");
  });

  it("fails when the text alters a real amount by even a small margin", () => {
    const text = "Pagarías $45.50 en esa clínica.";
    const result = validateAmounts(text, toolResults);
    expect(result.valid).toBe(false);
    expect(result.invalidAmounts).toContain("45.50");
  });

  it("passes trivially when the text has no amounts at all", () => {
    const text = "La especialidad recomendada según tu síntoma es traumatología.";
    const result = validateAmounts(text, toolResults);
    expect(result.valid).toBe(true);
    expect(result.invalidAmounts).toEqual([]);
  });

  it("passes trivially when there are no tool results and no amounts in text", () => {
    const result = validateAmounts("Hola, ¿en qué te puedo ayudar?", []);
    expect(result.valid).toBe(true);
  });

  it("fails any amount in text when there are no tool results at all", () => {
    const result = validateAmounts("Te costaría $10.", []);
    expect(result.valid).toBe(false);
    expect(result.invalidAmounts).toContain("10");
  });

  it("collects multiple invalid amounts", () => {
    const text = "Una opción es $12.00 y otra es $99.99.";
    const result = validateAmounts(text, toolResults);
    expect(result.valid).toBe(false);
    expect(result.invalidAmounts).toEqual(["12.00", "99.99"]);
  });

  it("does not flag plain non-money numbers like a waiting-period day count", () => {
    // 20 dias restantes de carencia is not a dollar amount; the regex only
    // targets money-shaped tokens ($-prefixed or decimal), so a bare integer
    // with no "$" and no decimals is out of scope by design (documented in
    // the implementation) and must not be treated as a fabricated amount.
    const text = "Estás en carencia: 20 días restantes.";
    const result = validateAmounts(text, toolResults);
    expect(result.valid).toBe(true);
  });
});
