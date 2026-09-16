/**
 * Citation validator (PRD 7.8 layer 7, P1).
 *
 * Every `[C-x.y]` / `[G-x]` citation the LLM writes must correspond to a
 * fragment id the tools actually returned this turn (`fragmento_id` from
 * `buscar_especialidad`, `id` from `buscar_en_poliza`) — never a fragment
 * id the model recalls or invents. Runs alongside the amount validator
 * (lib/agent/run.ts step 6).
 */

export interface CitationValidationResult {
  valid: boolean;
  invalidCitations: string[];
}

const CITATION_REGEX = /\[(C-\d+\.\d+|G-\d+)\]/g;
const FRAGMENT_ID_PATTERN = /^(C-\d+\.\d+|G-\d+)$/;

/** Recursively collects every string in `value` that looks like a fragment id. */
function collectFragmentIds(value: unknown, acc: Set<string>): void {
  if (typeof value === "string") {
    if (FRAGMENT_ID_PATTERN.test(value)) acc.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectFragmentIds(item, acc);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) collectFragmentIds(item, acc);
  }
}

/**
 * Validates that every `[C-x.y]` / `[G-x]` citation in `responseText` exists
 * among the fragment ids found anywhere in `toolResults` for the same turn.
 */
export function validateCitations(responseText: string, toolResults: unknown[]): CitationValidationResult {
  const knownIds = new Set<string>();
  collectFragmentIds(toolResults, knownIds);

  const invalidCitations: string[] = [];
  for (const match of responseText.matchAll(CITATION_REGEX)) {
    const id = match[1];
    if (!knownIds.has(id)) {
      invalidCitations.push(id);
    }
  }

  return { valid: invalidCitations.length === 0, invalidCitations };
}
