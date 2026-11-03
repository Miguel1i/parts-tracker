/**
 * Imports the legacy Python app's pc_tracker.json.
 *
 *   pnpm db:import-legacy [path/to/pc_tracker.json] [--owner <userId>]
 *
 * The default path is .scratch/pc_tracker.json at the repo root (gitignored); copy the
 * real file there first. Never commit it.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDb, resolveDatabaseUrl } from "../src/client";
import { countRows, importLegacy, LEGACY_ADMIN_USER_ID } from "../src/import";
import type { LegacyFile } from "../src/legacy";
import { runMigrations } from "../src/migrate";
import { loadEnv } from "./env";

loadEnv();

const args = process.argv.slice(2);
const ownerFlag = args.indexOf("--owner");
const owner = (ownerFlag >= 0 ? args.splice(ownerFlag, 2)[1] : undefined) ?? LEGACY_ADMIN_USER_ID;
const defaultPath = fileURLToPath(new URL("../../../.scratch/pc_tracker.json", import.meta.url));
const path = args[0] ? resolve(process.env.INIT_CWD ?? process.cwd(), args[0]) : defaultPath;

const file = JSON.parse(readFileSync(path, "utf8")) as LegacyFile;
if (!file.merchants || !Array.isArray(file.components))
  throw new Error(`${path} doesn't look like pc_tracker.json`);

const db = createDb();
await runMigrations(db);
const { warnings, ...counts } = await importLegacy(db, file, owner);

console.log(`Imported ${path}`);
console.log(`into ${resolveDatabaseUrl().replace(/\?.*$/, "")} (owner ${owner})\n`);
console.table(
  Object.entries(counts).map(([what, n]) => ({
    what,
    imported: typeof n === "number" ? n : JSON.stringify(n),
  })),
);
console.log("Rows now in the database:");
console.table(await countRows(db));
if (warnings.length) console.log(`Warnings (${warnings.length}):\n- ${warnings.join("\n- ")}`);
db.$client.close();
