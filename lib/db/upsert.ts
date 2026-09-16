import { getTableColumns, sql, type Table } from "drizzle-orm";
import { type AnyPgColumn } from "drizzle-orm/pg-core";

/** Strips documentation-only fields (prefixed `_`) before insert. */
export function stripMeta<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (!key.startsWith("_")) clean[key] = value;
  }
  return clean;
}

/**
 * Builds the `set` clause for an upsert that overwrites every column with
 * the incoming row's value (`excluded.<column>`), except the given
 * primary-key columns which must not be reassigned.
 *
 * Shared by scripts/seed.ts and scripts/ingest.ts so every idempotent
 * seed/ingest script upserts the same way.
 */
export function conflictUpdateSet<T extends Table>(table: T, primaryKeyColumns: AnyPgColumn[]) {
  const primaryKeyNames = new Set(primaryKeyColumns.map((col) => col.name));
  const columns = getTableColumns(table);
  const set: Record<string, unknown> = {};
  for (const [key, col] of Object.entries(columns)) {
    const column = col as AnyPgColumn;
    if (primaryKeyNames.has(column.name)) continue;
    set[key] = sql.raw(`excluded.${column.name}`);
  }
  return set;
}
