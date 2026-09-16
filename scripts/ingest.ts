/**
 * RAG ingest script (PRD 7.3 `documentos` / `fragmentos`, FASE 2).
 *
 * Reads data/docs/*.md, chunks them with lib/rag/chunk.ts, embeds every
 * fragment with the configured provider (lib/rag/embed.ts) and upserts
 * `documentos` + `fragmentos` keyed by their stable ids (`guia-especialidades`,
 * `poliza-basico`, ... and `G-n` / `C-x.y`). Re-running is safe: same content
 * in, same rows out — no duplicates, and `embedding_model` is refreshed so
 * switching providers and re-ingesting naturally updates every row.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { db } from "../lib/db/client";
import { documentos, fragmentos } from "../lib/db/schema";
import { conflictUpdateSet } from "../lib/db/upsert";
import { embedText, embeddingModelLabel } from "../lib/rag/embed";
import { parseGuiaEspecialidades, parsePolizaClausulas } from "../lib/rag/chunk";

config({ path: ".env.local" });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.resolve(__dirname, "../data/docs");

interface DocumentoSeed {
  id: string;
  tipo: "guia" | "poliza";
  planId: string | null;
  titulo: string;
  archivo: string;
}

const DOCUMENTOS: DocumentoSeed[] = [
  {
    id: "guia-especialidades",
    tipo: "guia",
    planId: null,
    titulo: "Guía de especialidades médicas",
    archivo: "guia-especialidades.md",
  },
  {
    id: "poliza-basico",
    tipo: "poliza",
    planId: "basico",
    titulo: "Póliza — Plan Básico",
    archivo: "poliza-basico.md",
  },
  {
    id: "poliza-estandar",
    tipo: "poliza",
    planId: "estandar",
    titulo: "Póliza — Plan Estándar",
    archivo: "poliza-estandar.md",
  },
  {
    id: "poliza-premium",
    tipo: "poliza",
    planId: "premium",
    titulo: "Póliza — Plan Premium",
    archivo: "poliza-premium.md",
  },
];

interface FragmentoRow {
  id: string;
  documentoId: string;
  especialidadId: string | null;
  contenido: string;
  embedding: number[];
  embeddingModel: string;
}

async function buildFragmentRows(doc: DocumentoSeed, markdown: string): Promise<FragmentoRow[]> {
  const modelLabel = embeddingModelLabel();

  if (doc.tipo === "guia") {
    const fragments = parseGuiaEspecialidades(markdown);
    return Promise.all(
      fragments.map(async (fragment) => ({
        id: fragment.id,
        documentoId: doc.id,
        especialidadId: fragment.especialidadId,
        contenido: fragment.contenido,
        embedding: await embedText(fragment.contenido, "document"),
        embeddingModel: modelLabel,
      })),
    );
  }

  const fragments = parsePolizaClausulas(markdown);
  return Promise.all(
    fragments.map(async (fragment) => ({
      id: fragment.id,
      documentoId: doc.id,
      especialidadId: null,
      contenido: fragment.contenido,
      embedding: await embedText(fragment.contenido, "document"),
      embeddingModel: modelLabel,
    })),
  );
}

async function ingest(): Promise<void> {
  console.log(`Ingesting with embedding model: ${embeddingModelLabel()}`);

  console.log("Upserting documentos...");
  await db
    .insert(documentos)
    .values(DOCUMENTOS.map(({ id, tipo, planId, titulo }) => ({ id, tipo, planId, titulo })))
    .onConflictDoUpdate({
      target: documentos.id,
      set: conflictUpdateSet(documentos, [documentos.id]),
    });

  let totalFragments = 0;
  for (const doc of DOCUMENTOS) {
    const filePath = path.join(DOCS_DIR, doc.archivo);
    const markdown = await readFile(filePath, "utf-8");
    const rows = await buildFragmentRows(doc, markdown);

    console.log(`  ${doc.id}: ${rows.length} fragments`);
    if (rows.length === 0) continue;

    await db
      .insert(fragmentos)
      .values(rows)
      .onConflictDoUpdate({
        target: fragmentos.id,
        set: conflictUpdateSet(fragmentos, [fragmentos.id]),
      });
    totalFragments += rows.length;
  }

  console.log(`Ingest complete. ${DOCUMENTOS.length} documentos, ${totalFragments} fragmentos.`);
}

ingest()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
