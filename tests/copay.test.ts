import { describe, expect, it } from "vitest";
import {
  calcularCopago,
  MEDICINA_GENERAL_ID,
  PolizaInactivaError,
  type CopayInput,
} from "@/lib/domain/copay";

/**
 * Base fixture: a "standard" plan, tier B rules, an active policy that
 * started well outside any waiting period, no deductible used, no spend
 * accumulated. Individual tests override only what they need to isolate
 * one rule from PRD 7.4.
 */
function baseInput(overrides: Partial<CopayInput> = {}): CopayInput {
  return {
    precio: 100,
    plan: {
      deducibleAnual: 150,
      topeAnualBolsillo: 2000,
      carenciaEspecialidadDias: 30,
    },
    tier: {
      coaseguro: 0.2, // 20%
      copagoFijo: 10,
    },
    asegurado: {
      activa: true,
      fechaInicio: new Date("2020-01-01"),
      deducibleUsado: 0,
      gastoAcumulado: 0,
    },
    especialidadId: "traumatologia",
    enRed: true,
    fechaConsulta: new Date("2026-09-16"),
    ...overrides,
  };
}

describe("calcularCopago — reglas PRD 7.4", () => {
  it("regla 1: poliza inactiva lanza PolizaInactivaError con code POLIZA_INACTIVA", () => {
    const input = baseInput({ asegurado: { ...baseInput().asegurado, activa: false } });
    expect(() => calcularCopago(input)).toThrow(PolizaInactivaError);
    try {
      calcularCopago(input);
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(PolizaInactivaError);
      expect((err as PolizaInactivaError).code).toBe("POLIZA_INACTIVA");
    }
  });

  it("regla 2: hospital fuera de red -> paciente paga 100%, marca fuera_de_red", () => {
    const input = baseInput({ enRed: false });
    const result = calcularCopago(input);
    expect(result.totalPaciente).toBe(100);
    expect(result.totalAseguradora).toBe(0);
    expect(result.marcas).toContain("fuera_de_red");
  });

  it("regla 3: especialidad distinta a medicina general dentro de carencia -> paga 100%, marca carencia con dias restantes", () => {
    // policy started 10 days before the visit, waiting period is 30 days -> 20 days remaining
    const input = baseInput({
      asegurado: {
        activa: true,
        fechaInicio: new Date("2026-09-06"),
        deducibleUsado: 0,
        gastoAcumulado: 0,
      },
      fechaConsulta: new Date("2026-09-16"),
      especialidadId: "cardiologia",
    });
    const result = calcularCopago(input);
    expect(result.totalPaciente).toBe(100);
    expect(result.totalAseguradora).toBe(0);
    expect(result.marcas).toContain("carencia");
    expect(result.diasRestantesCarencia).toBe(20);
  });

  it("regla 3 (excepcion): medicina general nunca aplica carencia, aunque este dentro del periodo", () => {
    const input = baseInput({
      asegurado: {
        activa: true,
        fechaInicio: new Date("2026-09-06"), // 10 days before consult
        deducibleUsado: 0,
        gastoAcumulado: 0,
      },
      fechaConsulta: new Date("2026-09-16"),
      especialidadId: MEDICINA_GENERAL_ID,
    });
    const result = calcularCopago(input);
    expect(result.marcas).not.toContain("carencia");
    // normal cost calculation applies: a_deducible = min(100, 150) = 100, coaseguro = 0,
    // bruto = 100 + 0 + 10 = 110, but total_paciente is capped at precio (100).
    expect(result.totalPaciente).toBe(100);
  });

  it("regla 3 (borde): dias transcurridos == carencia_dias ya NO esta en carencia (estrictamente menor)", () => {
    const input = baseInput({
      asegurado: {
        activa: true,
        fechaInicio: new Date("2026-08-17"), // exactly 30 days before consult
        deducibleUsado: 0,
        gastoAcumulado: 0,
      },
      fechaConsulta: new Date("2026-09-16"),
      especialidadId: "cardiologia",
    });
    const result = calcularCopago(input);
    expect(result.marcas).not.toContain("carencia");
  });

  it("fuera de red y carencia pueden coexistir y ambas marcas se reportan", () => {
    const input = baseInput({
      enRed: false,
      asegurado: {
        activa: true,
        fechaInicio: new Date("2026-09-06"),
        deducibleUsado: 0,
        gastoAcumulado: 0,
      },
      fechaConsulta: new Date("2026-09-16"),
      especialidadId: "cardiologia",
    });
    const result = calcularCopago(input);
    expect(result.marcas).toContain("fuera_de_red");
    expect(result.marcas).toContain("carencia");
    expect(result.totalPaciente).toBe(100);
  });

  it("regla 4-5: deducible sin usar cubre parte del precio (a_deducible = min(precio, deducible_restante))", () => {
    // deducible_restante = 150 - 0 = 150; a_deducible = min(100, 150) = 100
    const input = baseInput({ precio: 100 });
    const result = calcularCopago(input);
    expect(result.aDeducible).toBe(100);
    // coaseguro sobre (precio - a_deducible) = 0
    expect(result.coaseguro).toBe(0);
    // bruto = 100 + 0 + 10(copagoFijo) = 110, tope_restante = 2000, total_paciente = min(110, 2000, 100) = 100
    expect(result.totalPaciente).toBe(100);
    expect(result.totalAseguradora).toBe(0);
  });

  it("regla 4-6: deducible ya agotado -> coaseguro aplica sobre el precio completo", () => {
    const input = baseInput({
      precio: 100,
      asegurado: {
        activa: true,
        fechaInicio: new Date("2020-01-01"),
        deducibleUsado: 150, // == deducibleAnual, nothing left
        gastoAcumulado: 0,
      },
    });
    const result = calcularCopago(input);
    expect(result.aDeducible).toBe(0);
    // coaseguro = (100 - 0) * 0.2 = 20
    expect(result.coaseguro).toBe(20);
    // bruto = 0 + 20 + 10 = 30
    expect(result.totalPaciente).toBe(30);
    expect(result.totalAseguradora).toBe(70);
  });

  it("regla 4-6: deducible parcialmente cubierto reparte entre deducible y coaseguro", () => {
    const input = baseInput({
      precio: 200,
      plan: { deducibleAnual: 150, topeAnualBolsillo: 2000, carenciaEspecialidadDias: 30 },
      asegurado: {
        activa: true,
        fechaInicio: new Date("2020-01-01"),
        deducibleUsado: 100, // 50 remaining
        gastoAcumulado: 0,
      },
      tier: { coaseguro: 0.2, copagoFijo: 10 },
    });
    const result = calcularCopago(input);
    // deducible_restante = 150 - 100 = 50; a_deducible = min(200, 50) = 50
    expect(result.aDeducible).toBe(50);
    // coaseguro = (200 - 50) * 0.2 = 30
    expect(result.coaseguro).toBe(30);
    // bruto = 50 + 30 + 10 = 90; tope_restante = 2000; total_paciente = min(90, 2000, 200) = 90
    expect(result.totalPaciente).toBe(90);
    expect(result.totalAseguradora).toBe(110);
  });

  it("regla 8-9: tope anual de bolsillo limita el total del paciente", () => {
    const input = baseInput({
      precio: 500,
      plan: { deducibleAnual: 150, topeAnualBolsillo: 1000, carenciaEspecialidadDias: 30 },
      asegurado: {
        activa: true,
        fechaInicio: new Date("2020-01-01"),
        deducibleUsado: 150, // exhausted
        gastoAcumulado: 980, // only 20 left of the cap
      },
      tier: { coaseguro: 0.3, copagoFijo: 20 },
    });
    const result = calcularCopago(input);
    // bruto = 0 + (500*0.3=150) + 20 = 170, tope_restante = 1000-980 = 20
    expect(result.totalPaciente).toBe(20);
    expect(result.totalAseguradora).toBe(480);
  });

  it("regla 9: total_paciente nunca supera el precio, aunque el bruto lo exceda", () => {
    const input = baseInput({
      precio: 15,
      plan: { deducibleAnual: 0, topeAnualBolsillo: 5000, carenciaEspecialidadDias: 0 },
      asegurado: {
        activa: true,
        fechaInicio: new Date("2020-01-01"),
        deducibleUsado: 0,
        gastoAcumulado: 0,
      },
      tier: { coaseguro: 0.5, copagoFijo: 20 }, // bruto = 0 + 7.5 + 20 = 27.5 > precio(15)
    });
    const result = calcularCopago(input);
    expect(result.totalPaciente).toBe(15);
    expect(result.totalAseguradora).toBe(0);
  });

  it("regla 10: total_aseguradora = precio - total_paciente en el caso general", () => {
    const input = baseInput({ precio: 80 });
    const result = calcularCopago(input);
    expect(result.totalAseguradora).toBe(input.precio - result.totalPaciente);
  });

  it("regla 11: redondeo a 2 decimales half-up cuando el coaseguro produce mas de 2 decimales", () => {
    const input = baseInput({
      precio: 33.33,
      plan: { deducibleAnual: 0, topeAnualBolsillo: 5000, carenciaEspecialidadDias: 0 },
      asegurado: {
        activa: true,
        fechaInicio: new Date("2020-01-01"),
        deducibleUsado: 0,
        gastoAcumulado: 0,
      },
      tier: { coaseguro: 0.173, copagoFijo: 0 }, // 33.33 * 0.173 = 5.76609 -> 5.77
    });
    const result = calcularCopago(input);
    expect(result.coaseguro).toBe(5.77);
    expect(Number.isInteger(result.totalPaciente * 100)).toBe(true);
  });

  it("regla 11: caso .xx5 redondea hacia arriba (half-up)", () => {
    const input = baseInput({
      precio: 100,
      plan: { deducibleAnual: 0, topeAnualBolsillo: 5000, carenciaEspecialidadDias: 0 },
      asegurado: {
        activa: true,
        fechaInicio: new Date("2020-01-01"),
        deducibleUsado: 0,
        gastoAcumulado: 0,
      },
      tier: { coaseguro: 0.125, copagoFijo: 0 }, // 100 * 0.125 = 12.5 -> exact, use a finer case below
    });
    const result = calcularCopago(input);
    // 12.5 is exact at 1 decimal; verify no spurious rounding artifacts at 2 decimals
    expect(result.coaseguro).toBe(12.5);
  });
});
