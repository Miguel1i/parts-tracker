import { createDb, resolveDatabaseUrl } from "../src/client";
import { runMigrations } from "../src/migrate";
import { loadEnv } from "./env";

loadEnv();
const db = createDb();
await runMigrations(db);
console.log(`Migrations applied to ${resolveDatabaseUrl().replace(/\?.*$/, "")}`);
db.$client.close();
