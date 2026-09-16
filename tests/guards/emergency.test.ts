import { describe, expect, it } from "vitest";
import { detectEmergency, EMERGENCY_RESPONSE } from "@/lib/guards/emergency";

/**
 * Matching strategy (see lib/guards/emergency.ts): accent-insensitive,
 * case-insensitive SUBSTRING match of each Anexo B phrase against the
 * normalized message — not keyword/fuzzy matching. So these "realistic
 * phrasing" cases embed the alarm phrase verbatim (accented or not) inside
 * a longer, more natural sentence, rather than paraphrasing it away.
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

  it("EMERGENCY_RESPONSE is the exact fixed response text from Anexo B", () => {
    expect(EMERGENCY_RESPONSE).toBe(
      "Lo que describes puede ser una emergencia. Acude de inmediato a la sala de urgencias más cercana o llama al 911. No esperes a cotizar.",
    );
  });
});
