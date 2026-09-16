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
 * Searches `data/docs/guia-especialidades.md` fragments for the specialty
 * that best matches a free-text symptom. Backs the `buscar_especialidad`
 * tool: an empty array means "no match above the threshold" (SIN_COINCIDENCIAS).
 */
export async function buscarEnGuiaEspecialidades(sintoma: string): Promise<GuiaMatch[]> {
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

  const resultados = rows.map((row) => ({
    id: row.id,
    contenido: row.contenido,
    especialidadId: row.especialidadId ?? "",
    score: Number(row.score),
  }));
  return aplicarUmbral(resultados, ragMinScore());
}

/**
 * Searches a single plan's policy fragments for a coverage question. `planId`
 * always comes from the server-side session (PRD 7.5: no tool accepts a
 * policy/plan argument from the model) — this is the enforcement point that
 * keeps one plan's clauses out of another plan's answers.
 */
export async function buscarEnPoliza(pregunta: string, planId: string): Promise<ScoredFragment[]> {
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

  const resultados = rows.map((row) => ({ id: row.id, contenido: row.contenido, score: Number(row.score) }));
  return aplicarUmbral(resultados, ragMinScore());
}
