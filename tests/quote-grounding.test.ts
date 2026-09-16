import { describe, expect, it } from "vitest";
import {
  buildGroundedToolResults,
  formatQuoteContextBlock,
  isFollowUpToStoredQuote,
  type StoredQuoteContext,
} from "@/lib/domain/quote-grounding";
import { validateAmounts } from "@/lib/guards/amount-validator";
import type { CotizarConsultaSuccess } from "@/lib/domain/quote-types";

/**
 * Grounding across turns (bug fix): the amount validator only ever grounds
 * against tool outputs from the CURRENT turn's `toolResultsAcc`
 * (lib/agent/run.ts). A follow-up turn ("qué diferencia hay con el
 * recomendado") never calls `cotizar_consulta` again, so without seeding
 * `toolResultsAcc` with the session's persisted quote, every amount in the
 * model's answer gets blocked as "invented" even though it's the exact same
 * quote from the previous turn. `buildGroundedToolResults` is the pure piece
 * that fixes this: it folds the stored quote's payload into the same
 * `ToolResultRecord[]` shape `validateAmounts` already accepts.
 */
const storedPayload: CotizarConsultaSuccess = {
  plan: "Plan Estándar",
  especialidad: "traumatologia",
  carencia: { enCarencia: false },
  recomendado: "Centro Medico Las Palmas",
  opciones: [
    {
      hospital: "Centro Medico Las Palmas",
      tier: "A",
      zona: "Costa del Este",
      precio: 55,
      a_deducible: 55,
      coaseguro: 0,
      copago_fijo: 8,
      total_paciente: 55,
      total_aseguradora: 0,
      marcas: [],
    },
    {
      hospital: "Hospital Central Bienestar",
      tier: "A",
      zona: "Via Espana",
      precio: 60,
      a_deducible: 60,
      coaseguro: 0,
      copago_fijo: 8,
      total_paciente: 60,
      total_aseguradora: 0,
      marcas: [],
    },
  ],
};

const storedContext = {
  id: "quote-1",
  especialidadId: "traumatologia",
  seleccion: "Centro Medico Las Palmas",
  estado: "abierta" as const,
  payload: storedPayload,
};

describe("buildGroundedToolResults", () => {
  it("returns the current turn's results untouched when there is no stored quote", () => {
    const current = [{ toolName: "buscar_especialidad", input: {}, output: { resultados: [] } }];
    expect(buildGroundedToolResults(current, null)).toEqual(current);
  });

  it("folds the stored quote's payload in alongside follow-up tool results such as the plan summary", () => {
    const current = [{ toolName: "obtener_resumen_plan", input: {}, output: { plan: "Plan Estándar" } }];
    const grounded = buildGroundedToolResults(current, storedContext);
    expect(grounded).toHaveLength(3);
    expect(grounded[1]?.toolName).toBe("cotizacion_activa_sesion");
    expect(grounded[1]?.output).toEqual(storedPayload);
    expect(grounded[2]?.toolName).toBe("diferencias_cotizacion_activa");
  });

  it("drops the stored quote when this turn searched a specialty, so a new symptom can't reuse stale prices", () => {
    const current = [
      {
        toolName: "buscar_especialidad",
        input: { sintoma: "acidez" },
        output: { resultados: [{ especialidad: "gastroenterologia" }] },
      },
    ];
    const grounded = buildGroundedToolResults(current, storedContext);
    expect(grounded).toEqual(current);
    // Eval regression clear-04: a gastro answer reused the stored traumatologia price.
    const result = validateAmounts("En Centro Medico Las Palmas pagarás $55.00.", grounded);
    expect(result.valid).toBe(false);
    expect(result.invalidAmounts).toContain("55.00");
  });

  it("drops the stored quote once this turn produced a fresh quote, grounding only the new one", () => {
    const current = [
      { toolName: "cotizar_consulta", input: { especialidad: "traumatologia" }, output: { opciones: [] } },
    ];
    expect(buildGroundedToolResults(current, storedContext)).toEqual(current);
  });

  it("grounds a follow-up answer's amounts against the stored quote alone (no current-turn tool call)", () => {
    const grounded = buildGroundedToolResults([], storedContext);
    const text = "En Centro Medico Las Palmas pagarías $55.00; en Hospital Central Bienestar, $60.00.";
    const result = validateAmounts(text, grounded);
    expect(result.valid).toBe(true);
    expect(result.invalidAmounts).toEqual([]);
  });

  it("grounds the server-computed difference against the recommended option", () => {
    // Browser regression: "qué diferencia hay entre el que elegí y el recomendado" -> "$34" was blocked.
    const withRecommendedCheaper: StoredQuoteContext = {
      ...storedContext,
      payload: { ...storedPayload, recomendado: "Hospital Central Bienestar" },
    };
    const grounded = buildGroundedToolResults([], withRecommendedCheaper);
    const result = validateAmounts("Pagarías $5.00 menos en Centro Medico Las Palmas.", grounded);
    expect(result.valid).toBe(true);
  });

  it("grounds the capped components the patient is actually charged", () => {
    const capped: StoredQuoteContext = {
      ...storedContext,
      payload: {
        ...storedPayload,
        opciones: [{ ...storedPayload.opciones[0]!, a_deducible: 50, coaseguro: 10, copago_fijo: 8, total_paciente: 53.5 }],
      },
    };
    // 53.50 - 50 = 3.50 of coinsurance is what's charged; 3.50 appears in no raw field.
    const result = validateAmounts("De coaseguro pagas $3.50.", buildGroundedToolResults([], capped));
    expect(result.valid).toBe(true);
  });

  it("still blocks an arbitrary derived amount that the server never computed", () => {
    const grounded = buildGroundedToolResults([], storedContext);
    const result = validateAmounts("Te ahorras $115.00.", grounded);
    expect(result.valid).toBe(false);
  });

  it("still blocks an amount that is in neither the current turn's tool outputs nor the stored quote", () => {
    const grounded = buildGroundedToolResults([], storedContext);
    const text = "En Centro Medico Las Palmas pagarías $999.00.";
    const result = validateAmounts(text, grounded);
    expect(result.valid).toBe(false);
    expect(result.invalidAmounts).toContain("999.00");
  });
});

describe("formatQuoteContextBlock", () => {
  it("returns null when there is no stored quote", () => {
    expect(formatQuoteContextBlock(null)).toBeNull();
  });

  it("includes every hospital, its amounts, and the current selection", () => {
    const block = formatQuoteContextBlock(storedContext);
    expect(block).toContain("traumatologia");
    expect(block).toContain("Centro Medico Las Palmas");
    expect(block).toContain("Hospital Central Bienestar");
    expect(block).toContain("55");
    expect(block).toContain("60");
    expect(block).toContain("Selección actual del paciente: Centro Medico Las Palmas");
  });

  it("scopes the prices to their specialty and demands a fresh quote for any other symptom", () => {
    const block = formatQuoteContextBlock(storedContext);
    expect(block).toMatch(/solo.*traumatologia/i);
    expect(block).toMatch(/nunca uses estos montos para otra especialidad/i);
  });

  it("says no selection has been made yet when seleccion is null", () => {
    const block = formatQuoteContextBlock({ ...storedContext, seleccion: null });
    expect(block).toMatch(/ninguna|sin selección/i);
  });

  it("flags an out-of-network selection so the model can warn about it", () => {
    const outOfNetworkPayload: CotizarConsultaSuccess = {
      ...storedPayload,
      opciones: [
        { ...storedPayload.opciones[0]!, marcas: ["fuera_de_red"] },
        storedPayload.opciones[1]!,
      ],
    };
    const block = formatQuoteContextBlock({
      ...storedContext,
      payload: outOfNetworkPayload,
      seleccion: "Centro Medico Las Palmas",
    });
    expect(block).toMatch(/fuera de red|100 ?%/i);
  });
});

describe("formatQuoteContextBlock — differences", () => {
  it("lists each option's difference against the recommended hospital", () => {
    const block = formatQuoteContextBlock({
      ...storedContext,
      payload: { ...storedPayload, recomendado: "Hospital Central Bienestar" },
    });
    expect(block).toMatch(/Centro Medico Las Palmas[^\n]*\$5\.00 menos que el recomendado/);
  });

  it("reads as plain Spanish, without internal field names, in case the model echoes it", () => {
    // Browser bug: the agent pasted "precio 38.00, a_deducible 38.00, copago_fijo 8.00" to the patient.
    const block = formatQuoteContextBlock(storedContext) ?? "";
    expect(block).not.toMatch(/a_deducible|copago_fijo|total_paciente|total_aseguradora|diferencia_vs_recomendado/);
    expect(block).toMatch(/Centro Medico Las Palmas[^\n]*pagas \$55\.00/);
  });

  it("describes the fixed copay actually charged, not the raw one swallowed by the deductible", () => {
    const block = formatQuoteContextBlock(storedContext) ?? "";
    expect(block).not.toMatch(/copago fijo \$8\.00/);
  });
});

describe("isFollowUpToStoredQuote", () => {
  it("treats a message with no specialty match as a follow-up about the stored quote", () => {
    expect(isFollowUpToStoredQuote(null, "traumatologia")).toBe(true);
  });

  it("treats a message about the same specialty as a follow-up", () => {
    expect(isFollowUpToStoredQuote("traumatologia", "traumatologia")).toBe(true);
  });

  it("rejects the stored quote when the new message points to another specialty", () => {
    // Review finding: a zero-tool-call answer to a new symptom was grounded against the old specialty's prices.
    expect(isFollowUpToStoredQuote("gastroenterologia", "traumatologia")).toBe(false);
  });
});
