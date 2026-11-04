/**
 * Creates the first admin (or promotes an existing user) and hands them the legacy data.
 *
 *   pnpm seed:admin --email you@example.com
 *
 * The admin then signs in with a magic link to that address, or with GitHub/Google using the
 * same email (accounts link by verified email).
 */
import { promoteAdmin } from "../src/admin";
import { createDb, resolveDatabaseUrl } from "../src/client";
import { runMigrations } from "../src/migrate";
import { loadEnv } from "./env";

loadEnv();

const args = process.argv.slice(2);
const flag = args.indexOf("--email");
const email = flag >= 0 ? args[flag + 1] : undefined;
if (!email) {
  console.error("Usage: pnpm seed:admin --email you@example.com");
  process.exit(1);
}

const db = createDb();
await runMigrations(db);
const { userId, created, reassigned } = await promoteAdmin(db, email);
console.log(
  `${created ? "Created" : "Promoted"} admin ${email} (${userId}) in ${resolveDatabaseUrl().replace(/\?.*$/, "")}`,
);
console.log(`Reassigned ${reassigned} legacy rows.`);
db.$client.close();
