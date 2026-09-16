import { describe, expect, it } from "vitest";
import { decideStepTools } from "@/lib/agent/step-policy";

const found = { toolName: "buscar_especialidad", output: { resultados: [{ especialidad: "traumatologia" }] } };
const notFound = { toolName: "buscar_especialidad", output: { resultados: [], motivo: "SIN_COINCIDENCIAS" } };
const quoted = { toolName: "cotizar_consulta", output: { opciones: [] } };

describe("decideStepTools", () => {
  it("hides cotizar_consulta before any specialty search this turn", () => {
    expect(decideStepTools([])).toEqual({
      activeTools: ["buscar_especialidad", "obtener_resumen_plan", "buscar_en_poliza"],
    });
  });

  it("hides cotizar_consulta when the search found no specialty, so the model asks a clarifying question", () => {
    expect(decideStepTools([notFound])).toEqual({
      activeTools: ["buscar_especialidad", "obtener_resumen_plan", "buscar_en_poliza"],
    });
  });

  it("forces cotizar_consulta right after a specialty was found and nothing was quoted yet", () => {
    // Eval regression clear-04/05/08: the model stopped after buscar_especialidad and answered with stale prices.
    expect(decideStepTools([found])).toEqual({ toolChoice: { type: "tool", toolName: "cotizar_consulta" } });
  });

  it("stops forcing once this turn already produced a quote", () => {
    expect(decideStepTools([found, quoted])).toEqual({});
  });
});
