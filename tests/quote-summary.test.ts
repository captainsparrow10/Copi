import { describe, expect, it } from "vitest";
import { buildClosingSummary } from "@/lib/domain/quote-summary";
import type { OpcionCotizacion } from "@/lib/domain/quote-types";

const opcion: OpcionCotizacion = {
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
};

const contacto = {
  phone: "+507 800-2674",
  whatsapp: "+507 6000-1234",
  email: "servicioalcliente@copi-demo.example",
  hours: "Lunes a viernes, 8:00 a.m. a 6:00 p.m.",
};

describe("buildClosingSummary — 'Cerrar cotización'", () => {
  it("carries every field the closing screen needs, with the components actually charged", () => {
    const summary = buildClosingSummary({
      quoteId: "3f6a9c1e-1111-2222-3333-444455556666",
      nombre: "Ana Solis",
      plan: "Plan Estándar",
      especialidad: "traumatologia",
      opcion,
      fecha: new Date("2026-09-16T15:00:00.000Z"),
      contacto,
      estado: "abierta",
    });

    expect(summary.paciente).toEqual({ nombre: "Ana Solis", plan: "Plan Estándar" });
    expect(summary.especialidad).toBe("traumatologia");
    expect(summary.hospital).toBe("Centro Medico Las Palmas");
    expect(summary.zona).toBe("Costa del Este");
    expect(summary.tier).toBe("A");
    expect(summary.precio).toBe(55);
    expect(summary.aDeducible).toBe(55);
    expect(summary.coaseguro).toBe(0);
    // The whole $55 went to the deductible, so no fixed copay is actually charged (browser bug: showed $8/$12).
    expect(summary.copagoFijo).toBe(0);
    expect(summary.totalPaciente).toBe(55);
    expect(summary.totalAseguradora).toBe(0);
    expect(summary.marcas).toEqual([]);
    expect(summary.fecha).toBe("2026-09-16T15:00:00.000Z");
    expect(summary.contacto).toEqual(contacto);
  });

  it("builds a short, stable quote reference from the quote id", () => {
    const summary = buildClosingSummary({
      quoteId: "3f6a9c1e-1111-2222-3333-444455556666",
      nombre: "Ana Solis",
      plan: "Plan Estándar",
      especialidad: "traumatologia",
      opcion,
      fecha: new Date("2026-09-16T15:00:00.000Z"),
      contacto,
      estado: "cerrada",
    });
    expect(summary.referencia).toBe("COT-3F6A9C1E");
  });

  it("carries the waiting-period / out-of-network marks through, e.g. for POL-1004's carencia case", () => {
    const enCarencia: OpcionCotizacion = { ...opcion, marcas: ["carencia"], total_paciente: opcion.precio };
    const summary = buildClosingSummary({
      quoteId: "3f6a9c1e-1111-2222-3333-444455556666",
      nombre: "Jorge Ramirez",
      plan: "Plan Básico",
      especialidad: "cardiologia",
      opcion: enCarencia,
      fecha: new Date("2026-09-16T15:00:00.000Z"),
      contacto,
      estado: "cerrada",
    });
    expect(summary.marcas).toEqual(["carencia"]);
  });
});
