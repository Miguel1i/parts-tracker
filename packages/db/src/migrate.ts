import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/libsql/migrator";
import type { Db } from "./client";

export const MIGRATIONS_FOLDER = fileURLToPath(new URL("../drizzle", import.meta.url));

/** Applies pending drizzle-kit migrations from packages/db/drizzle. */
export async function runMigrations(db: Db): Promise<void> {
  await db.run("PRAGMA foreign_keys = ON");
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}
