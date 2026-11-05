import "server-only";
import {
  appSettings,
  buildItems,
  matchCandidates,
  merchants,
  pricePoints,
  productMerchant,
  products,
  scrapeLogs,
  scrapeRuns,
  type Db,
} from "@parts/db";
import { and, asc, desc, eq, gt, inArray, not, isNull, or } from "@parts/db/orm";
import { dispatchScrape } from "@/lib/admin/github";
import { ActionError } from "@/lib/auth/guard";
import { ownedBuild } from "./access";
import { userMerchantIds } from "./queries";

export type CheckScope = { buildId: string } | { productId: string };

const DEFAULT_COOLDOWN_MINUTES = 10;
const DEFAULT_SKIP_MINUTES = 30;

/**
 * Starts an on-demand scrape of a build or one product. Non-admins are limited to one run per
 * `userRunCooldownMinutes`, and pairs checked within `recentCheckSkipMinutes` don't count
 * (prices are shared), so a run that would change nothing is refused with `nothingToCheck`.
 * `command` (the local fallback when GitHub isn't configured) is only returned to admins.
 */
export async function startCheck(
  db: Db,
  actor: { id: string },
  isAdmin: boolean,
  scope: CheckScope,
  now = Date.now(),
): Promise<{ runId: string; dispatched: boolean; command?: string }> {
  const buildId = "buildId" in scope ? scope.buildId : undefined;
  const productIds: string[] = [];
  if (buildId) {
    await ownedBuild(db, buildId, actor.id);
    const rows = await db
      .select({ productId: buildItems.productId })
      .from(buildItems)
      .where(eq(buildItems.buildId, buildId));
    productIds.push(...rows.map((r) => r.productId));
  } else {
    const [p] = await db
      .select({ id: products.id })
      .from(products)
      .where(
        and(
          eq(products.id, (scope as { productId: string }).productId),
          eq(products.archived, false),
        ),
      );
    if (!p) throw new ActionError("notFound");
    productIds.push(p.id);
  }

  const runId = await db.transaction(async (tx) => {
    const [settings] = await tx.select().from(appSettings).where(eq(appSettings.id, 1));
    const cooldownMs = (settings?.userRunCooldownMinutes ?? DEFAULT_COOLDOWN_MINUTES) * 60_000;
    const skipMs = (settings?.recentCheckSkipMinutes ?? DEFAULT_SKIP_MINUTES) * 60_000;

    if (!isAdmin && cooldownMs > 0) {
      // A run that never left the queue because GitHub refused it doesn't count.
      const [last] = await tx
        .select({ createdAt: scrapeRuns.createdAt })
        .from(scrapeRuns)
        .where(
          and(
            eq(scrapeRuns.requestedBy, actor.id),
            eq(scrapeRuns.trigger, "manual"),
            gt(scrapeRuns.createdAt, new Date(now - cooldownMs)),
            or(not(eq(scrapeRuns.status, "failed")), not(isNull(scrapeRuns.startedAt))),
          ),
        )
        .orderBy(desc(scrapeRuns.createdAt))
        .limit(1);
      if (last) {
        const retryAfterSec = Math.max(
          1,
          Math.ceil((last.createdAt.getTime() + cooldownMs - now) / 1000),
        );
        throw new ActionError("rateLimited", { retryAfterSec });
      }
    }

    const merchantIds = await userMerchantIds(tx, actor.id);
    if (productIds.length === 0) throw new ActionError("emptyBuild");
    if (merchantIds.length === 0) throw new ActionError("noMerchants");
    let needsCheck = false;
    if (productIds.length > 0 && merchantIds.length > 0) {
      const pairs = await tx
        .select({
          productId: productMerchant.productId,
          merchantId: productMerchant.merchantId,
          enabled: productMerchant.enabled,
          checkedAt: productMerchant.lastCheckedAt,
        })
        .from(productMerchant)
        .where(
          and(
            inArray(productMerchant.productId, productIds),
            inArray(productMerchant.merchantId, merchantIds),
          ),
        );
      const byKey = new Map(pairs.map((p) => [`${p.productId}:${p.merchantId}`, p]));
      const cutoff = now - skipMs;
      for (const productId of productIds) {
        for (const merchantId of merchantIds) {
          const pair = byKey.get(`${productId}:${merchantId}`);
          if (pair && !pair.enabled) continue;
          if (!pair?.checkedAt || pair.checkedAt.getTime() < cutoff) needsCheck = true;
        }
      }
    }
    if (!needsCheck) throw new ActionError("nothingToCheck");

    const [run] = await tx
      .insert(scrapeRuns)
      .values({
        trigger: "manual",
        scope: buildId ? { buildId } : { productId: productIds[0]! },
        status: "queued",
        requestedBy: actor.id,
      })
      .returning({ id: scrapeRuns.id });
    return run!.id;
  });

  try {
    const result = await dispatchScrape(
      buildId ? { runId, buildId } : { runId, productId: productIds[0]! },
    );
    return result.dispatched
      ? { runId, dispatched: true }
      : { runId, dispatched: false, ...(isAdmin ? { command: result.command } : {}) };
  } catch (e) {
    await db
      .update(scrapeRuns)
      .set({ status: "failed", finishedAt: new Date() })
      .where(eq(scrapeRuns.id, runId));
    console.error("[startCheck]", e);
    throw new ActionError("dispatchFailed");
  }
}

/** A run's progress, for the requester or an admin; anyone else gets `notFound`. */
export async function runStatus(db: Db, actor: { id: string }, isAdmin: boolean, runId: string) {
  const [run] = await db.select().from(scrapeRuns).where(eq(scrapeRuns.id, runId));
  if (!run || (!isAdmin && run.requestedBy !== actor.id)) throw new ActionError("notFound");
  const logs = await db
    .select({
      productName: products.name,
      merchantName: merchants.name,
      status: scrapeLogs.status,
      message: scrapeLogs.message,
    })
    .from(scrapeLogs)
    .leftJoin(products, eq(products.id, scrapeLogs.productId))
    .leftJoin(merchants, eq(merchants.id, scrapeLogs.merchantId))
    .where(eq(scrapeLogs.runId, runId))
    .orderBy(asc(scrapeLogs.id))
    .limit(500);
  return {
    status: run.status,
    stats: run.stats ?? null,
    startedAt: run.startedAt ? run.startedAt.getTime() : null,
    finishedAt: run.finishedAt ? run.finishedAt.getTime() : null,
    logs,
  };
}

export type ReportInput = {
  buildId: string;
  productId: string;
  merchantId: string;
  reason?: string;
};

/**
 * Flags a pair's current offer as a wrong match: a pending review candidate for admins. The
 * product must be in the (already ownership-checked) build.
 */
export async function reportMatch(db: Db, userId: string, input: ReportInput) {
  return db.transaction(async (tx) => {
    const [item] = await tx
      .select({ productId: buildItems.productId })
      .from(buildItems)
      .where(and(eq(buildItems.buildId, input.buildId), eq(buildItems.productId, input.productId)));
    if (!item) throw new ActionError("notFound");

    const [pair] = await tx
      .select()
      .from(productMerchant)
      .where(
        and(
          eq(productMerchant.productId, input.productId),
          eq(productMerchant.merchantId, input.merchantId),
        ),
      );
    if (!pair) throw new ActionError("notFound");

    const [latest] = await tx
      .select({ url: pricePoints.url, title: pricePoints.title, priceEur: pricePoints.priceEur })
      .from(pricePoints)
      .where(
        and(
          eq(pricePoints.productId, input.productId),
          eq(pricePoints.merchantId, input.merchantId),
        ),
      )
      .orderBy(desc(pricePoints.ts))
      .limit(1);
    const url = pair.manualUrl ?? pair.autoUrl ?? latest?.url ?? null;
    if (!url) throw new ActionError("notFound");

    const [dupe] = await tx
      .select({ id: matchCandidates.id })
      .from(matchCandidates)
      .where(
        and(
          eq(matchCandidates.productId, input.productId),
          eq(matchCandidates.merchantId, input.merchantId),
          eq(matchCandidates.url, url),
          eq(matchCandidates.status, "pending"),
        ),
      );
    if (dupe) throw new ActionError("alreadyReported");

    const reason = input.reason?.trim();
    await tx.insert(matchCandidates).values({
      productId: input.productId,
      merchantId: input.merchantId,
      url,
      title: latest?.title ?? null,
      priceEur: latest?.priceEur ?? pair.lastPriceEur ?? null,
      score: pair.lastMatch?.score ?? 0,
      status: "pending",
      signals: {
        stage: "report",
        report: { userId, ...(reason ? { reason } : {}), at: Date.now() },
      },
    });
  });
}
