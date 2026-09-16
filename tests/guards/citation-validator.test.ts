import { describe, expect, it } from "vitest";
import { validateCitations } from "@/lib/guards/citation-validator";

/**
 * validateCitations checks every [C-x.y] / [G-x] citation in the LLM text
 * against fragment ids actually present in the turn's tool results
 * (PRD 7.8 layer 7).
 */
describe("validateCitations — PRD 7.8 layer 7", () => {
  const toolResults = [
    { toolName: "buscar_especialidad", output: { resultados: [{ fragmento_id: "G-12", score: 0.84 }] } },
    { toolName: "buscar_en_poliza", output: { fragmentos: [{ id: "C-4.2", contenido: "..." }] } },
  ];

  it("passes when every citation exists among the tool results' fragment ids", () => {
    const text = "Según [G-12], te conviene traumatología. La póliza indica esto en [C-4.2].";
    const result = validateCitations(text, toolResults);
    expect(result.valid).toBe(true);
    expect(result.invalidCitations).toEqual([]);
  });

  it("fails when a citation references an id not present in the tool results", () => {
    const text = "Según [C-9.9], eso no está cubierto.";
    const result = validateCitations(text, toolResults);
    expect(result.valid).toBe(false);
    expect(result.invalidCitations).toContain("C-9.9");
  });

  it("fails when a valid-looking citation id doesn't match this turn's results", () => {
    const text = "Ver [G-99] para más detalle.";
    const result = validateCitations(text, toolResults);
    expect(result.valid).toBe(false);
    expect(result.invalidCitations).toContain("G-99");
  });

  it("passes trivially when the text has no citations", () => {
    const text = "Te recomiendo medicina general para ese síntoma.";
    const result = validateCitations(text, toolResults);
    expect(result.valid).toBe(true);
    expect(result.invalidCitations).toEqual([]);
  });

  it("fails any citation in text when there are no tool results at all", () => {
    const result = validateCitations("Según [G-1] esto aplica.", []);
    expect(result.valid).toBe(false);
    expect(result.invalidCitations).toEqual(["G-1"]);
  });

  it("collects multiple invalid citations in order", () => {
    const text = "Ver [G-77] y también [C-1.1].";
    const result = validateCitations(text, toolResults);
    expect(result.valid).toBe(false);
    expect(result.invalidCitations).toEqual(["G-77", "C-1.1"]);
  });

  it("is exact-match on the id — a similar but different id is invalid", () => {
    // G-12 exists, G-1 does not (must not partial-match by prefix).
    const text = "Ver [G-1] para detalle.";
    const result = validateCitations(text, toolResults);
    expect(result.valid).toBe(false);
    expect(result.invalidCitations).toContain("G-1");
  });
});
