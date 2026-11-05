import "server-only";
import { getDb, scrapeLogs, scrapeRuns } from "@parts/db";
import { and, desc, eq, gte, isNotNull } from "@parts/db/orm";
import { DAY_MS, dailyHealth, dayKey, runDurations } from "./health";

// Server loaders for the merchant-health and run-duration charts. Kept apart from health.ts,
// which client components import for its pure helpers and types (no DB code in the bundle).

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
