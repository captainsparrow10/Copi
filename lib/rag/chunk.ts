/**
 * Pure markdown chunking for the RAG source documents (PRD 7.3 `fragmentos`).
 *
 * Both source documents (`data/docs/guia-especialidades.md` and the
 * `data/docs/poliza-*.md` files) use the same convention: each fragment is a
 * level-3 heading `### [id] label` followed by its content, up to the next
 * heading or the end of the file. This module only parses that structure —
 * no DB access, no embeddings — so it can be unit tested directly.
 */

const GUIA_HEADING = /^###\s+\[(G-\d+)\]\s+(\S+)\s*$/;
const POLIZA_HEADING = /^###\s+\[(C-\d+\.\d+)\]\s+(.*)$/;

export interface GuiaFragment {
  id: string; // 'G-12'
  especialidadId: string;
  contenido: string;
}

export interface PolizaFragment {
  id: string; // 'C-4.2'
  titulo: string;
  contenido: string;
}

/** Splits a markdown document into raw `{ headingLine, bodyLines }` blocks by `### ` headings. */
function splitHeadingBlocks(markdown: string): { heading: string; body: string[] }[] {
  const lines = markdown.split(/\r?\n/);
  const blocks: { heading: string; body: string[] }[] = [];
  let current: { heading: string; body: string[] } | null = null;

  for (const line of lines) {
    if (line.startsWith("### ")) {
      if (current) blocks.push(current);
      current = { heading: line.trimEnd(), body: [] };
    } else if (current) {
      current.body.push(line);
    }
  }
  if (current) blocks.push(current);
  return blocks;
}

/**
 * Joins body lines into a single trimmed paragraph, collapsing blank
 * separator lines and dropping markdown `---` section-divider rules (used
 * between specialties/sections in the source docs — not content).
 */
function joinBody(body: string[]): string {
  return body
    .join("\n")
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part !== "---")
    .join("\n\n")
    .trim();
}

/**
 * Parses `data/docs/guia-especialidades.md` into one fragment per `[G-n]`
 * heading. Throws on a malformed heading or an empty body so bad content
 * fails fast at ingest time rather than silently skipping a symptom.
 */
export function parseGuiaEspecialidades(markdown: string): GuiaFragment[] {
  return splitHeadingBlocks(markdown).map(({ heading, body }) => {
    const match = GUIA_HEADING.exec(heading);
    if (!match) {
      throw new Error(`guia-especialidades: malformed heading "${heading}"`);
    }
    const [, id, especialidadId] = match;
    const contenido = joinBody(body);
    if (!contenido) {
      throw new Error(`guia-especialidades: fragment ${id} has no content`);
    }
    return { id, especialidadId, contenido };
  });
}

/**
 * Parses a `data/docs/poliza-*.md` file into one fragment per `[C-x.y]`
 * heading. The heading title is prepended to the content so the embedding
 * captures both ("Deducible anual" + the paragraph), which matters because
 * some clauses (e.g. section headers like "Glosario — deducible") are short.
 */
export function parsePolizaClausulas(markdown: string): PolizaFragment[] {
  return splitHeadingBlocks(markdown).map(({ heading, body }) => {
    const match = POLIZA_HEADING.exec(heading);
    if (!match) {
      throw new Error(`poliza: malformed heading "${heading}"`);
    }
    const [, id, tituloRaw] = match;
    const titulo = tituloRaw.trim();
    const bodyText = joinBody(body);
    if (!bodyText) {
      throw new Error(`poliza: fragment ${id} has no content`);
    }
    const contenido = titulo ? `${titulo}\n${bodyText}` : bodyText;
    return { id, titulo, contenido };
  });
}
