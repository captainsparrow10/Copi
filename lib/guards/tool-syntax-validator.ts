/**
 * Tool-call syntax leak guard (PRD 7.8 grounding layers, Phase 5 evals bug
 * 4a: clear-08, mark-fueradered-01, rag-02, ambig-04).
 *
 * `qwen2.5:14b` occasionally fails to emit a real tool call and instead
 * writes the tool-call syntax as plain assistant prose — e.g. a stray
 * `_icall_ {...} _ical_` marker (an artifact of some Qwen chat templates),
 * a literal `<tool_call>...</tool_call>` block, or a raw
 * `{"name": "...", "arguments": {...}}` JSON blob. None of that is meant
 * for the patient: it must never reach the client as if it were the
 * assistant's answer.
 *
 * Pure, no I/O — runs alongside the amount/citation validators in the
 * grounding transform (lib/agent/run.ts step 6), against the same buffered
 * per-step text.
 */

const TOOL_SYNTAX_PATTERNS: RegExp[] = [
  // Qwen-style pseudo-tool-call markers.
  /_icall_/i,
  /_ical_/i,
  // Generic <tool_call> / <tool_call/> XML-ish markers some chat templates use.
  /<\s*\/?\s*tool_call\s*>/i,
  // A raw tool-call JSON blob leaked as text: {"name": "...", "arguments": {...}}.
  /\{\s*"name"\s*:\s*"[a-zA-Z0-9_]+"\s*,\s*"arguments"\s*:/,
];

/** True if `text` contains a leaked raw tool-call artifact instead of natural-language prose. */
export function containsToolCallArtifact(text: string): boolean {
  return TOOL_SYNTAX_PATTERNS.some((pattern) => pattern.test(text));
}
