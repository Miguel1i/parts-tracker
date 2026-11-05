/**
 * Pure data transforms for the price charts. No I/O; every timestamp is a ms number and every
 * price is already EUR. Nothing here invents values: gaps become `null`, never an estimate.
 */

export const DAY_MS = 86_400_000;
/** A pair not seen for longer than this has a gap in its step line. */
export const GAP_MS = 3 * DAY_MS;
/** A merchant's last observation older than this no longer counts towards "the lowest". */
export const STALE_MS = 7 * DAY_MS;

export type Obs = {
  merchantId: string;
  ts: number;
  /** Shelf price in EUR. */
  price: number;
  /** Shipping added when the user compares with shipping. */
  shipping: number;
  inStock: boolean;
  url?: string | null;
  title?: string | null;
  runId?: string | null;
};

export type SeriesPoint = { ts: number; value: number | null; inStock: boolean; obs?: Obs };
export type BandPoint = { ts: number; min: number | null; merchantId: string | null };

/** The price the user compares: shelf price, plus shipping when asked. */
export function effective(o: Pick<Obs, "price" | "shipping">, withShipping: boolean): number {
  return withShipping ? o.price + o.shipping : o.price;
}

function groupByMerchant(obs: Obs[]): Map<string, Obs[]> {
  const out = new Map<string, Obs[]>();
  for (const o of [...obs].sort((a, b) => a.ts - b.ts)) {
    const list = out.get(o.merchantId);
    if (list) list.push(o);
    else out.set(o.merchantId, [o]);
  }
  return out;
}

/** Index of the last element with ts <= t, or -1. `list` is sorted by ts. */
function lastAtOrBefore(list: Obs[], t: number): number {
  let lo = 0;
  let hi = list.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid]!.ts <= t) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

/** Per-merchant step series, sorted by ts, with a null point wherever the data has a gap. */
export function stepSeries(
  obs: Obs[],
  opts: { withShipping: boolean; gapMs: number },
): Map<string, SeriesPoint[]> {
  const out = new Map<string, SeriesPoint[]>();
  for (const [merchantId, list] of groupByMerchant(obs)) {
    const points: SeriesPoint[] = [];
    list.forEach((o, i) => {
      points.push({ ts: o.ts, value: effective(o, opts.withShipping), inStock: o.inStock, obs: o });
      const next = list[i + 1];
      if (next && next.ts - o.ts > opts.gapMs) {
        // The line holds for gapMs, then breaks until the next real observation.
        points.push({ ts: o.ts + opts.gapMs, value: null, inStock: o.inStock });
      }
    });
    out.set(merchantId, points);
  }
  return out;
}

type Cheapest = { value: number; merchantId: string };

/** Looks up the cheapest fresh in-stock price of a set of observations at any time. */
function cheapestLookup(obs: Obs[], withShipping: boolean, staleMs: number) {
  const groups = [...groupByMerchant(obs)].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const priceOf = (list: Obs[], t: number): number | null => {
    const i = lastAtOrBefore(list, t);
    if (i < 0) return null;
    const o = list[i]!;
    if (!o.inStock || t - o.ts > staleMs) return null;
    return effective(o, withShipping);
  };
  return {
    merchants: groups.map(([id]) => id),
    /** The cheapest merchant at `t` (ties go to the lowest merchant id). */
    at(t: number): Cheapest | null {
      let best: Cheapest | null = null;
      for (const [merchantId, list] of groups) {
        const value = priceOf(list, t);
        if (value != null && (!best || value < best.value)) best = { value, merchantId };
      }
      return best;
    },
    /** One merchant's usable price at `t`. */
    ofMerchant(merchantId: string, t: number): number | null {
      const list = groups.find(([id]) => id === merchantId)?.[1];
      return list ? priceOf(list, t) : null;
    },
  };
}

/** The cheapest in-stock effective price at every observation timestamp. */
export function lowestBand(
  obs: Obs[],
  opts: { withShipping: boolean; staleMs: number },
): BandPoint[] {
  const lookup = cheapestLookup(obs, opts.withShipping, opts.staleMs);
  const times = [...new Set(obs.map((o) => o.ts))].sort((a, b) => a - b);
  return times.map((ts) => {
    const c = lookup.at(ts);
    return { ts, min: c?.value ?? null, merchantId: c?.merchantId ?? null };
  });
}

export type SeriesStats = {
  min: { value: number; ts: number } | null;
  max: { value: number; ts: number } | null;
  avg: number | null;
  last: { value: number; ts: number } | null;
};

/** Min / max / mean / latest of a series, ignoring null points. Ties keep the earliest. */
export function seriesStats(points: { ts: number; value: number | null }[]): SeriesStats {
  let min: SeriesStats["min"] = null;
  let max: SeriesStats["max"] = null;
  let last: SeriesStats["last"] = null;
  let sum = 0;
  let n = 0;
  for (const p of points) {
    if (p.value == null) continue;
    n++;
    sum += p.value;
    if (!min || p.value < min.value) min = { value: p.value, ts: p.ts };
    if (!max || p.value > max.value) max = { value: p.value, ts: p.ts };
    if (!last || p.ts >= last.ts) last = { value: p.value, ts: p.ts };
  }
  return { min, max, avg: n ? sum / n : null, last };
}

/**
 * Keeps a series under `maxPoints` by bucketing it (by UTC day, then by wider multiples of a
 * day if needed) and keeping each bucket's lowest and last point, plus one gap marker per
 * bucket. Only original points are returned, so the all-time low survives exactly.
 */
export function downsample<T extends { ts: number; value: number | null }>(
  points: T[],
  maxPoints: number,
): T[] {
  if (points.length <= maxPoints) return points;
  const sorted = [...points].sort((a, b) => a.ts - b.ts);
  const span = sorted[sorted.length - 1]!.ts - sorted[0]!.ts;
  let result = sorted;
  for (let days = 1; ; days++) {
    const bucketMs = days * DAY_MS;
    const buckets = new Map<number, number[]>();
    sorted.forEach((p, i) => {
      const key = Math.floor(p.ts / bucketMs);
      const list = buckets.get(key);
      if (list) list.push(i);
      else buckets.set(key, [i]);
    });
    const keep = new Set<number>();
    for (const idx of buckets.values()) {
      let minIdx = -1;
      let gapIdx = -1;
      for (const i of idx) {
        const v = sorted[i]!.value;
        if (v == null) {
          if (gapIdx < 0) gapIdx = i;
        } else if (minIdx < 0 || v < sorted[minIdx]!.value!) minIdx = i;
      }
      if (minIdx >= 0) keep.add(minIdx);
      if (gapIdx >= 0) keep.add(gapIdx);
      keep.add(idx[idx.length - 1]!);
    }
    result = [...keep].sort((a, b) => a - b).map((i) => sorted[i]!);
    if (result.length <= maxPoints || bucketMs > span) break;
  }
  return result;
}

export type BuildItem = { productId: string; quantity: number; category: string | null };
export type BuildTotal = {
  ts: number;
  total: number | null;
  byCategory: Record<string, number>;
  /** Distinct products with no usable price at `ts`. */
  missing: number;
};

export const UNCATEGORIZED = "uncategorized";

/**
 * The cost of a build over time. "anywhere" buys every part at its cheapest shop (parts with
 * no price yet are skipped and counted in `missing`); "singleMerchant" is the cheapest one shop
 * that has every part in stock (`total` null when none does).
 */
export function buildTotals(
  items: BuildItem[],
  obsByProduct: Map<string, Obs[]>,
  opts: { mode: "anywhere" | "singleMerchant"; withShipping: boolean; staleMs: number },
): BuildTotal[] {
  const productIds = [...new Set(items.map((i) => i.productId))];
  if (productIds.length === 0) return [];
  const lookups = new Map(
    productIds.map((id) => [
      id,
      cheapestLookup(obsByProduct.get(id) ?? [], opts.withShipping, opts.staleMs),
    ]),
  );
  const times = [
    ...new Set(productIds.flatMap((id) => (obsByProduct.get(id) ?? []).map((o) => o.ts))),
  ].sort((a, b) => a - b);
  const allMerchants = [...new Set(productIds.flatMap((id) => lookups.get(id)!.merchants))].sort();

  return times.map((ts): BuildTotal => {
    const missing = productIds.filter((id) => !lookups.get(id)!.at(ts)).length;
    if (opts.mode === "anywhere") {
      const byCategory: Record<string, number> = {};
      let total = 0;
      let priced = 0;
      for (const item of items) {
        const c = lookups.get(item.productId)!.at(ts);
        if (!c) continue;
        const cost = c.value * item.quantity;
        total += cost;
        priced++;
        const cat = item.category ?? UNCATEGORIZED;
        byCategory[cat] = (byCategory[cat] ?? 0) + cost;
      }
      return { ts, total: priced ? total : null, byCategory, missing };
    }
    let best: { total: number; byCategory: Record<string, number> } | null = null;
    for (const merchantId of allMerchants) {
      let total = 0;
      const byCategory: Record<string, number> = {};
      let complete = true;
      for (const item of items) {
        const v = lookups.get(item.productId)!.ofMerchant(merchantId, ts);
        if (v == null) {
          complete = false;
          break;
        }
        const cost = v * item.quantity;
        total += cost;
        const cat = item.category ?? UNCATEGORIZED;
        byCategory[cat] = (byCategory[cat] ?? 0) + cost;
      }
      if (complete && (!best || total < best.total)) best = { total, byCategory };
    }
    return best
      ? { ts, total: best.total, byCategory: best.byCategory, missing }
      : { ts, total: null, byCategory: {}, missing };
  });
}

export type Mover = {
  productId: string;
  name: string;
  from: number;
  to: number;
  delta: number;
  pct: number;
};

/** Change of each product's cheapest in-stock price over the last `days`, biggest first. */
export function movers(
  products: { productId: string; name: string; obs: Obs[] }[],
  opts: { days: number; now: number; withShipping: boolean },
): Mover[] {
  const out: Mover[] = [];
  for (const p of products) {
    const lookup = cheapestLookup(p.obs, opts.withShipping, Infinity);
    const from = lookup.at(opts.now - opts.days * DAY_MS)?.value;
    const to = lookup.at(opts.now)?.value;
    if (from == null || to == null || from <= 0) continue;
    out.push({
      productId: p.productId,
      name: p.name,
      from,
      to,
      delta: to - from,
      pct: ((to - from) / from) * 100,
    });
  }
  return out.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct) || a.name.localeCompare(b.name));
}

/**
 * The cheapest in-stock price sampled over the last `days` (at most `points` samples, evenly
 * spaced, the last at `now`), carrying the previous value forward; null before the first
 * observation.
 */
export function sparkline(
  obs: Obs[],
  opts: { days: number; now: number; withShipping: boolean; points?: number },
): { ts: number; value: number | null }[] {
  const n = Math.max(1, Math.min(opts.points ?? 30, Math.round(opts.days)));
  const lookup = cheapestLookup(obs, opts.withShipping, Infinity);
  const step = (opts.days * DAY_MS) / n;
  const start = opts.now - opts.days * DAY_MS;
  return Array.from({ length: n }, (_, i) => {
    const ts = i === n - 1 ? opts.now : Math.round(start + (i + 1) * step);
    return { ts, value: lookup.at(ts)?.value ?? null };
  });
}

/** Each price's % above the row's cheapest; null stays null. */
export function pctAboveBest(prices: (number | null)[]): (number | null)[] {
  const valid = prices.filter((p): p is number => p != null);
  if (valid.length === 0) return prices.map(() => null);
  const best = Math.min(...valid);
  return prices.map((p) => (p == null ? null : best > 0 ? ((p - best) / best) * 100 : 0));
}

export type SummaryText = {
  lowest: (price: string, merchant: string) => string;
  down: (pct: number, days: number) => string;
  up: (pct: number, days: number) => string;
  flat: (days: number) => string;
  none: () => string;
};

const EN: SummaryText = {
  lowest: (price, merchant) => `Lowest ${price} at ${merchant}`,
  down: (pct, days) => `down ${pct}% in ${days} days`,
  up: (pct, days) => `up ${pct}% in ${days} days`,
  flat: (days) => `unchanged in ${days} days`,
  none: () => "No price data yet",
};

/** An aria-label sentence such as "Lowest €399.90 at PCDiga, down 6% in 30 days". */
export function summarize(
  args: {
    lowest: { price: number; merchantName: string } | null;
    /** Change over `days` in %, or null when unknown. */
    changePct: number | null;
    days: number;
    formatPrice: (n: number) => string;
  },
  text: SummaryText = EN,
): string {
  if (!args.lowest) return text.none();
  const head = text.lowest(args.formatPrice(args.lowest.price), args.lowest.merchantName);
  if (args.changePct == null) return head;
  const pct = Math.round(Math.abs(args.changePct));
  const tail =
    pct === 0
      ? text.flat(args.days)
      : args.changePct < 0
        ? text.down(pct, args.days)
        : text.up(pct, args.days);
  return `${head}, ${tail}`;
}
