import { describe, expect, it } from "vitest";
import { validateSelection } from "@/lib/domain/quote-selection";
import type { CotizarConsultaSuccess } from "@/lib/domain/quote-types";

const payload: CotizarConsultaSuccess = {
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
      hospital: "Hospital del Istmo Sur",
      tier: "C",
      zona: "La Chorrera",
      precio: 40,
      a_deducible: 0,
      coaseguro: 0,
      copago_fijo: 0,
      total_paciente: 40,
      total_aseguradora: 0,
      marcas: ["fuera_de_red"],
    },
  ],
};

describe("validateSelection — P0 'Elegir una opción'", () => {
  it("accepts a hospital that exists among the quote's options", () => {
    const result = validateSelection(payload, "Centro Medico Las Palmas");
    expect(result.valid).toBe(true);
    expect(result.opcion?.hospital).toBe("Centro Medico Las Palmas");
  });

  it("accepts an out-of-network hospital too (selectable, just warned about)", () => {
    const result = validateSelection(payload, "Hospital del Istmo Sur");
    expect(result.valid).toBe(true);
    expect(result.opcion?.marcas).toContain("fuera_de_red");
  });

  it("rejects a hospital that is not among the quote's options", () => {
    const result = validateSelection(payload, "Hospital Que No Existe");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("HOSPITAL_NO_ENCONTRADO");
    expect(result.opcion).toBeUndefined();
  });

  it("rejects an empty hospital name", () => {
    const result = validateSelection(payload, "");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("HOSPITAL_NO_ENCONTRADO");
  });
});
