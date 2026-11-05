/** Queued/running runs older than this never finished (same window the scraper expires). */
export const STALE_RUN_MS = 3 * 60 * 60_000;

/** A run status as shown: queued/running past STALE_RUN_MS counts as failed. */
export function shownRunStatus(status: string, createdAt: Date | null, now: number) {
  const pending = status === "queued" || status === "running";
  return pending && createdAt && now - createdAt.getTime() > STALE_RUN_MS ? "failed" : status;
}
