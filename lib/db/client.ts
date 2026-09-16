import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Next.js auto-loads .env.local at runtime; scripts run via tsx do not, so load it
// explicitly here. dotenv never overrides variables already present in process.env.
config({ path: ".env.local" });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Define it in .env.local.");
}

// Serverless hosts run many short-lived instances against a database with few
// connections (InsForge free: 30), so keep each instance's pool small in production
// and release idle connections quickly.
const queryClient = postgres(connectionString, {
  max: Number(process.env.DB_POOL_MAX ?? "10"),
  idle_timeout: 20,
});

export const db = drizzle(queryClient, { schema });
