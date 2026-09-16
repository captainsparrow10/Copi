/**
 * GET /api/health (PRD 7.6/7.11) — checks DB connectivity and LLM provider
 * reachability. Used to verify the demo backend woke up before an evaluation
 * run (PRD 7.11 "riesgo de pausa del backend gratuito").
 */
import { sql } from "drizzle-orm";
import { db } from "../../../lib/db/client";
import { checkChatProviderHealth } from "../../../lib/agent/provider";

async function checkDb(): Promise<"ok" | "error"> {
  try {
    await db.execute(sql`select 1`);
    return "ok";
  } catch {
    return "error";
  }
}

export async function GET(): Promise<Response> {
  const [dbStatus, llmOk] = await Promise.all([checkDb(), checkChatProviderHealth()]);
  const llmStatus = llmOk ? "ok" : "error";
  const status = dbStatus === "ok" && llmStatus === "ok" ? 200 : 503;

  return Response.json({ db: dbStatus, llm: llmStatus }, { status });
}
