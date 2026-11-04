/** A whole scrape run: plan the pairs, scrape them politely, write the results. */
import type { FxRates } from "@parts/core";
import type { Db, ScrapeStatus } from "@parts/db";
import type { PageFetcher } from "./http";
import { scrapePair, type FailurePage, type PairOutcome, type RunMemo } from "./pair";
import {
  finishRun,
  loadRunData,
  pairInput,
  recentSkipMinutes,
  saveMerchantHealth,
  savePair,
  startRun,
  type PlannedPair,
  type RunScope,
} from "./store";

export interface RunOptions {
  db: Db;
  fetcher: PageFetcher;
  rates: FxRates;
  trigger: "cron" | "manual";
  scope?: RunScope;
  runId?: string;
  ghRunUrl?: string;
  /** Shops scraped at the same time (each shop is still limited to 2 requests in flight). */
  merchantConcurrency?: number;
  /** Pairs of one shop scraped at the same time (default 2). */
  pairConcurrency?: number;
  /** Skip pairs checked within this many minutes (manual runs default to app_settings). */
  skipRecentMinutes?: number;
  now?: () => number;
  log?: (line: string) => void;
  /** Receives raw HTML of failed fetches, for the Actions artifact. Never written to the DB. */
  onFailurePage?: (pair: PlannedPair, page: FailurePage) => void | Promise<void>;
}

export interface RunResult {
  runId: string;
  stats: Record<string, number>;
  outcomes: { pair: PlannedPair; outcome: PairOutcome }[];
}

/** Runs `fn` over `items` with at most `limit` in flight. */
export async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]!);
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
}

/** Serializes DB writes so read-modify-write of shared rows (identifiers) can't interleave. */
function serial() {
  let chain: Promise<unknown> = Promise.resolve();
  return <T>(fn: () => Promise<T>): Promise<T> => {
    const p = chain.then(fn, fn);
    chain = p.catch(() => {});
    return p;
  };
}

export async function runScrape(options: RunOptions): Promise<RunResult> {
  const { db, fetcher, rates } = options;
  const now = options.now ?? Date.now;
  const log = options.log ?? (() => {});
  const scope = options.scope ?? {};
  const started = now();
  const runId = await startRun(
    db,
    { runId: options.runId, trigger: options.trigger, scope, ghRunUrl: options.ghRunUrl },
    new Date(started),
  );
  const stats: Record<string, number> = {
    pairs: 0,
    skipped: 0,
    ok: 0,
    out_of_stock: 0,
    not_found: 0,
    blocked: 0,
    error: 0,
    review: 0,
    requests: 0,
  };
  const outcomes: RunResult["outcomes"] = [];

  try {
    const data = await loadRunData(db, scope, new Date(started));
    const skipMinutes =
      options.skipRecentMinutes ??
      (options.trigger === "manual" && !(scope.productId && scope.merchantId)
        ? await recentSkipMinutes(db)
        : 0);
    const pairs = data.pairs.filter((p) => {
      const recent =
        skipMinutes > 0 &&
        p.lastCheckedAt &&
        started - p.lastCheckedAt.getTime() < skipMinutes * 60_000;
      if (recent) stats.skipped!++;
      return !recent;
    });
    log(`run ${runId}: ${pairs.length} pairs (${stats.skipped} checked recently, skipped)`);

    const byMerchant = new Map<string, PlannedPair[]>();
    for (const p of pairs) {
      const list = byMerchant.get(p.merchant.id) ?? [];
      list.push(p);
      byMerchant.set(p.merchant.id, list);
    }
    const write = serial();
    const memo: RunMemo = { jsSearch: new Set() };

    await mapLimit([...byMerchant.values()], options.merchantConcurrency ?? 4, async (list) => {
      const statuses: ScrapeStatus[] = [];
      await mapLimit(list, options.pairConcurrency ?? 2, async (pair) => {
        let outcome: PairOutcome;
        try {
          outcome = await scrapePair(pairInput(pair, data, rates), fetcher, { now, memo });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          outcome = {
            status: "error",
            message: message.slice(0, 300),
            trace: [String(err instanceof Error ? (err.stack ?? message) : err)],
            failurePages: [],
            requests: 0,
            ms: 0,
          };
        }
        statuses.push(outcome.status);
        stats.pairs!++;
        stats[outcome.status] = (stats[outcome.status] ?? 0) + 1;
        if (outcome.review) stats.review!++;
        stats.requests! += outcome.requests;
        log(
          `${pair.merchant.name.padEnd(20)} ${outcome.status.padEnd(12)} ${pair.product.name} — ${outcome.message}`,
        );
        await write(() => savePair(db, runId, pair, outcome, new Date(now())));
        if (options.onFailurePage && outcome.status !== "ok")
          for (const page of outcome.failurePages) await options.onFailurePage(pair, page);
        outcomes.push({ pair, outcome });
      });
      const merchantId = list[0]!.merchant.id;
      await write(() => saveMerchantHealth(db, merchantId, statuses, new Date(now())));
    });

    stats.durationMs = now() - started;
    await finishRun(db, runId, "succeeded", stats, new Date(now()));
  } catch (err) {
    stats.durationMs = now() - started;
    await finishRun(db, runId, "failed", stats, new Date(now())).catch(() => {});
    throw err;
  }
  return { runId, stats, outcomes };
}
