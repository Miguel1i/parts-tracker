import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

export type Db = LibSQLDatabase<typeof schema> & { $client: Client };

export const DEFAULT_DATABASE_URL = "file:local.db";

/** Walks up from `start` to the folder holding pnpm-workspace.yaml (falls back to `start`). */
function workspaceRoot(start: string): string {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return resolve(start);
    dir = parent;
  }
}

/**
 * Relative `file:` URLs are resolved against the workspace root, so the web app
 * (cwd apps/web) and the db scripts (cwd packages/db) share one local.db.
 */
export function resolveDatabaseUrl(url: string | undefined = process.env.TURSO_DATABASE_URL) {
  const raw = url?.trim() || DEFAULT_DATABASE_URL;
  if (!raw.startsWith("file:") || raw === ":memory:") return raw;
  const path = raw.slice("file:".length);
  if (path === ":memory:" || isAbsolute(path) || /^[a-zA-Z]:[\\/]/.test(path)) return raw;
  // String concatenation rather than path.join: Next's tracer treats join(cwd, …) as dynamic
  // filesystem access and would bundle the whole repo into the server output.
  const root = workspaceRoot(process.cwd()).replaceAll("\\", "/").replace(/\/$/, "");
  return `file:${root}/${path.replace(/^\.\//, "")}`;
}

export function createDb(
  url: string | undefined = process.env.TURSO_DATABASE_URL,
  authToken: string | undefined = process.env.TURSO_AUTH_TOKEN,
): Db {
  const client = createClient({ url: resolveDatabaseUrl(url), authToken: authToken || undefined });
  return drizzle(client, { schema });
}

let cached: Db | undefined;

/** Process-wide client built from TURSO_DATABASE_URL / TURSO_AUTH_TOKEN. */
export function getDb(): Db {
  cached ??= createDb();
  return cached;
}
