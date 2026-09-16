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

export type StatusTone = "recommended" | "danger" | "muted";

/**
 * Lines describing a quote option, most important first. Out-of-network wins
 * outright (never recommended); otherwise the recommendation stays visible
 * alongside carencia or cap notes.
 */
export function optionStatusLines(
  marcas: readonly string[],
  isRecommended: boolean,
): { text: string; tone: StatusTone }[] {
  if (marcas.includes("fuera_de_red")) {
    return [{ text: "Fuera de tu red · no lo cubre tu plan", tone: "danger" }];
  }
  const lines: { text: string; tone: StatusTone }[] = [];
  if (isRecommended) lines.push({ text: "La opción más económica de tu red", tone: "recommended" });
  if (marcas.includes("carencia")) lines.push({ text: "En carencia · pagas el total", tone: "muted" });
  if (marcas.includes("tope")) lines.push({ text: "Llegas a tu tope anual con esta consulta", tone: "muted" });
  return lines;
}
