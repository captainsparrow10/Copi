/**
 * Emergency filter (PRD Anexo B / 7.8 layer 8).
 *
 * Pure, no I/O: runs on the incoming user message BEFORE any LLM call
 * (lib/agent/run.ts step 4). Text is normalized (lowercase, no diacritics)
 * and checked against each Anexo B category. A category matches on its
 * literal Anexo B phrase OR on any of its patterns, which cover how patients
 * actually describe the symptom ("me falta el aire", "se desmayo"). Every
 * match still traces back to one Anexo B category, keeping the filter auditable.
 * Patterns are intentionally broad: a false positive costs a redirect to 911,
 * a false negative sends an emergency to the quote flow.
 */

interface AlarmCategory {
  /** Exact text as written in Anexo B (used verbatim in traces). */
  phrase: string;
  /** Patterns over normalized text (lowercase, no diacritics). */
  patterns: RegExp[];
  /** The self-harm category gets an additional crisis-line addendum below. */
  selfHarm?: boolean;
  /**
   * Extra matcher evaluated independently of `patterns`/`phrase`. Used when a
   * category needs a positive pattern gated by a negative condition (e.g. the
   * allergic-swelling category below excluding dermatological mentions) —
   * something a single regex alternation can't express cleanly.
   */
  extraMatch?: (normalizedMessage: string) => boolean;
}

// Spanish stem-changing verbs (e -> ie, o -> ue, etc.) don't share a prefix
// between their infinitive/noun form and their conjugated forms — "apretar"
// conjugates to "aprieta"/"aprietan" (stem "apriet-"), not "apreta". A plain
// `apret\w*` prefix regex silently misses every conjugated form. Each
// alternation below lists both the regular stem and the stem-changed one
// instead of relying on a single prefix to cover all conjugations.
const ALARM_CATEGORIES: AlarmCategory[] = [
  {
    phrase: "Dolor o presión en el pecho",
    patterns: [
      /\b(dolor|dol\w*|duele\w*|presion|opresion|apriet\w*|apret\w*|punzada)\b[^.?!]{0,30}\bpecho\b/,
      /\bpecho\b[^.?!]{0,20}\b(duele\w*|dolor|dol\w*|apriet\w*|apret\w*|presion|opresion)\b/,
    ],
  },
  {
    phrase: "dificultad o falta de aire",
    patterns: [
      /\b(falta\w*|dificultad|cuesta|no puedo|no puede)\b[^.?!]{0,20}\b(aire|respir\w*)\b/,
      /\bno respira\w*\b/,
      /\bahog(o|a|ando|andome|andose)\b/,
    ],
  },
  {
    phrase: "desmayo o pérdida de conciencia",
    patterns: [/\bdesmay\w*/, /\bperdi\w* (el |la )?(conocimiento|conciencia|sentido)\b/, /\binconsciente\b/],
  },
  {
    phrase: "convulsión",
    patterns: [/\bconvuls\w*/, /\bataque epilep\w*/],
  },
  {
    phrase: "cara caída, habla arrastrada o pérdida súbita de fuerza",
    patterns: [
      /\bcara (caida|torcida|chueca|paralizada)\b/,
      /\bhabla (arrastrada|enredada|trabada)\b/,
      /\bno (puedo|puede) (hablar|mover (el|la|un|una|medio) (brazo|pierna|lado|cuerpo|cara))\b/,
      /\bperdida subita de fuerza\b/,
      /\bderrame cerebral\b/,
    ],
  },
  {
    phrase: "sangrado abundante",
    patterns: [
      /\bsangrado (abundante|fuerte|que no para)\b/,
      /\bsangr\w* (mucho|demasiado|sin parar)\b/,
      /\bno (para|deja) de sangrar\b/,
      /\bhemorragia\b/,
    ],
  },
  {
    phrase: "vómito o heces con sangre",
    patterns: [
      /\b(vomit\w*|heces|popo|caca|evacu\w*|defec\w*)\b[^.?!]{0,20}\bsangre\b/,
      /\bsangre\b[^.?!]{0,20}\b(vomit\w*|heces|popo)\b/,
    ],
  },
  {
    phrase: "dolor de cabeza súbito e intenso",
    patterns: [
      /\bdolor de cabeza\b[^.?!]{0,30}\b(subito|repentino|de repente|intens\w*|insoportable|muy fuerte)\b/,
      /\b(peor|insoportable|repentino|subito) dolor de cabeza\b/,
    ],
  },
  {
    // "cara" is split out of the main patterns below (via `extraMatch`)
    // because it's ambiguous with dermatological mentions ("espinillas
    // inflamadas en la cara" is acne, not an allergic reaction) — garganta/
    // labios/lengua/parpados don't have that ambiguity and stay in the
    // regular patterns so they're never suppressed by a dermatology mention.
    phrase: "reacción alérgica con hinchazón de cara o garganta",
    patterns: [
      /\b(hinch\w*|inflam\w*)\b[^.?!]{0,25}\b(garganta|labios|lengua|parpados)\b/,
      /\b(garganta|labios|lengua|parpados)\b[^.?!]{0,10}\b(hinch\w*|inflam\w*)\b/,
      /\bse me cierra la garganta\b/,
      /\banafila\w*/,
    ],
    extraMatch: (msg) => {
      const isAcneContext = /\b(acne|espinill\w*|granos?|barros?)\b/.test(msg);
      if (isAcneContext) return false;
      return (
        /\b(hinch\w*|inflam\w*)\b[^.?!]{0,25}\bcara\b/.test(msg) ||
        /\bcara\b[^.?!]{0,10}\b(hinch\w*|inflam\w*)\b/.test(msg)
      );
    },
  },
  {
    phrase: "fiebre alta en bebé menor de 3 meses",
    patterns: [
      /\b(bebe|recien nacid\w*)\b[^.?!]{0,40}\bfiebre\b/,
      /\bfiebre\b[^.?!]{0,40}\b(bebe|recien nacid\w*)\b/,
    ],
  },
  {
    phrase: "pensamientos de hacerse daño",
    selfHarm: true,
    patterns: [
      /\b(hacerme|hacerse|me quiero hacer|me voy a hacer) dano\b/,
      /\bsuicid\w*/,
      /\b(quitarme la vida|matarme|no quiero vivir|acabar con mi vida)\b/,
    ],
  },
  {
    phrase: "accidente grave o golpe fuerte en la cabeza",
    patterns: [
      /\baccidente grave\b/,
      /\b(golpe\w*|pegue|pego)\b[^.?!]{0,20}\b(fuerte|duro)\b[^.?!]{0,20}\bcabeza\b/,
      /\b(golpe\w*|pegue|pego)\b[^.?!]{0,20}\bcabeza\b[^.?!]{0,20}\b(fuerte|duro|sangr\w*|desmay\w*|vomit\w*|marea\w*)/,
      /\batropell\w*/,
    ],
  },
];

/** Fixed response text (PRD Anexo B, verbatim). */
export const EMERGENCY_RESPONSE =
  "Lo que describes puede ser una emergencia. Acude de inmediato a la sala de urgencias más cercana o llama al 911. No esperes a cotizar.";

/**
 * Crisis-line addendum for the self-harm phrase specifically (Anexo B: "Para
 * pensamientos de autolesión, añadir línea de apoyo en crisis vigente en
 * Panamá"). The PRD itself marks the actual number as unverified — we
 * reproduce that pending marker verbatim instead of inventing a number.
 */
export const SELF_HARM_ADDENDUM =
  "Línea de apoyo en crisis en Panamá: [Pendiente: verificar número oficial].";

/** Lowercases and strips diacritics so accented/unaccented input match the same way. */
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export interface EmergencyDetection {
  isEmergency: boolean;
  /** The Anexo B category phrase (original casing/accents) that matched, if any. */
  matchedPhrase?: string;
  /** True only for the self-harm phrase — callers can append SELF_HARM_ADDENDUM. */
  isSelfHarm?: boolean;
}

/** Detects whether `message` describes any Anexo B alarm, verbatim or in patient phrasing. */
export function detectEmergency(message: string): EmergencyDetection {
  const normalizedMessage = normalize(message);
  for (const { phrase, patterns, selfHarm, extraMatch } of ALARM_CATEGORIES) {
    const matches =
      normalizedMessage.includes(normalize(phrase)) ||
      patterns.some((pattern) => pattern.test(normalizedMessage)) ||
      (extraMatch ? extraMatch(normalizedMessage) : false);
    if (matches) {
      return { isEmergency: true, matchedPhrase: phrase, isSelfHarm: selfHarm ?? false };
    }
  }
  return { isEmergency: false };
}

/** Builds the full fixed response text for a given detection, including the self-harm addendum when relevant. */
export function buildEmergencyResponse(detection: EmergencyDetection): string {
  if (detection.isSelfHarm) {
    return `${EMERGENCY_RESPONSE} ${SELF_HARM_ADDENDUM}`;
  }
  return EMERGENCY_RESPONSE;
}
