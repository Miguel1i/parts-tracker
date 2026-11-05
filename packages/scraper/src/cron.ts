/** Decides whether a scheduled (cron) run should go ahead; manual and dispatched runs never skip. */
import { appSettings, scrapeRuns, type Db } from "@parts/db";
import { desc, eq } from "@parts/db/orm";

/** The workflow fires hourly; a run may start a little early relative to the last one. */
export const CRON_SLACK_MINUTES = 10;

export interface CronDecision {
  skip: boolean;
  reason: string;
}

export function decideCronRun(input: {
  trigger: "cron" | "manual";
  now: number;
  /** startedAt (ms) of the most recent cron run, if any. */
  lastCronStartedAt: number | null;
  intervalHours: number;
}): CronDecision {
  if (input.trigger !== "cron") return { skip: false, reason: "manual run" };
  if (input.lastCronStartedAt == null) return { skip: false, reason: "no earlier cron run" };
  const needed = Math.max(1, input.intervalHours) * 60 - CRON_SLACK_MINUTES;
  const elapsed = (input.now - input.lastCronStartedAt) / 60_000;
  if (elapsed >= needed) {
    return { skip: false, reason: `${Math.floor(elapsed)} min since the last cron run` };
  }
  return {
    skip: true,
    reason: `last cron run was ${Math.floor(elapsed)} min ago; interval is ${input.intervalHours} h`,
  };
}

export async function loadCronState(db: Db) {
  const [settings] = await db.select().from(appSettings).where(eq(appSettings.id, 1));
  const [last] = await db
    .select({ startedAt: scrapeRuns.startedAt })
    .from(scrapeRuns)
    .where(eq(scrapeRuns.trigger, "cron"))
    .orderBy(desc(scrapeRuns.startedAt))
    .limit(1);
  return {
    intervalHours: settings?.cronIntervalHours ?? 6,
    lastCronStartedAt: last?.startedAt?.getTime() ?? null,
  };
}
