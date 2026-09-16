/**
 * Degenerate-output guard (Phase 5 evals bug 7: ambig-01).
 *
 * `qwen2.5:14b` over the Tailscale/Ollama link has occasionally produced a
 * decoding failure that manifests as the same short token repeated dozens
 * of times (observed: " sourceMapping sourceMapping sourceMapping ..."),
 * instead of either real prose or a clean stream error. That text must
 * never reach the patient as if it were Copi's answer — it fails the same
 * way a leaked tool-call artifact does (lib/guards/tool-syntax-validator.ts)
 * and is checked alongside it in the grounding transform
 * (lib/agent/run.ts step 6).
 *
 * Pure, no I/O.
 */

/** True if the same word repeats consecutively `minRepeats` times or more, a degenerate-decoding signature. */
export function isDegenerateRepetition(text: string, minRepeats = 6): boolean {
  const words = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;

  // Whole-answer special case: the entire response is the same token
  // repeated, with nothing else — observed live as " sourceMapping
  // sourceMapping" (2 repeats), well under `minRepeats`. No legitimate
  // Spanish answer from this agent is just one word repeated with no other
  // content, so this is safe even at just 2 repeats (unlike the sliding
  // window below, which needs a longer run to rule out normal repeated
  // words like "no, no, no puedo confirmar...").
  const unique = new Set(words);
  if (unique.size === 1 && words.length >= 2 && words[0].length >= 3) return true;

  if (words.length < minRepeats) return false;
  let run = 1;
  for (let i = 1; i < words.length; i++) {
    if (words[i] === words[i - 1] && words[i].length >= 3) {
      run++;
      if (run >= minRepeats) return true;
    } else {
      run = 1;
    }
  }
  return false;
}
