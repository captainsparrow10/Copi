/**
 * Emergency phrase filter (PRD Anexo B / 7.8 layer 8).
 *
 * Pure, no I/O: runs on the incoming user message BEFORE any LLM call
 * (lib/agent/run.ts step 4). Matching is a deliberately simple
 * accent-insensitive, case-insensitive SUBSTRING match of each listed
 * phrase against the normalized message — not fuzzy/keyword matching. This
 * is what the PRD asks for ("normaliza texto, busca frases de alarma") and
 * keeps the filter auditable: every match traces back to one literal phrase.
 */

interface AlarmPhrase {
  /** Exact text as written in Anexo B (used verbatim in traces). */
  phrase: string;
  /** The self-harm phrase gets an additional crisis-line addendum below. */
  selfHarm?: boolean;
}

const ALARM_PHRASES: AlarmPhrase[] = [
  { phrase: "Dolor o presión en el pecho" },
  { phrase: "dificultad o falta de aire" },
  { phrase: "desmayo o pérdida de conciencia" },
  { phrase: "convulsión" },
  { phrase: "cara caída, habla arrastrada o pérdida súbita de fuerza" },
  { phrase: "sangrado abundante" },
  { phrase: "vómito o heces con sangre" },
  { phrase: "dolor de cabeza súbito e intenso" },
  { phrase: "reacción alérgica con hinchazón de cara o garganta" },
  { phrase: "fiebre alta en bebé menor de 3 meses" },
  { phrase: "pensamientos de hacerse daño", selfHarm: true },
  { phrase: "accidente grave o golpe fuerte en la cabeza" },
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
  /** The exact Anexo B phrase (original casing/accents) that matched, if any. */
  matchedPhrase?: string;
  /** True only for the self-harm phrase — callers can append SELF_HARM_ADDENDUM. */
  isSelfHarm?: boolean;
}

/** Detects whether `message` contains any Anexo B alarm phrase. */
export function detectEmergency(message: string): EmergencyDetection {
  const normalizedMessage = normalize(message);
  for (const { phrase, selfHarm } of ALARM_PHRASES) {
    if (normalizedMessage.includes(normalize(phrase))) {
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
