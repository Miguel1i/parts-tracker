/**
 * Prints `run=true|false` for a scheduled workflow run (appended to $GITHUB_OUTPUT when set), so
 * scrape.yml can stop before installing Chromium when app_settings.cronIntervalHours says it
 * isn't time yet. The scrape step re-checks, so this is only an optimisation.
 */
import { appendFileSync } from "node:fs";
import { createDb } from "@parts/db";
import { decideCronRun, loadCronState } from "../src/cron";
import { loadEnv } from "./env";

loadEnv();
const db = createDb();
const decision = decideCronRun({ trigger: "cron", now: Date.now(), ...(await loadCronState(db)) });
db.$client.close();
console.log(`cron gate: ${decision.skip ? "skip" : "run"} (${decision.reason})`);
const line = `run=${decision.skip ? "false" : "true"}\n`;
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, line);
