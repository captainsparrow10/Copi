import { describe, expect, it } from "vitest";
import { pickRecommended } from "@/lib/domain/recommend";

describe("pickRecommended", () => {
  it("skips a cheaper out-of-network option and picks the cheapest in-network one", () => {
    const opciones = [
      { hospital: "Fuera de Red", marcas: ["fuera_de_red"] },
      { hospital: "En Red Barato", marcas: [] },
      { hospital: "En Red Caro", marcas: [] },
    ];
    expect(pickRecommended(opciones)).toBe("En Red Barato");
  });

  it("keeps in-network options that carry other marks such as carencia", () => {
    const opciones = [{ hospital: "En Red", marcas: ["carencia"] }];
    expect(pickRecommended(opciones)).toBe("En Red");
  });

  it("returns null when every option is out of network", () => {
    expect(pickRecommended([{ hospital: "Fuera", marcas: ["fuera_de_red"] }])).toBeNull();
  });

  it("returns null when there are no options", () => {
    expect(pickRecommended([])).toBeNull();
  });
});
