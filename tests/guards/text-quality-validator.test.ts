import { describe, expect, it } from "vitest";
import { isDegenerateRepetition } from "@/lib/guards/text-quality-validator";

/**
 * Regression: ambig-01 (Phase 5 evals) — a transient Ollama/qwen2.5:14b
 * decoding glitch produced " sourceMapping sourceMapping sourceMapping ..."
 * instead of real prose. That must be caught and degraded gracefully
 * instead of streamed to the patient as the assistant's answer.
 */
describe("isDegenerateRepetition — PRD bug 7 (transient stream errors)", () => {
  it("flags the exact observed failure mode (same word repeated dozens of times)", () => {
    const text = Array(40).fill("sourceMapping").join(" ");
    expect(isDegenerateRepetition(text)).toBe(true);
  });

  it("flags a shorter but still clearly degenerate repetition (6+ repeats)", () => {
    const text = "hola " + Array(6).fill("error").join(" ") + " gracias";
    expect(isDegenerateRepetition(text)).toBe(true);
  });

  /**
   * Regression: this exact output (2 repeats) was observed live from
   * qwen2.5:14b for ambig-04 in a Phase 5 eval re-run, after the sliding-
   * window check (6+ repeats) had already shipped and still missed it —
   * the whole answer was just this token twice, nothing else.
   */
  it("flags the exact live-observed short case (only 2 repeats, but the ENTIRE answer)", () => {
    expect(isDegenerateRepetition(" sourceMapping sourceMapping\n")).toBe(true);
  });

  it("does NOT flag ordinary Spanish prose with natural word repetition", () => {
    const text =
      "La especialidad que conviene para palpitaciones es Cardiología. " +
      "Ahora cotizaré las consultas con Cardiólogos en tu red de hospitales.";
    expect(isDegenerateRepetition(text)).toBe(false);
  });

  it("does NOT flag short 2-3 word repeats used for emphasis", () => {
    const text = "No, no, no puedo confirmar ese dato.";
    expect(isDegenerateRepetition(text)).toBe(false);
  });

  it("does NOT flag a single short word alone (nothing to compare it against)", () => {
    expect(isDegenerateRepetition("hola")).toBe(false);
  });

  // "hola hola hola" alone (the whole answer, nothing else) fits the
  // whole-answer special case above: no legitimate Copi answer is just one
  // word repeated with no other content, so it's correctly flagged too.
  it("flags a short text that is ENTIRELY the same word repeated, even below the sliding-window minimum", () => {
    expect(isDegenerateRepetition("hola hola hola")).toBe(true);
  });

  it("does NOT flag a short word repeated only twice if it's shorter than 3 chars (avoids flagging filler like 'ja ja')", () => {
    expect(isDegenerateRepetition("ja ja")).toBe(false);
  });
});
