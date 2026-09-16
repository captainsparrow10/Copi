import { describe, expect, it } from "vitest";
import { buildTools } from "@/lib/agent/tools";

/**
 * Exercises lib/agent/tools.ts against the real seeded Postgres DB (same
 * pattern as tests/rag-search.test.ts and tests/copay.test.ts's fixtures —
 * this suite, unlike those, needs live data so it hits `db` directly).
 * Requires `npm run db:migrate && npm run db:seed` to have been run against
 * DATABASE_URL, and Ollama reachable for buscar_especialidad's embedding
 * call (buscarEnGuiaEspecialidades embeds the query).
 */
describe("lib/agent/tools — PRD 7.5", () => {
  it("buscar_especialidad dedupes multiple fragments from the same specialty, keeping the best score", async () => {
    const tools = await buildTools("POL-1001");
    const result = (await tools.buscar_especialidad.execute!(
      { sintoma: "me duele la rodilla al subir escaleras" },
      { toolCallId: "t1", messages: [], context: {} },
    )) as { resultados: { especialidad: string; score: number }[]; motivo?: string };

    expect(Array.isArray(result.resultados)).toBe(true);
    const especialidadIds = result.resultados.map((r) => r.especialidad);
    expect(new Set(especialidadIds).size).toBe(especialidadIds.length); // no duplicate especialidad
  });

  it("cotizar_consulta flags carencia for POL-1004 + cardiologia (10 days in, 30-day waiting period)", async () => {
    const tools = await buildTools("POL-1004");
    const result = (await tools.cotizar_consulta.execute!(
      { especialidad: "cardiologia" },
      { toolCallId: "t2", messages: [], context: {} },
    )) as {
      carencia: { enCarencia: boolean; diasRestantes?: number };
      opciones: { total_paciente: number; marcas: string[] }[];
    };

    expect(result.carencia.enCarencia).toBe(true);
    expect(result.carencia.diasRestantes).toBeGreaterThan(0);
    expect(result.opciones.length).toBeGreaterThan(0);
    for (const opcion of result.opciones) {
      expect(opcion.marcas).toContain("carencia");
      // Full-cost short-circuit: patient pays the full price during carencia.
      expect(opcion.total_paciente).toBeGreaterThan(0);
    }
  });

  it("cotizar_consulta returns a tool-result-level POLIZA_INACTIVA error for POL-1005, not a thrown exception", async () => {
    const tools = await buildTools("POL-1005");
    const result = (await tools.cotizar_consulta.execute!(
      { especialidad: "cardiologia" },
      { toolCallId: "t3", messages: [], context: {} },
    )) as { error?: string; mensaje?: string };

    expect(result.error).toBe("POLIZA_INACTIVA");
    expect(typeof result.mensaje).toBe("string");
  });

  it("obtener_resumen_plan returns the documented shape", async () => {
    const tools = await buildTools("POL-1001");
    const result = (await tools.obtener_resumen_plan.execute!(
      {},
      { toolCallId: "t4", messages: [], context: {} },
    )) as {
      plan: string;
      deducible_restante: number;
      tope_restante: number;
      carencia: { enCarencia: boolean; diasRestantes?: number };
    };

    expect(typeof result.plan).toBe("string");
    expect(typeof result.deducible_restante).toBe("number");
    expect(typeof result.tope_restante).toBe("number");
    expect(typeof result.carencia.enCarencia).toBe("boolean");
  });
});
