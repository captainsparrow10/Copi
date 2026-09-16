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
 * - Thousands separators are in scope in two shapes seen in the seed data
 *   / plan docs: US-style comma-grouped with a 2-decimal tail (`$1,000.00`)
 *   and bare dot-grouped with exactly 3 digits after the dot and nothing
 *   before/after it (`1.000` meaning one thousand) — the latter would
 *   otherwise be indistinguishable from a 3-decimal amount, which this
 *   domain never produces, so it's always read as thousands.
 * - `[C-x.y]` / `[G-n]` citation ids are stripped (bracket contents removed)
 *   before scanning for amounts, on both the response text and any prose
 *   tool-output string, so a citation like `[C-19.1]` is never misread as
 *   the amount `19.1`.
 */

export interface AmountValidationResult {
  valid: boolean;
  invalidAmounts: string[];
}

// Order matters: for a given start position, alternatives are tried
// left-to-right, so the thousands-separated forms must come before their
// shorter plain-number counterparts or the engine would stop at the first
// (shorter) alternative that matches.
const AMOUNT_REGEX =
  /\$\s?\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\$\s?\d{1,3}\.\d{3}\b(?!\d)|\$\s?\d+(?:\.\d{1,2})?|\b\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?\b|\b\d{1,3}\.\d{3}\b(?!\d)|\b\d+\.\d{1,2}\b/g;

/** Removes `[...]` citation tokens (e.g. `[C-19.1]`, `[G-12]`) so their ids are never read as amounts. */
function stripCitations(text: string): string {
  return text.replace(/\[[^\]]*\]/g, " ");
}

function roundTo2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Parses one `AMOUNT_REGEX` match into its numeric value, handling both
 * thousands-separator shapes documented above.
 */
function parseAmountMatch(rawMatch: string): number {
  const stripped = rawMatch.replace(/^\$\s?/, "");
  if (stripped.includes(",")) {
    return roundTo2(Number(stripped.replace(/,/g, "")));
  }
  if (/^\d{1,3}\.\d{3}$/.test(stripped)) {
    return roundTo2(Number(stripped.replace(".", "")));
  }
  return roundTo2(Number(stripped));
}

/** Every amount found in `text` (citations stripped first), parsed to numbers. */
function extractAmounts(text: string): number[] {
  const withoutCitations = stripCitations(text);
  const amounts: number[] = [];
  for (const match of withoutCitations.matchAll(AMOUNT_REGEX)) {
    amounts.push(parseAmountMatch(match[0]));
  }
  return amounts;
}

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
    if (value.trim() !== "" && Number.isFinite(Number(value))) {
      acc.add(Number(value));
      return;
    }
    // Prose tool-output fields (e.g. `buscar_en_poliza`'s `contenido`, or
    // `buscar_especialidad`'s `razon`) carry amounts embedded in sentences,
    // not as a bare numeric string — e.g. "tope anual de bolsillo de
    // **$1,000.00**". Those must ground the same way a bare numeric column
    // does, using the exact same extraction/normalization as the text side,
    // so a real answer quoting that fragment isn't flagged as unsupported.
    for (const amount of extractAmounts(value)) acc.add(amount);
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

/**
 * Validates that every money-shaped amount in `responseText` exists among
 * the numbers found anywhere in `toolResults` for the same turn.
 */
export function validateAmounts(responseText: string, toolResults: unknown[]): AmountValidationResult {
  const toolNumbers = new Set<number>();
  collectNumbers(toolResults, toolNumbers);
  const roundedToolNumbers = new Set(Array.from(toolNumbers, roundTo2));

  const invalidAmounts: string[] = [];
  const withoutCitations = stripCitations(responseText);
  for (const match of withoutCitations.matchAll(AMOUNT_REGEX)) {
    const stripped = match[0].replace(/^\$\s?/, "");
    const parsed = parseAmountMatch(match[0]);
    if (!roundedToolNumbers.has(parsed)) {
      invalidAmounts.push(stripped);
    }
  }

  return { valid: invalidAmounts.length === 0, invalidAmounts };
}
