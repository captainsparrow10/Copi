/**
 * UI labels for `cotizar_consulta` option marks (PRD 7.4/7.5 `marcas[]`:
 * `fuera_de_red`, `carencia`, and the Phase 4 addition `tope` — see
 * lib/domain/copay.ts). Pure mapping so components/QuoteCard.tsx stays
 * presentational and the labels are unit-testable without rendering React.
 */

export type MarkTone = "destructive" | "warning" | "info";

export interface MarkLabel {
  label: string;
  tone: MarkTone;
}

const MARK_LABELS: Record<string, MarkLabel> = {
  fuera_de_red: { label: "Fuera de la red", tone: "destructive" },
  carencia: { label: "En período de carencia", tone: "warning" },
  tope: { label: "Tope de bolsillo alcanzado", tone: "info" },
};

/** Looks up the display label/tone for a `cotizar_consulta` mark. Unknown marks fall back to a neutral badge instead of being dropped, so a future mark never silently disappears from the UI. */
export function markLabel(mark: string): MarkLabel {
  return MARK_LABELS[mark] ?? { label: mark, tone: "info" };
}

/** Builds the "En carencia: N días restantes" copy (PRD 6.4). */
export function carenciaLabel(diasRestantes: number | undefined): string {
  if (diasRestantes === undefined) return "En período de carencia";
  return `En carencia: ${diasRestantes} día${diasRestantes === 1 ? "" : "s"} restante${diasRestantes === 1 ? "" : "s"}`;
}
