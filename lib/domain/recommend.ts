interface RankedOption {
  hospital: string;
  marcas: readonly string[];
}

/**
 * Picks the recommended hospital from options already sorted by patient cost.
 * Per the PRD, only in-network hospitals can be recommended.
 */
export function pickRecommended(opciones: readonly RankedOption[]): string | null {
  return opciones.find((o) => !o.marcas.includes("fuera_de_red"))?.hospital ?? null;
}
