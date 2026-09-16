/**
 * Amount validator (PRD 7.8 layer 6).
 *
 * Every dollar figure the LLM writes in its prose must trace back to a
 * number the tools actually returned this turn — the model must never
 * calculate, round, or invent a number. This runs AFTER `streamText`
 * finishes (lib/agent/run.ts step 6) against the final text and the turn's
 * accumulated tool results.
 *
 * Regex scope/limits (documented, not over-engineered for a hackathon):
 * - Matches `$`-prefixed numbers with 0-2 decimals (`$45`, `$45.00`) and
 *   bare numbers that already contain a decimal point (`45.00`, `62.5`
 *   would not match — 1-2 fraction digits only, which covers money).
 * - Deliberately does NOT match bare integers with no `$` and no decimal
 *   point (e.g. "20 días restantes de carencia") — those are not
 *   money-shaped and would cause false positives on day counts, scores,
 *   tier letters, etc.
 * - Thousands separators (`1,234.00`) are out of scope; seed data / demo
 *   prices never reach four figures.
 */

export interface AmountValidationResult {
  valid: boolean;
  invalidAmounts: string[];
}

const AMOUNT_REGEX = /\$\s?\d+(?:\.\d{1,2})?|\b\d+\.\d{1,2}\b/g;

/** Recursively collects every finite number found anywhere in `value`. */
function collectNumbers(value: unknown, acc: Set<number>): void {
  if (typeof value === "number") {
    if (Number.isFinite(value)) acc.add(value);
    return;
  }
  if (typeof value === "string") {
    // Tool results may carry amounts as numeric strings (e.g. from numeric
    // DB columns before `Number(...)` normalization elsewhere) — cheap to
    // accept both without weakening the check.
    if (value.trim() !== "" && Number.isFinite(Number(value))) acc.add(Number(value));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectNumbers(item, acc);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) collectNumbers(item, acc);
  }
}

function roundTo2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Validates that every money-shaped amount in `responseText` exists among
 * the numbers found anywhere in `toolResults` for the same turn.
 */
export function validateAmounts(responseText: string, toolResults: unknown[]): AmountValidationResult {
  const toolNumbers = new Set<number>();
  collectNumbers(toolResults, toolNumbers);
  const roundedToolNumbers = new Set(Array.from(toolNumbers, roundTo2));

  const invalidAmounts: string[] = [];
  for (const match of responseText.matchAll(AMOUNT_REGEX)) {
    const stripped = match[0].replace(/^\$\s?/, "");
    const parsed = roundTo2(Number(stripped));
    if (!roundedToolNumbers.has(parsed)) {
      invalidAmounts.push(stripped);
    }
  }

  return { valid: invalidAmounts.length === 0, invalidAmounts };
}
