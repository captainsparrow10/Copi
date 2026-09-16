import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildTools } from "@/lib/agent/tools";
import { closeQuoteRow, getActiveQuote, saveQuote, updateSelection } from "@/lib/db/quotes";

/**
 * Exercises lib/db/quotes.ts against the real seeded Postgres DB — same
 * pattern as tests/agent-tools.test.ts (this feature's persistence layer
 * underneath POST /api/quote/select and POST /api/quote/close, which stay
 * thin route wrappers verified end-to-end via curl per the manual
 * verification plan; there's no existing Next route-handler test harness in
 * this repo to follow instead). Requires `npm run db:migrate && npm run
 * db:seed` to have been run, and Ollama reachable (buscar_especialidad
 * embeds the query).
 */
describe("lib/db/quotes — 'Select an option' / 'Close the quote' persistence", () => {
  it("cotizar_consulta (lib/agent/tools.ts) persists a new active quote for the session", async () => {
    const sesionId = randomUUID();
    const tools = await buildTools("POL-1001", sesionId);
    await tools.buscar_especialidad.execute!(
      { sintoma: "me duele la rodilla al subir escaleras" },
      { toolCallId: "dbq-1a", messages: [], context: {} },
    );
    const result = (await tools.cotizar_consulta.execute!(
      { especialidad: "traumatologia" },
      { toolCallId: "dbq-1b", messages: [], context: {} },
    )) as { especialidad: string; opciones: { hospital: string }[] };

    expect(result.opciones.length).toBeGreaterThan(0);

    const active = await getActiveQuote(sesionId);
    expect(active).not.toBeNull();
    expect(active?.poliza).toBe("POL-1001");
    expect(active?.sesionId).toBe(sesionId);
    expect(active?.especialidadId).toBe("traumatologia");
    expect(active?.seleccion).toBeNull();
    expect(active?.estado).toBe("abierta");
    expect(active?.payload.opciones.length).toBe(result.opciones.length);
  });

  it("a later cotizar_consulta call supersedes the previous quote as the session's active one", async () => {
    const sesionId = randomUUID();
    const first = await saveQuote({
      sesionId,
      poliza: "POL-1002",
      especialidadId: "medicina_general",
      payload: { plan: "Plan Estándar", especialidad: "medicina_general", carencia: { enCarencia: false }, recomendado: null, opciones: [] },
    });
    await new Promise((resolve) => setTimeout(resolve, 5)); // ensure a distinct creadoEn ordering
    const second = await saveQuote({
      sesionId,
      poliza: "POL-1002",
      especialidadId: "cardiologia",
      payload: { plan: "Plan Estándar", especialidad: "cardiologia", carencia: { enCarencia: false }, recomendado: null, opciones: [] },
    });

    const active = await getActiveQuote(sesionId);
    expect(active?.id).toBe(second.id);
    expect(active?.id).not.toBe(first.id);
  });

  it("two sessions on the same demo policy never see each other's quote", async () => {
    // Demo policies are shared by every evaluator: quotes must be scoped to the browser session, not the policy.
    const sessionA = randomUUID();
    const sessionB = randomUUID();
    const payload = { plan: "Plan Estándar", especialidad: "cardiologia", carencia: { enCarencia: false }, recomendado: null, opciones: [] };
    await saveQuote({ sesionId: sessionA, poliza: "POL-1002", especialidadId: "cardiologia", payload });

    expect(await getActiveQuote(sessionB)).toBeNull();
    expect((await getActiveQuote(sessionA))?.sesionId).toBe(sessionA);
  });

  it("updateSelection stores the chosen hospital and closeQuoteRow closes it", async () => {
    const sesionId = randomUUID();
    const tools = await buildTools("POL-1001", sesionId);
    await tools.buscar_especialidad.execute!(
      { sintoma: "me duele la rodilla" },
      { toolCallId: "dbq-2a", messages: [], context: {} },
    );
    await tools.cotizar_consulta.execute!(
      { especialidad: "traumatologia" },
      { toolCallId: "dbq-2b", messages: [], context: {} },
    );
    const active = await getActiveQuote(sesionId);
    expect(active).not.toBeNull();
    const hospital = active!.payload.opciones[0]!.hospital;

    const selected = await updateSelection(active!.id, hospital);
    expect(selected?.seleccion).toBe(hospital);
    expect(selected?.estado).toBe("abierta");

    const closed = await closeQuoteRow(active!.id);
    expect(closed.estado).toBe("cerrada");
    expect(closed.cerradoEn).not.toBeNull();
    expect(closed.seleccion).toBe(hospital); // closing never touches the selection
  });

  it("refuses to change the selection of a quote that was closed in between (select/close race)", async () => {
    const sesionId = randomUUID();
    const payload = { plan: "Plan Estándar", especialidad: "cardiologia", carencia: { enCarencia: false }, recomendado: null, opciones: [] };
    const quote = await saveQuote({ sesionId, poliza: "POL-1002", especialidadId: "cardiologia", payload });
    await updateSelection(quote.id, "Hospital A");
    await closeQuoteRow(quote.id);

    expect(await updateSelection(quote.id, "Hospital B")).toBeNull();
    expect((await getActiveQuote(sesionId))?.seleccion).toBe("Hospital A");
  });

  it("returns null for a session that has never quoted anything", async () => {
    const active = await getActiveQuote(randomUUID());
    expect(active).toBeNull();
  });
});
