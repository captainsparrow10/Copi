import { describe, expect, it } from "vitest";
import { aplicarUmbral } from "../lib/rag/search";

describe("aplicarUmbral — RAG_MIN_SCORE filter (PRD 7.8 layer 4)", () => {
  it("keeps results at or above the threshold", () => {
    const resultados = [
      { id: "G-1", score: 0.9 },
      { id: "G-2", score: 0.7 },
      { id: "G-3", score: 0.5 },
    ];

    expect(aplicarUmbral(resultados, 0.7)).toEqual([
      { id: "G-1", score: 0.9 },
      { id: "G-2", score: 0.7 },
    ]);
  });

  it("returns an empty array (SIN_COINCIDENCIAS / NO_ENCONTRADO) when nothing clears the bar", () => {
    const resultados = [
      { id: "G-1", score: 0.2 },
      { id: "G-2", score: 0.1 },
    ];

    expect(aplicarUmbral(resultados, 0.7)).toEqual([]);
  });

  it("does not mutate or reorder the input", () => {
    const resultados = [
      { id: "G-1", score: 0.6 },
      { id: "G-2", score: 0.95 },
    ];

    const filtrados = aplicarUmbral(resultados, 0.7);

    expect(resultados).toHaveLength(2); // unchanged
    expect(filtrados).toEqual([{ id: "G-2", score: 0.95 }]);
  });

  it("treats an empty input as an empty result", () => {
    expect(aplicarUmbral([], 0.7)).toEqual([]);
  });

  it("is inclusive at the exact threshold boundary", () => {
    expect(aplicarUmbral([{ id: "G-1", score: 0.7 }], 0.7)).toEqual([{ id: "G-1", score: 0.7 }]);
  });
});
