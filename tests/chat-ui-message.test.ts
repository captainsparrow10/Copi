import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import {
  extractEmergencyData,
  extractLatestQuote,
  extractToolTrace,
  getMessageText,
  toChatMessages,
} from "@/lib/chat/ui-message";
import type { CotizarConsultaOutput } from "@/lib/agent/tools";

/** Builds a minimal fixture shaped like `@ai-sdk/react`'s `UIMessage` without fighting its discriminated-union part types — the helpers under test do their own runtime narrowing, so a loose cast here mirrors what actually arrives over the wire. */
function fakeMessage(role: UIMessage["role"], parts: unknown[]): UIMessage {
  return { id: `msg-${Math.random()}`, role, parts } as unknown as UIMessage;
}

describe("toChatMessages (Phase 3 /api/chat contract adapter)", () => {
  it("concatenates text parts of user and assistant messages, in order", () => {
    const messages = [
      fakeMessage("user", [{ type: "text", text: "Me duele la " }, { type: "text", text: "rodilla" }]),
      fakeMessage("assistant", [{ type: "text", text: "Te sugiero traumatología." }]),
    ];
    expect(toChatMessages(messages)).toEqual([
      { role: "user", content: "Me duele la rodilla" },
      { role: "assistant", content: "Te sugiero traumatología." },
    ]);
  });

  it("drops system messages", () => {
    const messages = [fakeMessage("system", [{ type: "text", text: "ignored" }])];
    expect(toChatMessages(messages)).toEqual([]);
  });

  it("drops a message that has no text parts (e.g. tool-only)", () => {
    const messages = [fakeMessage("assistant", [{ type: "tool-cotizar_consulta", state: "output-available" }])];
    expect(toChatMessages(messages)).toEqual([]);
  });
});

describe("getMessageText", () => {
  it("joins text parts and ignores other part types", () => {
    const message = fakeMessage("assistant", [
      { type: "text", text: "Hola, " },
      { type: "tool-cotizar_consulta", state: "output-available", output: {} },
      { type: "text", text: "¿en qué te ayudo?" },
    ]);
    expect(getMessageText(message)).toBe("Hola, ¿en qué te ayudo?");
  });

  it("returns an empty string when there are no text parts", () => {
    const message = fakeMessage("assistant", [{ type: "tool-cotizar_consulta", state: "input-available" }]);
    expect(getMessageText(message)).toBe("");
  });
});

describe("extractLatestQuote (PRD Anexo C rule 4: quote card renders from tool output, never text)", () => {
  const successOutput: CotizarConsultaOutput = {
    plan: "Plan Estándar",
    especialidad: "traumatologia",
    carencia: { enCarencia: false },
    recomendado: "Clinica Nueva Esperanza",
    opciones: [],
  };

  it("returns null when there's no tool-cotizar_consulta part", () => {
    const messages = [fakeMessage("assistant", [{ type: "text", text: "hola" }])];
    expect(extractLatestQuote(messages)).toBeNull();
  });

  it("ignores a part that hasn't reached output-available yet", () => {
    const messages = [
      fakeMessage("assistant", [{ type: "tool-cotizar_consulta", state: "input-available", toolCallId: "t1" }]),
    ];
    expect(extractLatestQuote(messages)).toBeNull();
  });

  it("returns the most recent output-available result across messages", () => {
    const older: CotizarConsultaOutput = { ...successOutput, especialidad: "cardiologia" };
    const messages = [
      fakeMessage("assistant", [
        { type: "tool-cotizar_consulta", state: "output-available", toolCallId: "t1", output: older },
      ]),
      fakeMessage("assistant", [
        { type: "tool-cotizar_consulta", state: "output-available", toolCallId: "t2", output: successOutput },
      ]),
    ];
    expect(extractLatestQuote(messages)).toEqual({ toolCallId: "t2", output: successOutput });
  });
});

describe("extractEmergencyData (structured signal, not text matching)", () => {
  it("reads matchedPhrase and isSelfHarm from a data-emergency part", () => {
    const message = fakeMessage("assistant", [
      { type: "data-emergency", data: { matchedPhrase: "convulsión", isSelfHarm: false } },
    ]);
    expect(extractEmergencyData(message)).toEqual({ matchedPhrase: "convulsión", isSelfHarm: false });
  });

  it("returns null when the message has no data-emergency part", () => {
    const message = fakeMessage("assistant", [{ type: "text", text: "Te sugiero traumatología." }]);
    expect(extractEmergencyData(message)).toBeNull();
  });
});

describe("extractToolTrace (PRD P1-03 'Cómo llegué a esto')", () => {
  it("flattens tool parts across messages with toolName, state, input and output", () => {
    const messages = [
      fakeMessage("assistant", [
        {
          type: "tool-buscar_especialidad",
          toolCallId: "t1",
          state: "output-available",
          input: { sintoma: "me duele la rodilla" },
          output: { resultados: [] },
        },
      ]),
    ];
    expect(extractToolTrace(messages)).toEqual([
      {
        toolCallId: "t1",
        toolName: "buscar_especialidad",
        state: "output-available",
        input: { sintoma: "me duele la rodilla" },
        output: { resultados: [] },
      },
    ]);
  });

  it("skips non-tool parts", () => {
    const messages = [fakeMessage("assistant", [{ type: "text", text: "hola" }])];
    expect(extractToolTrace(messages)).toEqual([]);
  });
});
