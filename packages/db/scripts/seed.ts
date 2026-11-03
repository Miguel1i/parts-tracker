import { createDb } from "../src/client";
import { seed } from "../src/import";
import { runMigrations } from "../src/migrate";
import { loadEnv } from "./env";

loadEnv();
const db = createDb();
await runMigrations(db);
const { inserted, updated } = await seed(db);
console.log(`Seeded merchants: ${inserted} inserted, ${updated} updated`);
db.$client.close();
