import { getDb, scrapeLogs, scrapeRuns, type ScrapeStatus } from "@parts/db";
import { and, desc, eq, gte, isNotNull } from "@parts/db/orm";

export const HEALTH_STATUSES = ["ok", "out_of_stock", "not_found", "blocked", "error"] as const;

export type HealthStatus = ScrapeStatus;
export type StatusCounts = Record<HealthStatus, number>;

export type DayHealth = {
  /** UTC calendar day, `YYYY-MM-DD`. */
  day: string;
  total: number;
  counts: StatusCounts;
  /** counts / total (0 to 1); all 0 for a day without checks. */
  shares: StatusCounts;
};

export type RunDuration = { id: string; startedAt: number; minutes: number };

const DAY_MS = 86_400_000;

export const emptyCounts = (): StatusCounts => ({
  ok: 0,
  out_of_stock: 0,
  not_found: 0,
  blocked: 0,
  error: 0,
});

const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** One entry per UTC day for the last `days` days ending on `now`'s day (oldest first). */
export function dailyHealth(
  rows: { createdAt: Date | number; status: HealthStatus }[],
  now: number,
  days = 30,
): DayHealth[] {
  const today = Date.parse(dayKey(now));
  const byDay = new Map<string, StatusCounts>();
  for (let i = days - 1; i >= 0; i--) byDay.set(dayKey(today - i * DAY_MS), emptyCounts());
  for (const row of rows) {
    const counts = byDay.get(dayKey(+row.createdAt));
    if (counts && row.status in counts) counts[row.status]++;
  }
  return [...byDay].map(([day, counts]) => {
    const total = HEALTH_STATUSES.reduce((sum, s) => sum + counts[s], 0);
    const shares = emptyCounts();
    if (total > 0) for (const s of HEALTH_STATUSES) shares[s] = counts[s] / total;
    return { day, total, counts, shares };
  });
}

/** Wall-clock minutes per finished run, oldest first. Unfinished or negative runs are dropped. */
export function runDurations(
  runs: { id: string; startedAt: Date | null; finishedAt: Date | null }[],
): RunDuration[] {
  return runs
    .flatMap((r) => {
      if (!r.startedAt || !r.finishedAt) return [];
      const ms = r.finishedAt.getTime() - r.startedAt.getTime();
      return ms >= 0
        ? [{ id: r.id, startedAt: r.startedAt.getTime(), minutes: Math.round(ms / 600) / 100 }]
        : [];
    })
    .sort((a, b) => a.startedAt - b.startedAt);
}

export async function loadMerchantHealth(merchantId: string, now = Date.now(), days = 30) {
  const since = new Date(Date.parse(dayKey(now)) - (days - 1) * DAY_MS);
  const rows = await getDb()
    .select({ createdAt: scrapeLogs.createdAt, status: scrapeLogs.status })
    .from(scrapeLogs)
    .where(and(eq(scrapeLogs.merchantId, merchantId), gte(scrapeLogs.createdAt, since)));
  return dailyHealth(rows, now, days);
}

export async function loadRunDurations(limit = 60) {
  const rows = await getDb()
    .select({
      id: scrapeRuns.id,
      startedAt: scrapeRuns.startedAt,
      finishedAt: scrapeRuns.finishedAt,
    })
    .from(scrapeRuns)
    .where(and(isNotNull(scrapeRuns.startedAt), isNotNull(scrapeRuns.finishedAt)))
    .orderBy(desc(scrapeRuns.startedAt))
    .limit(limit);
  return runDurations(rows);
}
