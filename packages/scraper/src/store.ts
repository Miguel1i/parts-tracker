/** DB reads and writes for a scrape run. */
import {
  planIdentifierUpdates,
  toCategory,
  type BlockEntry,
  type FxRates,
  type MatchTarget,
  type StoredIdentifier,
} from "@parts/core";
import {
  appSettings,
  blocklist,
  matchCandidates,
  merchants,
  pricePoints,
  productIdentifiers,
  productMerchant,
  products,
  scrapeLogs,
  scrapeRuns,
  type Db,
  type ScrapeStatus,
} from "@parts/db";
import { and, eq, gte, inArray, or } from "drizzle-orm";
import type { PairInput, PairMerchant, PairOutcome, PairState } from "./pair";
import { productAsin } from "./queries";

export type RunScope = { productId?: string; merchantId?: string };

type ProductRow = typeof products.$inferSelect;
type MerchantRow = typeof merchants.$inferSelect;
type IdentifierRow = typeof productIdentifiers.$inferSelect;

export interface PlannedPair {
  product: ProductRow;
  merchant: MerchantRow;
  state: PairState | null;
  lastCheckedAt: Date | null;
}

export interface RunData {
  pairs: PlannedPair[];
  targets: Map<string, MatchTarget>;
  /** productId → merchantId (null = every shop) → blocklist rows. */
  blocks: Map<string, Map<string | null, BlockEntry[]>>;
  asins: Map<string, string | null>;
}

const DAY = 86_400_000;

export function toTarget(
  product: ProductRow,
  identifiers: IdentifierRow[],
  recentPrices: number[],
  blocks: BlockEntry[] = [],
): MatchTarget {
  return {
    name: product.name,
    query: product.query,
    brand: product.brand,
    category: toCategory(product.category),
    refPrice: product.refPrice,
    recentPrices,
    identifiers: identifiers.map((i) => ({
      kind: i.kind,
      value: i.value,
      source: i.source,
      confirmed: i.confirmed,
      confidence: i.confidence,
    })),
    spec: product.matchSpec ?? {},
    blocklist: blocks,
  };
}

/** Products × enabled merchants in scope, minus pairs switched off in `product_merchant`. */
export async function loadRunData(db: Db, scope: RunScope, now: Date): Promise<RunData> {
  const productRows = await db
    .select()
    .from(products)
    .where(scope.productId ? eq(products.id, scope.productId) : eq(products.archived, false));
  const merchantRows = await db
    .select()
    .from(merchants)
    .where(scope.merchantId ? eq(merchants.id, scope.merchantId) : eq(merchants.enabled, true));
  const productIds = productRows.map((p) => p.id);
  if (!productIds.length || !merchantRows.length) {
    return { pairs: [], targets: new Map(), blocks: new Map(), asins: new Map() };
  }

  const [states, ids, blocks, prices] = await Promise.all([
    db.select().from(productMerchant).where(inArray(productMerchant.productId, productIds)),
    db.select().from(productIdentifiers).where(inArray(productIdentifiers.productId, productIds)),
    db.select().from(blocklist).where(inArray(blocklist.productId, productIds)),
    db
      .select({ productId: pricePoints.productId, priceEur: pricePoints.priceEur })
      .from(pricePoints)
      .where(
        and(
          inArray(pricePoints.productId, productIds),
          gte(pricePoints.ts, new Date(now.getTime() - 30 * DAY)),
        ),
      ),
  ]);

  const targets = new Map<string, MatchTarget>();
  const blockMap: RunData["blocks"] = new Map();
  const asins = new Map<string, string | null>();
  for (const p of productRows) {
    const pIds = ids.filter((i) => i.productId === p.id);
    const pBlocks = blocks.filter((b) => b.productId === p.id);
    const byMerchant = new Map<string | null, BlockEntry[]>();
    for (const b of pBlocks) {
      const list = byMerchant.get(b.merchantId) ?? [];
      list.push({ url: b.url, name: b.name, externalId: b.externalId });
      byMerchant.set(b.merchantId, list);
    }
    const target = toTarget(
      p,
      pIds,
      prices.filter((x) => x.productId === p.id).map((x) => x.priceEur),
    );
    targets.set(p.id, target);
    blockMap.set(p.id, byMerchant);
    const pStates = states.filter((s) => s.productId === p.id);
    asins.set(
      p.id,
      productAsin(
        target,
        pStates.flatMap((s) => [s.manualUrl, s.autoUrl]),
      ),
    );
  }

  const pairs: PlannedPair[] = [];
  for (const product of productRows) {
    for (const merchant of merchantRows) {
      const s = states.find((x) => x.productId === product.id && x.merchantId === merchant.id);
      if (s && !s.enabled) continue;
      pairs.push({
        product,
        merchant,
        state: s
          ? { manualUrl: s.manualUrl, autoUrl: s.autoUrl, autoUrlFailures: s.autoUrlFailures }
          : null,
        lastCheckedAt: s?.lastCheckedAt ?? null,
      });
    }
  }
  return { pairs, targets, blocks: blockMap, asins };
}

export function pairInput(pair: PlannedPair, data: RunData, rates: FxRates): PairInput {
  const m = pair.merchant;
  const blocks = data.blocks.get(pair.product.id);
  const merchant: PairMerchant = {
    id: m.id,
    name: m.name,
    baseUrl: m.baseUrl,
    searchTemplate: m.searchTemplate,
    currency: m.currency,
    country: m.country,
    ownOnly: m.ownOnly,
    needsBrowser: m.needsBrowser,
    adapterConfig: m.adapterConfig ?? {},
  };
  return {
    productId: pair.product.id,
    productName: pair.product.name,
    merchant,
    state: pair.state,
    target: {
      ...data.targets.get(pair.product.id)!,
      blocklist: [...(blocks?.get(null) ?? []), ...(blocks?.get(m.id) ?? [])],
    },
    asin: data.asins.get(pair.product.id) ?? null,
    rates,
  };
}

export async function recentSkipMinutes(db: Db): Promise<number> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.id, 1));
  return row?.recentCheckSkipMinutes ?? 30;
}

// ------------------------------------------------------------------ runs

export async function startRun(
  db: Db,
  input: { runId?: string; trigger: "cron" | "manual"; scope: RunScope; ghRunUrl?: string },
  now: Date,
): Promise<string> {
  const values = {
    status: "running" as const,
    startedAt: now,
    ...(input.ghRunUrl ? { ghRunUrl: input.ghRunUrl } : {}),
  };
  if (input.runId) {
    const [existing] = await db.select().from(scrapeRuns).where(eq(scrapeRuns.id, input.runId));
    if (existing) {
      await db.update(scrapeRuns).set(values).where(eq(scrapeRuns.id, input.runId));
      return input.runId;
    }
  }
  const [row] = await db
    .insert(scrapeRuns)
    .values({
      ...(input.runId ? { id: input.runId } : {}),
      trigger: input.trigger,
      scope: input.scope,
      ...values,
    })
    .returning({ id: scrapeRuns.id });
  return row!.id;
}

export async function finishRun(
  db: Db,
  runId: string,
  status: "succeeded" | "failed",
  stats: Record<string, number>,
  now: Date,
) {
  await db
    .update(scrapeRuns)
    .set({ status, stats, finishedAt: now })
    .where(eq(scrapeRuns.id, runId));
}

const LOG_LIMIT = 8000;

export function truncateTrace(lines: string[], limit = LOG_LIMIT): string {
  const text = lines.join("\n");
  if (text.length <= limit) return text;
  const head = text.slice(0, limit - 400);
  const tail = text.slice(-300);
  return `${head}\n… (${text.length - head.length - tail.length} chars cut) …\n${tail}`;
}

export function shippingFor(
  merchant: { shipping: number; freeShippingOver: number | null },
  priceEur: number,
): number {
  if (merchant.freeShippingOver != null && priceEur >= merchant.freeShippingOver) return 0;
  return merchant.shipping;
}

/** Writes one pair's outcome: log, price point, candidate, pair state, learned identifiers. */
export async function savePair(
  db: Db,
  runId: string,
  pair: PlannedPair,
  outcome: PairOutcome,
  now: Date,
) {
  const productId = pair.product.id;
  const merchantId = pair.merchant.id;
  const accepted = outcome.accepted;

  await db.insert(scrapeLogs).values({
    runId,
    productId,
    merchantId,
    status: outcome.status,
    message: `${outcome.message} [${outcome.ms} ms]`.slice(0, 500),
    log: truncateTrace(outcome.trace),
  });

  if (accepted?.offer.price) {
    const price = accepted.offer.price;
    await db.insert(pricePoints).values({
      productId,
      merchantId,
      ts: now,
      priceEur: price.eur,
      priceOrig: price.currency === "EUR" ? null : price.value,
      currency: price.currency,
      shipping: shippingFor(pair.merchant, price.eur),
      inStock: accepted.offer.stock !== "out_of_stock",
      url: accepted.offer.url,
      title: accepted.offer.title ?? null,
      runId,
    });
  }

  if (outcome.review) {
    const r = outcome.review;
    const url = r.offer.canonicalUrl;
    const values = {
      title: r.offer.title ?? null,
      priceEur: r.offer.price?.eur ?? null,
      score: r.decision.score,
      signals: {
        results: r.decision.results,
        vetoes: r.decision.vetoes,
        similarity: r.decision.similarity,
        stage: r.offer.stage,
      },
      runId,
    };
    // One pending row per pair + canonical URL; a rejected one stays rejected.
    const [existing] = await db
      .select({ id: matchCandidates.id, status: matchCandidates.status })
      .from(matchCandidates)
      .where(
        and(
          eq(matchCandidates.productId, productId),
          eq(matchCandidates.merchantId, merchantId),
          eq(matchCandidates.url, url),
        ),
      );
    if (!existing) {
      await db
        .insert(matchCandidates)
        .values({ productId, merchantId, url, status: "pending", ...values });
    } else if (existing.status === "pending") {
      await db.update(matchCandidates).set(values).where(eq(matchCandidates.id, existing.id));
    }
  }

  const state = {
    lastStatus: outcome.status,
    lastCheckedAt: now,
    ...(accepted?.offer.price ? { lastPriceEur: accepted.offer.price.eur } : {}),
    ...(outcome.lastMatch ? { lastMatch: outcome.lastMatch } : {}),
    ...(outcome.autoUrl
      ? { autoUrl: outcome.autoUrl.url, autoUrlFailures: outcome.autoUrl.failures }
      : {}),
  };
  await db
    .insert(productMerchant)
    .values({ productId, merchantId, ...state })
    .onConflictDoUpdate({
      target: [productMerchant.productId, productMerchant.merchantId],
      set: state,
    });

  if (accepted) await applyIdentifierUpdates(db, productId, merchantId, outcome, now);
}

async function applyIdentifierUpdates(
  db: Db,
  productId: string,
  merchantId: string,
  outcome: PairOutcome,
  now: Date,
) {
  const accepted = outcome.accepted!;
  const rows = await db
    .select()
    .from(productIdentifiers)
    .where(eq(productIdentifiers.productId, productId));
  const existing: StoredIdentifier[] = rows.map((r) => ({
    kind: r.kind,
    value: r.value,
    source: r.source,
    confirmed: r.confirmed,
    confidence: r.confidence,
    sightings: r.sightings ?? [],
  }));
  const updates = planIdentifierUpdates({
    existing,
    offer: accepted.offer,
    decision: accepted.decision,
    merchantId,
    now: now.getTime(),
    pinned: accepted.via === "manual",
  });
  for (const u of updates) {
    const where = and(
      eq(productIdentifiers.productId, productId),
      eq(productIdentifiers.kind, u.kind),
      eq(productIdentifiers.value, u.value),
    );
    if (u.op === "insert") {
      await db
        .insert(productIdentifiers)
        .values({
          productId,
          kind: u.kind,
          value: u.value,
          source: "learned",
          sourceMerchantId: u.sourceMerchantId,
          confidence: u.confidence,
          confirmed: false,
          sightings: u.sightings,
        })
        .onConflictDoNothing();
      outcome.trace.push(`  learned ${u.kind} ${u.value}`);
    } else if (u.op === "update") {
      const { op: _op, kind: _k, value: _v, ...set } = u;
      if (Object.keys(set).length) await db.update(productIdentifiers).set(set).where(where);
      if (u.confirmed) outcome.trace.push(`  confirmed ${u.kind} ${u.value}`);
      else if (u.confidence != null)
        outcome.trace.push(`  ${u.kind} ${u.value} confidence → ${u.confidence}`);
    } else {
      await db.delete(productIdentifiers).where(where);
      outcome.trace.push(`  deleted suspect ${u.kind} ${u.value}`);
    }
  }
}

/** ok when nothing failed, blocked when every pair was blocked, degraded otherwise. */
export function merchantHealth(statuses: ScrapeStatus[]): "ok" | "degraded" | "blocked" | null {
  if (!statuses.length) return null;
  if (statuses.every((s) => s === "blocked")) return "blocked";
  if (statuses.some((s) => s === "blocked" || s === "error")) return "degraded";
  return "ok";
}

export async function saveMerchantHealth(
  db: Db,
  merchantId: string,
  statuses: ScrapeStatus[],
  now: Date,
) {
  const health = merchantHealth(statuses);
  if (!health) return;
  await db
    .update(merchants)
    .set({ lastHealth: health, lastHealthAt: now })
    .where(eq(merchants.id, merchantId));
}

/** Lookups by id, slug or name for the CLI flags. */
export async function findMerchant(db: Db, key: string) {
  const [row] = await db
    .select()
    .from(merchants)
    .where(or(eq(merchants.id, key), eq(merchants.slug, key), eq(merchants.name, key)));
  return row ?? null;
}

export async function findProduct(db: Db, key: string) {
  const [row] = await db
    .select()
    .from(products)
    .where(or(eq(products.id, key), eq(products.name, key)));
  return row ?? null;
}
