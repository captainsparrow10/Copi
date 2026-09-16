import { describe, expect, it } from "vitest";
import { containsToolCallArtifact } from "@/lib/guards/tool-syntax-validator";

/**
 * Regression: ambig-04 (Phase 5 evals) — qwen2.5:14b sometimes writes the
 * tool call as prose instead of issuing a real tool call. That text must
 * never be treated as a valid assistant answer.
 */
describe("containsToolCallArtifact — PRD 7.8 grounding (bug 4a)", () => {
  it("flags a leaked _icall_ / _ical_ marker (observed in ambig-04)", () => {
    const text = '_icall_\n{"name": "buscar_especialidad", "arguments": {"sintoma": "ando mal"}}\n_ical_';
    expect(containsToolCallArtifact(text)).toBe(true);
  });

  it("flags a <tool_call> XML-ish block", () => {
    const text = '<tool_call>{"name": "cotizar_consulta", "arguments": {"especialidad": "cardiologia"}}</tool_call>';
    expect(containsToolCallArtifact(text)).toBe(true);
  });

  it("flags a raw tool-call JSON blob leaked as prose, without any wrapper markers", () => {
    const text = 'Ok, voy a buscar: {"name": "buscar_especialidad", "arguments": {"sintoma": "me duele la cabeza"}}';
    expect(containsToolCallArtifact(text)).toBe(true);
  });

  it("does NOT flag ordinary Spanish prose, even mentioning tools by name", () => {
    const text = "La especialidad que conviene para palpitaciones es Cardiología.";
    expect(containsToolCallArtifact(text)).toBe(false);
  });

  it("does NOT flag a normal clarifying question", () => {
    const text = "¿Podrías decirme dónde exactamente sientes el malestar y cuánto tiempo llevas con este síntoma?";
    expect(containsToolCallArtifact(text)).toBe(false);
  });

  it("does NOT flag unrelated JSON-shaped text without name/arguments keys", () => {
    const text = 'El plan tiene un tope de {"monto": 1000}.';
    expect(containsToolCallArtifact(text)).toBe(false);
  });
});
