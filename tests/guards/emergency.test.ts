import { describe, expect, it } from "vitest";
import { detectEmergency, EMERGENCY_RESPONSE } from "@/lib/guards/emergency";

/**
 * Verbatim Anexo B phrases (accented or not) embedded in longer messages.
 * Patient paraphrases are covered in the "patient phrasing" suite below.
 */
describe("detectEmergency — Anexo B alarm phrases", () => {
  it("matches chest pain / pressure, embedded in a longer accented message", () => {
    const r = detectEmergency("Buenas, tengo dolor o presión en el pecho desde hace una hora");
    expect(r.isEmergency).toBe(true);
  });

  it("matches difficulty or lack of air, unaccented", () => {
    expect(detectEmergency("siento dificultad o falta de aire desde hace rato").isEmergency).toBe(true);
  });

  it("matches fainting / loss of consciousness, unaccented", () => {
    expect(detectEmergency("mi papa tuvo un desmayo o perdida de conciencia hace un rato").isEmergency).toBe(true);
  });

  it("matches convulsion as a single-word alarm", () => {
    expect(detectEmergency("mi hijo esta con una convulsion ahora mismo").isEmergency).toBe(true);
  });

  it("matches stroke signs (facial droop / slurred speech / sudden weakness)", () => {
    const r = detectEmergency("de repente noto cara caida, habla arrastrada o perdida subita de fuerza en el brazo");
    expect(r.isEmergency).toBe(true);
  });

  it("matches heavy bleeding", () => {
    expect(detectEmergency("tiene un sangrado abundante en la pierna").isEmergency).toBe(true);
  });

  it("matches vomiting or stool with blood, accented", () => {
    expect(detectEmergency("tuvo vómito o heces con sangre esta mañana").isEmergency).toBe(true);
  });

  it("matches sudden and intense headache", () => {
    expect(detectEmergency("le dio un dolor de cabeza súbito e intenso hace unos minutos").isEmergency).toBe(true);
  });

  it("matches allergic reaction with face/throat swelling", () => {
    const r = detectEmergency("tiene una reacción alérgica con hinchazón de cara o garganta");
    expect(r.isEmergency).toBe(true);
  });

  it("matches high fever in a baby under 3 months", () => {
    expect(detectEmergency("es un caso de fiebre alta en bebé menor de 3 meses, que hago").isEmergency).toBe(true);
  });

  it("matches thoughts of self-harm", () => {
    expect(detectEmergency("he tenido pensamientos de hacerse daño últimamente").isEmergency).toBe(true);
  });

  it("matches a serious accident or strong head blow", () => {
    expect(detectEmergency("tuvo un accidente grave o golpe fuerte en la cabeza jugando futbol").isEmergency).toBe(
      true,
    );
  });

  it("is case-insensitive", () => {
    expect(detectEmergency("SANGRADO ABUNDANTE en la nariz").isEmergency).toBe(true);
  });

  it("is accent-insensitive on both the stored phrase and the incoming text", () => {
    expect(detectEmergency("sintoma: dolor o presion en el pecho").isEmergency).toBe(true);
  });

  it("matches as a substring within a longer, noisier message", () => {
    const msg =
      "Hola buenas tardes, desde ayer tengo dolor o presión en el pecho y estoy preocupado, que hago?";
    expect(detectEmergency(msg).isEmergency).toBe(true);
  });

  it("does NOT flag an unrelated knee complaint (near-miss, no false positive)", () => {
    expect(detectEmergency("me duele la rodilla al subir escaleras").isEmergency).toBe(false);
  });

  it("does NOT flag a mild headache that isn't sudden/intense", () => {
    expect(detectEmergency("tengo un poco de dolor de cabeza leve desde ayer").isEmergency).toBe(false);
  });

  it("does NOT flag general tiredness or mild discomfort", () => {
    expect(detectEmergency("me siento un poco cansado hoy").isEmergency).toBe(false);
  });

  it("does NOT flag an ordinary fever question unrelated to infants", () => {
    expect(
      detectEmergency("tengo fiebre desde hace dos dias, que especialista me conviene").isEmergency,
    ).toBe(false);
  });

  it("does NOT flag mentioning an accident without a head injury", () => {
    expect(detectEmergency("tuve un accidente de carro leve, sin golpes").isEmergency).toBe(false);
  });

  it("returns the matched phrase for tracing", () => {
    const r = detectEmergency("tengo dolor o presión en el pecho");
    expect(r.isEmergency).toBe(true);
    expect(r.matchedPhrase).toBe("Dolor o presión en el pecho");
  });

  it("returns the matched Anexo B category for patient phrasing too", () => {
    const r = detectEmergency("Tengo dolor de pecho y me falta el aire");
    expect(r.isEmergency).toBe(true);
    expect(r.matchedPhrase).toBe("Dolor o presión en el pecho");
  });

  it("EMERGENCY_RESPONSE is the exact fixed response text from Anexo B", () => {
    expect(EMERGENCY_RESPONSE).toBe(
      "Lo que describes puede ser una emergencia. Acude de inmediato a la sala de urgencias más cercana o llama al 911. No esperes a cotizar.",
    );
  });
});

/**
 * Real patients do not write the Anexo B phrases verbatim. Each category must
 * also catch the way people actually describe it (PRD flow 6.3 example included).
 */
describe("detectEmergency — patient phrasing", () => {
  const alarms: [string, string][] = [
    ["PRD flow 6.3 example", "Tengo dolor de pecho y me falta el aire"],
    ["chest tightness", "siento una opresión en el pecho"],
    ["chest hurts", "me duele mucho el pecho"],
    ["can't breathe", "no puedo respirar bien"],
    ["hard to breathe", "me cuesta respirar desde hace una hora"],
    ["short of breath", "me estoy ahogando"],
    ["fainted", "mi mamá se desmayó en la cocina"],
    ["lost consciousness", "perdió el conocimiento unos segundos"],
    ["seizure", "mi hijo está convulsionando"],
    ["stroke: face droop", "a mi abuelo se le ve la cara torcida"],
    ["stroke: cannot move arm", "de repente no puede mover el brazo derecho"],
    ["bleeding won't stop", "me corté y no para de sangrar"],
    ["hemorrhage", "tiene una hemorragia en la pierna"],
    ["vomiting blood", "estoy vomitando sangre"],
    ["blood in stool", "hice popó con sangre"],
    ["worst headache", "es el peor dolor de cabeza de mi vida"],
    ["sudden headache", "me dio un dolor de cabeza muy fuerte de repente"],
    ["throat swelling", "se me está hinchando la garganta después de comer maní"],
    ["lips swelling", "tengo los labios hinchados y me pica todo"],
    ["newborn fever", "mi bebé de 2 meses tiene fiebre"],
    ["newborn fever weeks", "tengo un recién nacido con fiebre alta"],
    ["self-harm", "quiero hacerme daño"],
    ["suicidal", "estoy pensando en suicidarme"],
    ["head hit hard", "me golpeé muy fuerte la cabeza y estoy mareado"],
    ["run over", "a mi hermano lo atropelló un carro"],
  ];

  it.each(alarms)("flags %s", (_label, message) => {
    expect(detectEmergency(message).isEmergency).toBe(true);
  });

  it("marks suicidal phrasing as self-harm", () => {
    expect(detectEmergency("estoy pensando en suicidarme").isSelfHarm).toBe(true);
  });

  // Regression: "apretar" is an e->ie stem-changing verb — its conjugated
  // forms ("aprieta", "aprietan") don't share the "apret-" prefix the old
  // regex relied on, so they were silently missed (emerg-01, Phase 5 evals).
  it.each([
    ["chest tightness, stem-changed present tense", "siento que me aprieta el pecho y no se me quita"],
    ["chest tightness, plural stem-changed", "el pecho se me aprietan los musculos alrededor"],
    ["chest pain, infinitive of doler", "me tiene que doler el pecho desde ayer"],
    ["can't breathe, present tense respira (no infinitive)", "mi bebe no respira bien"],
  ])("flags %s", (_label, message) => {
    expect(detectEmergency(message).isEmergency).toBe(true);
  });

  const safe: [string, string][] = [
    ["back pain", "me duele la espalda al agacharme"],
    ["cold and cough", "tengo gripe y mucha tos"],
    ["mild headache", "tengo dolor de cabeza desde ayer"],
    ["scraped knee", "me caí y me raspé la rodilla"],
    ["toddler fever", "mi hijo de 4 años tiene fiebre"],
    ["stomach ache", "me duele el estómago después de comer"],
    ["skin rash", "tengo una alergia en la piel que pica"],
    ["price question", "cuánto pago por una consulta de cardiología"],
  ];

  it.each(safe)("does NOT flag %s", (_label, message) => {
    expect(detectEmergency(message).isEmergency).toBe(false);
  });
});

/**
 * Regression: the allergic-reaction category's "hinchazón/inflamación de
 * cara" pattern was matching dermatological mentions ("espinillas
 * inflamadas en la cara" = acne) as a false-positive emergency (clear-11,
 * Phase 5 evals). "cara" swelling must be suppressed only when the message
 * is clearly about acne/skin blemishes — garganta/labios/lengua/parpados
 * swelling must still fire regardless (real alarms, bias toward recall).
 */
describe("detectEmergency — acne vs. allergic facial swelling (false-positive fix)", () => {
  const acneCases: [string, string][] = [
    ["acne with inflamed pimples on face and back", "Tengo acne con espinillas inflamadas en la cara y la espalda"],
    ["pimples on face", "Tengo la cara llena de granos inflamados"],
    ["blackheads/pimples, no face mention needed", "me salen barros inflamados en la espalda"],
  ];

  it.each(acneCases)("does NOT flag %s", (_label, message) => {
    expect(detectEmergency(message).isEmergency).toBe(false);
  });

  const realAlarms: [string, string][] = [
    ["face swelling, no acne context", "se me hinchó toda la cara de repente"],
    ["lips swelling", "tengo los labios hinchados y me pica todo"],
    ["throat inflamed, can't swallow/breathe", "tengo la garganta inflamada y no puedo tragar ni respirar bien"],
    ["eyelids swelling", "se me hincharon los parpados despues de comer mani"],
  ];

  it.each(realAlarms)("still flags %s", (_label, message) => {
    expect(detectEmergency(message).isEmergency).toBe(true);
  });
});
