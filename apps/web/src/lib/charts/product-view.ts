/**
 * Pure helpers for the product page charts: URL state, merging per-merchant step series into
 * chart rows, the point active at a time, and the CSV export. No I/O.
 */
import type { SeriesPoint } from "./transforms";

export const VIEW_RANGES = ["7d", "30d", "90d", "1y", "all"] as const;
export type ViewRange = (typeof VIEW_RANGES)[number];
export const DEFAULT_RANGE: ViewRange = "30d";

export type ViewState = {
  range: ViewRange;
  hidden: string[];
  /** null = follow the user's preference. */
  shipping: boolean | null;
};

type Query = Record<string, string | string[] | undefined> | URLSearchParams;

function pick(q: Query, key: string): string | undefined {
  if (q instanceof URLSearchParams) return q.get(key) ?? undefined;
  const v = q[key];
  return Array.isArray(v) ? v[0] : v;
}

export function parseViewState(q: Query): ViewState {
  const r = pick(q, "range");
  const range = (VIEW_RANGES as readonly string[]).includes(r ?? "")
    ? (r as ViewRange)
    : DEFAULT_RANGE;
  const hide = pick(q, "hide");
  const hidden = hide
    ? [...new Set(hide.split(",").filter((s) => /^[\w-]{1,64}$/.test(s)))].slice(0, 50)
    : [];
  const ship = pick(q, "ship");
  return { range, hidden, shipping: ship === "1" ? true : ship === "0" ? false : null };
}

/** Query string (no leading "?") that reproduces `state`; defaults are omitted. */
export function serializeViewState(state: ViewState): string {
  const p = new URLSearchParams();
  if (state.range !== DEFAULT_RANGE) p.set("range", state.range);
  if (state.hidden.length) p.set("hide", [...state.hidden].sort().join(","));
  if (state.shipping != null) p.set("ship", state.shipping ? "1" : "0");
  return p.toString();
}

export const OOS_SUFFIX = "~oos";

export type ChartRow = { ts: number } & Record<string, number | null>;

/**
 * One row per timestamp (union over all series), step semantics: each merchant's value carries
 * forward until its next point, a null (gap) point carries a null. In-stock and out-of-stock
 * stretches go in separate keys (`id` and `id~oos`) so they can be drawn solid and dashed; at
 * a change the finished stretch is extended to the change so the line has no hole.
 * `band` (the cheapest in-stock price) goes in key "band".
 */
export function mergeSeries(
  series: Record<string, SeriesPoint[]>,
  band: { ts: number; min: number | null }[] = [],
): ChartRow[] {
  const times = new Set<number>();
  for (const pts of Object.values(series)) for (const p of pts) times.add(p.ts);
  for (const b of band) times.add(b.ts);
  const rows: ChartRow[] = [...times].sort((a, b) => a - b).map((t) => ({ ts: t }));

  for (const [id, pts] of Object.entries(series)) {
    let j = -1;
    let prev: SeriesPoint | null = null;
    for (const row of rows) {
      while (j + 1 < pts.length && pts[j + 1]!.ts <= row.ts) j++;
      const cur = j >= 0 ? pts[j]! : null;
      let main: number | null = null;
      let oos: number | null = null;
      const put = (p: SeriesPoint) => {
        if (p.inStock) main = p.value;
        else oos = p.value;
      };
      if (cur && cur.value != null) {
        put(cur);
        if (prev && prev.value != null && prev.inStock !== cur.inStock) put(prev);
      } else if (cur && prev && prev.value != null && cur.ts === row.ts) {
        // The gap marker: the line holds up to here, then breaks.
        put(prev);
      }
      row[id] = main;
      row[id + OOS_SUFFIX] = oos;
      prev = cur;
    }
  }

  if (band.length) {
    let j = -1;
    for (const row of rows) {
      while (j + 1 < band.length && band[j + 1]!.ts <= row.ts) j++;
      row.band = j >= 0 ? band[j]!.min : null;
    }
  }
  return rows;
}

/** The point in force at `t` (last with ts <= t), or null before the first one. */
export function pointAt(points: SeriesPoint[], t: number): SeriesPoint | null {
  let lo = 0;
  let hi = points.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid]!.ts <= t) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans < 0 ? null : points[ans]!;
}

function csvCell(v: string | number | boolean | null | undefined): string {
  if (v == null) return "";
  let s = String(v);
  // Shop-written text must not become a spreadsheet formula.
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export type CsvMerchant = { id: string; name: string };

/** CSV of the observations of `series` between `from` and `to` (inclusive), oldest first. */
export function buildCsv(
  series: Record<string, SeriesPoint[]>,
  merchants: CsvMerchant[],
  opts: { from?: number; to?: number } = {},
): string {
  const header = ["time", "merchant", "price_eur", "shipping_eur", "in_stock", "title", "url"];
  const lines: string[] = [header.join(",")];
  const rows: { ts: number; name: string; p: SeriesPoint }[] = [];
  for (const m of merchants) {
    for (const p of series[m.id] ?? []) {
      if (!p.obs) continue;
      if (opts.from != null && p.ts < opts.from) continue;
      if (opts.to != null && p.ts > opts.to) continue;
      rows.push({ ts: p.ts, name: m.name, p });
    }
  }
  rows.sort((a, b) => a.ts - b.ts || a.name.localeCompare(b.name));
  for (const { ts, name, p } of rows) {
    const o = p.obs!;
    lines.push(
      [new Date(ts).toISOString(), name, o.price, o.shipping, o.inStock, o.title, o.url]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\n") + "\n";
}

/** Only http(s) links are rendered as links. */
export function safeHttpUrl(url: string | null | undefined): string | null {
  return url && /^https?:\/\//i.test(url) ? url : null;
}
