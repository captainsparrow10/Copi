import { describe, expect, it } from "vitest";
import { buildPatientProfile, type ProfileInput } from "@/lib/domain/profile";

const base: ProfileInput = {
  poliza: "POL-1001",
  nombre: "Ana Solis",
  activa: true,
  fechaInicio: new Date("2023-01-15T00:00:00Z"),
  deducibleUsado: 0,
  gastoAcumulado: 0,
  plan: { id: "estandar", nombre: "Plan Estandar", deducibleAnual: 150, topeAnualBolsillo: 2000, carenciaEspecialidadDias: 0 },
  tiers: [
    { tier: "C", coaseguro: 0.15, copagoFijo: 8 },
    { tier: "A", coaseguro: 0.25, copagoFijo: 12 },
    { tier: "B", coaseguro: 0.2, copagoFijo: 10 },
  ],
  today: new Date("2026-09-16T12:00:00Z"),
};

describe("buildPatientProfile", () => {
  it("computes remaining deductible and out-of-pocket cap with progress percentages", () => {
    const profile = buildPatientProfile({ ...base, deducibleUsado: 50, gastoAcumulado: 500 });
    expect(profile.deducible).toEqual({ anual: 150, usado: 50, restante: 100, porcentajeUsado: 33 });
    expect(profile.tope).toEqual({ anual: 2000, gastado: 500, restante: 1500, porcentajeUsado: 25 });
  });

  it("never reports negative remaining amounts or more than 100%", () => {
    const profile = buildPatientProfile({ ...base, deducibleUsado: 200, gastoAcumulado: 2500 });
    expect(profile.deducible.restante).toBe(0);
    expect(profile.deducible.porcentajeUsado).toBe(100);
    expect(profile.tope.restante).toBe(0);
    expect(profile.tope.porcentajeUsado).toBe(100);
  });

  it("lists tiers A, B, C in order with coinsurance as a percentage", () => {
    const profile = buildPatientProfile(base);
    expect(profile.tiers).toEqual([
      { tier: "A", coaseguroPorcentaje: 25, copagoFijo: 12 },
      { tier: "B", coaseguroPorcentaje: 20, copagoFijo: 10 },
      { tier: "C", coaseguroPorcentaje: 15, copagoFijo: 8 },
    ]);
  });

  it("reports the waiting period with the days left, like obtener_resumen_plan", () => {
    const profile = buildPatientProfile({
      ...base,
      plan: { ...base.plan, carenciaEspecialidadDias: 30 },
      fechaInicio: new Date("2026-09-06T12:00:00Z"),
    });
    expect(profile.carencia).toEqual({ dias: 30, enCarencia: true, diasRestantes: 20 });
  });

  it("explains the untouched deductible for a new patient", () => {
    const profile = buildPatientProfile(base);
    expect(profile.enTuCaso.join(" ")).toMatch(/deducible/i);
    expect(profile.enTuCaso.join(" ")).toMatch(/\$150\.00/);
  });

  it("warns about an inactive policy first", () => {
    const profile = buildPatientProfile({ ...base, activa: false });
    expect(profile.activa).toBe(false);
    expect(profile.enTuCaso[0]).toMatch(/inactiva/i);
  });

  it("warns about the waiting period for specialists", () => {
    const profile = buildPatientProfile({
      ...base,
      plan: { ...base.plan, carenciaEspecialidadDias: 30 },
      fechaInicio: new Date("2026-09-06T12:00:00Z"),
    });
    expect(profile.enTuCaso.join(" ")).toMatch(/carencia[^.]*20 d[ií]as/i);
  });

  it("highlights a nearly reached out-of-pocket cap", () => {
    const profile = buildPatientProfile({
      ...base,
      plan: { ...base.plan, deducibleAnual: 0, topeAnualBolsillo: 1000 },
      gastoAcumulado: 995,
    });
    expect(profile.enTuCaso.join(" ")).toMatch(/tope[^.]*\$5\.00/i);
    // 995 of 1000 must not read as a full bar while $5 are still left.
    expect(profile.tope.porcentajeUsado).toBe(99);
  });
});
