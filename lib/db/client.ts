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

const queryClient = postgres(connectionString);

export const db = drizzle(queryClient, { schema });
