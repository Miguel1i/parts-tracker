import type { ScrapeStatus } from "@parts/db/schema";

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

export const DAY_MS = 86_400_000;

export const emptyCounts = (): StatusCounts => ({
  ok: 0,
  out_of_stock: 0,
  not_found: 0,
  blocked: 0,
  error: 0,
});

export const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

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
