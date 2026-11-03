import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Loads the first env file that exists (repo-root .env, then apps/web/.env.local). */
export function loadEnv() {
  for (const rel of ["../../../.env", "../../../apps/web/.env.local"]) {
    const path = fileURLToPath(new URL(rel, import.meta.url));
    if (existsSync(path)) {
      process.loadEnvFile(path);
      return path;
    }
  }
  return null;
}
