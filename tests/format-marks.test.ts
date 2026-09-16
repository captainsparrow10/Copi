import { describe, expect, it } from "vitest";
import { carenciaLabel, markLabel, optionStatusLines } from "@/lib/format/marks";

describe("markLabel (PRD 7.4/7.5 marcas[] + Phase 4 'tope' addition)", () => {
  it("labels fuera_de_red as destructive", () => {
    expect(markLabel("fuera_de_red")).toEqual({ label: "Fuera de la red", tone: "destructive" });
  });

  it("labels carencia as warning", () => {
    expect(markLabel("carencia")).toEqual({ label: "En período de carencia", tone: "warning" });
  });

  it("labels tope as info", () => {
    expect(markLabel("tope")).toEqual({ label: "Tope de bolsillo alcanzado", tone: "info" });
  });

  it("falls back to the raw mark for an unknown value, instead of dropping it", () => {
    expect(markLabel("algo_nuevo")).toEqual({ label: "algo_nuevo", tone: "info" });
  });
});

describe("carenciaLabel", () => {
  it("pluralizes days correctly", () => {
    expect(carenciaLabel(1)).toBe("En carencia: 1 día restante");
    expect(carenciaLabel(20)).toBe("En carencia: 20 días restantes");
  });

  it("falls back to a generic label when days are unknown", () => {
    expect(carenciaLabel(undefined)).toBe("En período de carencia");
  });
});

describe("optionStatusLines — what each hospital row says about itself", () => {
  it("keeps the recommendation visible when the option is also in carencia", () => {
    // Browser finding: San Rafael (recommended, in carencia) lost "La opción más económica de tu red".
    expect(optionStatusLines(["carencia"], true)).toEqual([
      { text: "La opción más económica de tu red", tone: "recommended" },
      { text: "En carencia · pagas el total", tone: "muted" },
    ]);
  });

  it("never calls an out-of-network option recommended", () => {
    expect(optionStatusLines(["fuera_de_red", "carencia"], true)).toEqual([
      { text: "Fuera de tu red · no lo cubre tu plan", tone: "danger" },
    ]);
  });

  it("describes the cap and returns nothing for a plain option", () => {
    expect(optionStatusLines(["tope"], false)).toEqual([
      { text: "Llegas a tu tope anual con esta consulta", tone: "muted" },
    ]);
    expect(optionStatusLines([], false)).toEqual([]);
  });
});
