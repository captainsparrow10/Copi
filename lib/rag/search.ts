/**
 * RAG retrieval (PRD 7.3 `fragmentos` / 7.5 `buscar_especialidad`, `buscar_en_poliza`).
 *
 * Two searches share the same shape: embed the query, rank fragments by
 * pgvector cosine similarity, take the top `TOP_K`, then drop anything below
 * `RAG_MIN_SCORE` (PRD 7.8 layer 4 — the "I don't know" threshold in code).
 * The specialty guide has no plan filter; the policy search always filters
 * by the session's plan (never lets the LLM pick another plan's policy).
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { cosineDistance } from "drizzle-orm";
import { db } from "../db/client";
import { documentos, fragmentos } from "../db/schema";
import { embedText } from "./embed";

const TOP_K = 4;

function ragMinScore(): number {
  return Number(process.env.RAG_MIN_SCORE ?? "0.70");
}

/**
 * Policy questions ("¿mi póliza cubre…?") score high against any clause, even an
 * unrelated one, so policy search can use a stricter threshold than the guide.
 */
function policyMinScore(): number {
  return Number(process.env.RAG_POLICY_MIN_SCORE ?? process.env.RAG_MIN_SCORE ?? "0.70");
}

export interface ScoredFragment {
  id: string;
  contenido: string;
  score: number;
}

export interface GuiaMatch extends ScoredFragment {
  especialidadId: string;
}

/**
 * Pure: keeps only results scoring at or above `minScore`. Split out from
 * the DB queries below so it (and the "no match" / SIN_COINCIDENCIAS path)
 * can be unit tested without a database.
 */
export function aplicarUmbral<T extends { score: number }>(resultados: T[], minScore: number): T[] {
  return resultados.filter((resultado) => resultado.score >= minScore);
}

/**
 * Pure: merges result lists from several queries, keeping each fragment once
 * with its best score, best first, at most `limit`.
 */
export function mezclarMejoresPuntajes<T extends { id: string; score: number }>(listas: T[][], limit: number): T[] {
  const best = new Map<string, T>();
  for (const lista of listas) {
    for (const resultado of lista) {
      const actual = best.get(resultado.id);
      if (!actual || resultado.score > actual.score) best.set(resultado.id, resultado);
    }
  }
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Distinct, non-empty queries: the model's phrasing plus the patient's own words. */
function consultasDistintas(queries: string[]): string[] {
  return [...new Set(queries.map((q) => q.trim()).filter((q) => q.length > 0))];
}

/**
 * Searches `data/docs/guia-especialidades.md` fragments for the specialty
 * that best matches a free-text symptom. Backs the `buscar_especialidad`
 * tool: an empty array means "no match above the threshold" (SIN_COINCIDENCIAS).
 * Pass the patient's literal message as well as the model's rewrite: the model
 * sometimes drops the words that match the guide (e.g. "mi hija" → "una niña").
 */
export async function buscarEnGuiaEspecialidades(...sintomas: string[]): Promise<GuiaMatch[]> {
  const listas = await Promise.all(consultasDistintas(sintomas).map((q) => buscarGuiaUnaConsulta(q)));
  return aplicarUmbral(mezclarMejoresPuntajes(listas, TOP_K), ragMinScore());
}

async function buscarGuiaUnaConsulta(sintoma: string): Promise<GuiaMatch[]> {
  const queryEmbedding = await embedText(sintoma, "query");
  const similarity = sql<number>`1 - (${cosineDistance(fragmentos.embedding, queryEmbedding)})`;

  const rows = await db
    .select({
      id: fragmentos.id,
      contenido: fragmentos.contenido,
      especialidadId: fragmentos.especialidadId,
      score: similarity,
    })
    .from(fragmentos)
    .innerJoin(documentos, eq(fragmentos.documentoId, documentos.id))
    .where(eq(documentos.tipo, "guia"))
    .orderBy(desc(similarity))
    .limit(TOP_K);

  return rows.map((row) => ({
    id: row.id,
    contenido: row.contenido,
    especialidadId: row.especialidadId ?? "",
    score: Number(row.score),
  }));
}

/**
 * Searches a single plan's policy fragments for a coverage question. `planId`
 * always comes from the server-side session (PRD 7.5: no tool accepts a
 * policy/plan argument from the model) — this is the enforcement point that
 * keeps one plan's clauses out of another plan's answers.
 */
export async function buscarEnPoliza(planId: string, ...preguntas: string[]): Promise<ScoredFragment[]> {
  const listas = await Promise.all(consultasDistintas(preguntas).map((q) => buscarPolizaUnaConsulta(q, planId)));
  return aplicarUmbral(mezclarMejoresPuntajes(listas, TOP_K), policyMinScore());
}

async function buscarPolizaUnaConsulta(pregunta: string, planId: string): Promise<ScoredFragment[]> {
  const queryEmbedding = await embedText(pregunta, "query");
  const similarity = sql<number>`1 - (${cosineDistance(fragmentos.embedding, queryEmbedding)})`;

  const rows = await db
    .select({
      id: fragmentos.id,
      contenido: fragmentos.contenido,
      score: similarity,
    })
    .from(fragmentos)
    .innerJoin(documentos, eq(fragmentos.documentoId, documentos.id))
    .where(and(eq(documentos.tipo, "poliza"), eq(documentos.planId, planId)))
    .orderBy(desc(similarity))
    .limit(TOP_K);

  return rows.map((row) => ({ id: row.id, contenido: row.contenido, score: Number(row.score) }));
}
