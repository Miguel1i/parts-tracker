import "server-only";
import { toCategory } from "@parts/core";
import {
  buildItems,
  builds,
  merchants,
  pricePoints,
  products,
  scrapeRuns,
  userPreferences,
  type Db,
} from "@parts/db";
import { and, desc, eq, gte, inArray, sql } from "@parts/db/orm";
import { bestOffers, priceWithShipping, shippingFor, userMerchantIds } from "@/lib/builds/queries";
import {
  DAY_MS,
  STALE_MS,
  buildTotals,
  downsample,
  lowestBand,
  movers,
  sparkline,
  type BuildItem,
  type BuildTotal,
  type Mover,
  type Obs,
} from "./transforms";

type Conn = Pick<Db, "select">;
const CHUNK = 400;

/**
 * Observations of many products at once (one query per chunk, no per-product queries), only
 * for the merchants this user compares. With `from`, only newer points plus, when `carry`,
 * each pair's last point before `from` so the first moments of the range still have a price.
 */
/**
 * How far back the dashboard and build charts read. price_points is append-only and grows every
 * run, so pages read a bounded window (the longest preset, 1y, plus margin) rather than all of it;
 * the product page's "All" range still reads everything for one product.
 */
export const HISTORY_WINDOW_MS = 400 * DAY_MS;

export async function loadObsByProduct(
  db: Conn,
  opts: { userId: string; productIds: string[]; from: number | null; carry?: boolean },
): Promise<Map<string, Obs[]>> {
  const out = new Map<string, Obs[]>();
  const ids = [...new Set(opts.productIds)];
  if (ids.length === 0) return out;
  const allowed = await userMerchantIds(db, opts.userId);
  if (allowed.length === 0) return out;
  const mrows = await db
    .select({ id: merchants.id, shipping: merchants.shipping, free: merchants.freeShippingOver })
    .from(merchants)
    .where(inArray(merchants.id, allowed));
  const rule = new Map(mrows.map((m) => [m.id, m]));
  const push = (r: typeof pricePoints.$inferSelect) => {
    const m = rule.get(r.merchantId);
    if (!m) return;
    const o: Obs = {
      merchantId: r.merchantId,
      ts: r.ts.getTime(),
      price: r.priceEur,
      shipping: r.shipping ?? shippingFor(r.priceEur, m.shipping, m.free),
      inStock: r.inStock,
    };
    const list = out.get(r.productId);
    if (list) list.push(o);
    else out.set(r.productId, [o]);
  };
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK);
    const rows = await db
      .select()
      .from(pricePoints)
      .where(
        and(
          inArray(pricePoints.productId, part),
          inArray(pricePoints.merchantId, allowed),
          opts.from == null ? undefined : gte(pricePoints.ts, new Date(opts.from)),
        ),
      );
    rows.forEach(push);
    if (opts.carry && opts.from != null) {
      const fromMs = opts.from;
      const carried = await db
        .select()
        .from(pricePoints)
        .where(
          and(
            inArray(pricePoints.productId, part),
            inArray(pricePoints.merchantId, allowed),
            sql`${pricePoints.id} = (select p2.id from price_points p2 where p2.product_id = ${pricePoints.productId} and p2.merchant_id = ${pricePoints.merchantId} and p2.ts < ${fromMs} order by p2.ts desc, p2.id desc limit 1)`,
          ),
        );
      carried.forEach(push);
    }
  }
  for (const list of out.values()) list.sort((a, b) => a.ts - b.ts);
  return out;
}

/**
 * Chart categories, in fixed order so each keeps its colour slot on every chart: eight named
 * categories take the eight categorical slots; everything else (fans, monitors, HDDs,
 * uncategorized) folds into "other", drawn in neutral grey (slot 0) rather than a ninth hue.
 */
export const CHART_CATEGORIES = [
  "cpu",
  "gpu",
  "motherboard",
  "ram",
  "ssd",
  "psu",
  "case",
  "cooler",
] as const;

export function categoryKey(raw: string | null): string {
  const c = toCategory(raw);
  return (CHART_CATEGORIES as readonly string[]).includes(c) ? c : "other";
}
/** 1-8 for the named categories, 0 (neutral) for "other". */
export function categorySlot(key: string): number {
  return (CHART_CATEGORIES as readonly string[]).indexOf(key) + 1;
}

export type ChartRow = {
  ts: number;
  total: number | null;
  missing: number;
  [category: string]: number | null;
};

export type BuildChartData = {
  anywhere: ChartRow[];
  single: ChartRow[];
  /** Categories present in the build, in fixed order. */
  categories: { key: string; slot: number }[];
  /** Σ reference price × quantity over items that have one; null when none do. */
  refTotal: number | null;
  withShipping: boolean;
};

const MAX_POINTS = 500;

/**
 * Totals over the parts priced at each moment; the stack shows which category is missing when a
 * part has no in-stock offer, and the tooltip says how many parts lack a price.
 */
function toRows(totals: BuildTotal[]): ChartRow[] {
  const mapped = totals.map((t) => ({ ...t, value: t.total }));
  return downsample(mapped, MAX_POINTS).map((t) => ({
    ts: t.ts,
    total: t.total,
    missing: t.missing,
    ...t.byCategory,
  }));
}

type ChartItem = {
  productId: string;
  quantity: number;
  category: string | null;
  refPrice: number | null;
};

function toBuildItems(items: ChartItem[]): BuildItem[] {
  return items.map((i) => ({
    productId: i.productId,
    quantity: i.quantity,
    category: categoryKey(i.category),
  }));
}

/** Pure: the data the build-total chart needs. */
export function buildChartData(
  items: ChartItem[],
  obsByProduct: Map<string, Obs[]>,
  withShipping: boolean,
): BuildChartData {
  const bi = toBuildItems(items);
  const base = { withShipping, staleMs: STALE_MS };
  const present = new Set(bi.map((i) => i.category));
  const refs = items.filter((i) => i.refPrice != null);
  return {
    anywhere: toRows(buildTotals(bi, obsByProduct, { ...base, mode: "anywhere" })),
    single: toRows(buildTotals(bi, obsByProduct, { ...base, mode: "singleMerchant" })),
    categories: [...CHART_CATEGORIES, "other"]
      .filter((c) => present.has(c))
      .map((key) => ({ key, slot: categorySlot(key) })),
    refTotal: refs.length ? refs.reduce((n, i) => n + i.refPrice! * i.quantity, 0) : null,
    withShipping,
  };
}

/** Pure: last-30-day sparkline values of a build total, only comparable (same missing) points. */
export function totalSpark(totals: BuildTotal[], now: number, days = 30): (number | null)[] {
  const recent = totals.filter((t) => t.ts >= now - days * DAY_MS && t.total != null);
  const last = recent[recent.length - 1];
  if (!last) return [];
  const same = recent.filter((t) => t.missing === last.missing);
  return downsample(
    same.map((t) => ({ ts: t.ts, value: t.total })),
    30,
  ).map((p) => p.value);
}

/** Pure: per-product 30-day sparkline values. */
export function productSparks(
  obsByProduct: Map<string, Obs[]>,
  productIds: string[],
  now: number,
  withShipping: boolean,
): Record<string, (number | null)[]> {
  return Object.fromEntries(
    productIds.map((id) => [
      id,
      sparkline(obsByProduct.get(id) ?? [], { days: 30, now, withShipping }).map((p) => p.value),
    ]),
  );
}

export type PriceChange = {
  productId: string;
  name: string;
  merchantId: string;
  ts: number;
  from: number;
  to: number;
  delta: number;
};

/** Pure: changes of each product's cheapest in-stock price, newest first. */
export function bestPriceChanges(
  prods: { productId: string; name: string; obs: Obs[] }[],
  opts: { now: number; days: number; withShipping: boolean; limit: number },
): PriceChange[] {
  const out: PriceChange[] = [];
  const since = opts.now - opts.days * DAY_MS;
  for (const p of prods) {
    const band = lowestBand(p.obs, { withShipping: opts.withShipping, staleMs: STALE_MS });
    let prev: number | null = null;
    for (const b of band) {
      if (b.min == null) continue;
      if (prev != null && Math.abs(b.min - prev) >= 0.005 && b.ts >= since && b.merchantId) {
        out.push({
          productId: p.productId,
          name: p.name,
          merchantId: b.merchantId,
          ts: b.ts,
          from: prev,
          to: b.min,
          delta: b.min - prev,
        });
      }
      prev = b.min;
    }
  }
  return out.sort((a, b) => b.ts - a.ts || a.name.localeCompare(b.name)).slice(0, opts.limit);
}

/** Pure: top `n` drops and top `n` rises, drops first (most negative at the top). */
export function topMovers(list: Mover[], n: number): Mover[] {
  const drops = list.filter((m) => m.pct < 0).slice(0, n);
  const rises = list.filter((m) => m.pct > 0).slice(0, n);
  return [...drops, ...rises].sort((a, b) => a.pct - b.pct);
}

export type DashboardData = {
  build: { id: string; name: string } | null;
  buildCount: number;
  total: number;
  missing: number;
  savings: number | null;
  withShipping: boolean;
  merchantCount: number;
  lastRun: { status: string; at: number | null } | null;
  totalSpark: (number | null)[];
  chart: BuildChartData | null;
  feed: (PriceChange & { merchantName: string })[];
  movers: { "7": Mover[]; "30": Mover[] };
};

/** Everything the signed-in dashboard shows. */
export async function loadDashboard(db: Conn, userId: string): Promise<DashboardData> {
  const now = Date.now();
  const withShipping = await priceWithShipping(db, userId);
  const [pref] = await db
    .select({ id: userPreferences.defaultBuildId })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId));
  const mine = await db
    .select({ id: builds.id, name: builds.name })
    .from(builds)
    .where(eq(builds.userId, userId))
    .orderBy(desc(builds.updatedAt));
  const build = mine.find((b) => b.id === pref?.id) ?? mine[0] ?? null;
  const merchantCount = (await userMerchantIds(db, userId)).length;
  const [run] = await db
    .select({ status: scrapeRuns.status, at: scrapeRuns.finishedAt, created: scrapeRuns.createdAt })
    .from(scrapeRuns)
    .orderBy(desc(scrapeRuns.createdAt))
    .limit(1);
  const lastRun = run
    ? { status: run.status, at: (run.at ?? run.created)?.getTime() ?? null }
    : null;
  const empty: DashboardData = {
    build,
    buildCount: mine.length,
    total: 0,
    missing: 0,
    savings: null,
    withShipping,
    merchantCount,
    lastRun,
    totalSpark: [],
    chart: null,
    feed: [],
    movers: { "7": [], "30": [] },
  };
  if (!build) return empty;

  const rows = await db
    .select({
      buildId: buildItems.buildId,
      productId: buildItems.productId,
      quantity: buildItems.quantity,
      name: products.name,
      category: products.category,
      refPrice: products.refPrice,
    })
    .from(buildItems)
    .innerJoin(products, eq(products.id, buildItems.productId))
    .where(
      inArray(
        buildItems.buildId,
        mine.map((b) => b.id),
      ),
    );
  const items = rows.filter((r) => r.buildId === build.id);
  const productIds = [...new Set(rows.map((r) => r.productId))];
  const obs = await loadObsByProduct(db, {
    userId,
    productIds,
    from: Date.now() - HISTORY_WINDOW_MS,
  });

  const offers = await bestOffers(
    db,
    userId,
    items.map((i) => i.productId),
  );
  let total = 0;
  let missing = 0;
  let ref = 0;
  let pricedRef = 0;
  let any = false;
  for (const i of items) {
    const o = offers.get(i.productId);
    if (!o) {
      missing++;
      continue;
    }
    total += o.unitTotal * i.quantity;
    if (i.refPrice != null) {
      any = true;
      ref += i.refPrice * i.quantity;
      pricedRef += o.unitTotal * i.quantity;
    }
  }

  const names = new Map(rows.map((r) => [r.productId, r.name]));
  const prods = productIds.map((id) => ({
    productId: id,
    name: names.get(id)!,
    obs: obs.get(id) ?? [],
  }));
  const mnames = new Map(
    (await db.select({ id: merchants.id, name: merchants.name }).from(merchants)).map((m) => [
      m.id,
      m.name,
    ]),
  );
  const feed = bestPriceChanges(prods, { now, days: 14, withShipping, limit: 10 }).map((c) => ({
    ...c,
    merchantName: mnames.get(c.merchantId) ?? "",
  }));
  const mv = (days: number) => topMovers(movers(prods, { days, now, withShipping }), 5);
  const totals = buildTotals(toBuildItems(items), obs, {
    mode: "anywhere",
    withShipping,
    staleMs: STALE_MS,
  });
  return {
    ...empty,
    total,
    missing,
    savings: any ? ref - pricedRef : null,
    totalSpark: totalSpark(totals, now),
    chart: buildChartData(items, obs, withShipping),
    feed,
    movers: { "7": mv(7), "30": mv(30) },
  };
}

/** Loader for the build page: chart data plus per-product sparklines in one obs query. */
export async function loadBuildCharts(
  db: Conn,
  userId: string,
  buildId: string,
  withShipping: boolean,
): Promise<{ chart: BuildChartData; sparks: Record<string, (number | null)[]> }> {
  const rows = await db
    .select({
      productId: buildItems.productId,
      quantity: buildItems.quantity,
      category: products.category,
      refPrice: products.refPrice,
    })
    .from(buildItems)
    .innerJoin(products, eq(products.id, buildItems.productId))
    .where(eq(buildItems.buildId, buildId));
  const ids = rows.map((r) => r.productId);
  const obs = await loadObsByProduct(db, {
    userId,
    productIds: ids,
    from: Date.now() - HISTORY_WINDOW_MS,
  });
  return {
    chart: buildChartData(rows, obs, withShipping),
    sparks: productSparks(obs, ids, Date.now(), withShipping),
  };
}

/** Per-build 30-day total sparklines for the builds list (one obs query for all builds). */
export async function loadBuildSparks(
  db: Conn,
  userId: string,
  buildIds: string[],
  withShipping: boolean,
): Promise<Record<string, (number | null)[]>> {
  if (buildIds.length === 0) return {};
  const now = Date.now();
  const rows = await db
    .select({
      buildId: buildItems.buildId,
      productId: buildItems.productId,
      quantity: buildItems.quantity,
      category: products.category,
    })
    .from(buildItems)
    .innerJoin(products, eq(products.id, buildItems.productId))
    .where(inArray(buildItems.buildId, buildIds));
  const obs = await loadObsByProduct(db, {
    userId,
    productIds: rows.map((r) => r.productId),
    from: now - 31 * DAY_MS,
    carry: true,
  });
  return Object.fromEntries(
    buildIds.map((id) => {
      const items = toBuildItems(
        rows.filter((r) => r.buildId === id).map((r) => ({ ...r, refPrice: null })),
      );
      const totals = buildTotals(items, obs, {
        mode: "anywhere",
        withShipping,
        staleMs: STALE_MS,
      });
      return [id, totalSpark(totals, now)];
    }),
  );
}
