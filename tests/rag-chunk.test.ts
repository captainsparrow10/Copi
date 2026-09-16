import { describe, expect, it } from "vitest";
import { parseGuiaEspecialidades, parsePolizaClausulas } from "../lib/rag/chunk";

describe("parseGuiaEspecialidades", () => {
  it("parses one fragment per [G-n] heading with its especialidad and content", () => {
    const markdown = `# Guía de especialidades

Texto introductorio que no es un fragmento.

### [G-1] medicina_general
Malestar general y fiebre baja.

### [G-2] cardiologia
Dolor u opresión leve en el pecho al hacer esfuerzo.
`;

    const fragments = parseGuiaEspecialidades(markdown);

    expect(fragments).toEqual([
      { id: "G-1", especialidadId: "medicina_general", contenido: "Malestar general y fiebre baja." },
      {
        id: "G-2",
        especialidadId: "cardiologia",
        contenido: "Dolor u opresión leve en el pecho al hacer esfuerzo.",
      },
    ]);
  });

  it("drops '---' section dividers from the content instead of treating them as text", () => {
    const markdown = `### [G-1] medicina_general
Primer párrafo.

---

### [G-2] cardiologia
Segundo párrafo.
`;

    const fragments = parseGuiaEspecialidades(markdown);

    expect(fragments[0]?.contenido).toBe("Primer párrafo.");
    expect(fragments[0]?.contenido).not.toContain("---");
  });

  it("joins multi-paragraph content with a blank line", () => {
    const markdown = `### [G-1] pediatria
Primera línea del síntoma.

Segunda línea con más detalle.
`;

    const fragments = parseGuiaEspecialidades(markdown);

    expect(fragments[0]?.contenido).toBe("Primera línea del síntoma.\n\nSegunda línea con más detalle.");
  });

  it("throws on a malformed heading (missing especialidad)", () => {
    const markdown = `### [G-1]
Contenido sin especialidad.
`;

    expect(() => parseGuiaEspecialidades(markdown)).toThrow(/malformed heading/);
  });

  it("throws when a fragment has no content", () => {
    const markdown = `### [G-1] medicina_general

### [G-2] cardiologia
Contenido real.
`;

    expect(() => parseGuiaEspecialidades(markdown)).toThrow(/no content/);
  });

  it("returns no fragments for a document with no headings", () => {
    expect(parseGuiaEspecialidades("# Solo un título\n\nsin fragmentos.")).toEqual([]);
  });
});

describe("parsePolizaClausulas", () => {
  it("parses one fragment per [C-x.y] heading, prefixing the content with its title", () => {
    const markdown = `# Póliza — Plan Básico

### [C-2.1] Deducible anual
El Plan Básico tiene un deducible anual de $300.00.
`;

    const fragments = parsePolizaClausulas(markdown);

    expect(fragments).toEqual([
      {
        id: "C-2.1",
        titulo: "Deducible anual",
        contenido: "Deducible anual\nEl Plan Básico tiene un deducible anual de $300.00.",
      },
    ]);
  });

  it("supports multi-digit clause numbers (C-10.2)", () => {
    const markdown = `### [C-10.2] Cláusula larga
Contenido de la cláusula.
`;
    const fragments = parsePolizaClausulas(markdown);
    expect(fragments[0]?.id).toBe("C-10.2");
  });

  it("throws on a malformed heading (not matching C-x.y)", () => {
    const markdown = `### [C-1] Falta el subnúmero
Contenido.
`;
    expect(() => parsePolizaClausulas(markdown)).toThrow(/malformed heading/);
  });
});
