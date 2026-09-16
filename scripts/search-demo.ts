/**
 * Manual RAG smoke test (FASE 2 verification). Prints the top specialty-guide
 * matches for a fixed query so a human can eyeball scores and ranking.
 *
 * Usage: npx tsx scripts/search-demo.ts ["custom query"]
 */
import { buscarEnGuiaEspecialidades } from "../lib/rag/search";

async function main(): Promise<void> {
  const query = process.argv[2] ?? "me duele la rodilla";
  console.log(`Query: "${query}"\n`);

  const resultados = await buscarEnGuiaEspecialidades(query);
  if (resultados.length === 0) {
    console.log("SIN_COINCIDENCIAS (no result above RAG_MIN_SCORE)");
    process.exit(0);
  }

  for (const [i, r] of resultados.entries()) {
    console.log(`${i + 1}. [${r.id}] ${r.especialidadId} — score ${r.score.toFixed(4)}`);
    console.log(`   ${r.contenido.replace(/\n/g, " ")}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
