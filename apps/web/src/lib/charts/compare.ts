/**
 * Pure helpers for the comparison grid and price-gap heatmap: per-row best price, % above
 * best, heat bins and the `?hide=` URL state. No I/O, so it is unit-tested directly.
 */
import { pctAboveBest } from "./transforms";

export type CompareStatus = "ok" | "out_of_stock" | "not_found" | "blocked" | "error";

/** One product x merchant pair as loaded from `product_merchant`. */
export type RawCell = {
  productId: string;
  merchantId: string;
  status: CompareStatus | null;
  /** Shelf price in EUR (kept for out-of-stock offers too, they just never count as best). */
  price: number | null;
  /** What the user compares: price plus shipping when their preference says so. */
  total: number | null;
  url: string | null;
  checkedAt: number | null;
};

export type CompareCellData = RawCell & {
  /** Priced and in stock: the only cells that can be the best or get a heat colour. */
  inStock: boolean;
  /** % above the row's cheapest in-stock total, or null when not in stock. */
  pct: number | null;
  isBest: boolean;
};

export type CompareRow = {
  productId: string;
  name: string;
  cells: Record<string, CompareCellData | undefined>;
  bestTotal: number | null;
  /** All merchants tied at the best total. */
  bestMerchantIds: string[];
};

/** Rows for the given (visible) merchants. Best is computed among those merchants only. */
export function buildCompareRows(
  products: { id: string; name: string }[],
  merchantIds: string[],
  cells: RawCell[],
): CompareRow[] {
  const byPair = new Map(cells.map((c) => [`${c.productId}|${c.merchantId}`, c]));
  return products.map((p) => {
    const raw = merchantIds.map((m) => byPair.get(`${p.id}|${m}`));
    const totals = raw.map((c) =>
      c && c.status === "ok" && c.total != null && c.price != null ? c.total : null,
    );
    const pcts = pctAboveBest(totals);
    const valid = totals.filter((t): t is number => t != null);
    const bestTotal = valid.length > 0 ? Math.min(...valid) : null;
    const out: Record<string, CompareCellData | undefined> = {};
    const bestMerchantIds: string[] = [];
    merchantIds.forEach((m, i) => {
      const c = raw[i];
      if (!c) return;
      const inStock = totals[i] != null;
      const isBest = inStock && totals[i] === bestTotal;
      if (isBest) bestMerchantIds.push(m);
      out[m] = { ...c, inStock, pct: pcts[i] ?? null, isBest };
    });
    return { productId: p.id, name: p.name, cells: out, bestTotal, bestMerchantIds };
  });
}

/** Upper bounds (exclusive) of heat bins 1..6; bin 7 is everything above. */
export const HEAT_LIMITS = [0.5, 5, 10, 20, 35, 60] as const;

/** Palette step 1..7 (`--chart-seq-N`) for a % above the row's best. 1 = best. */
export function heatBin(pct: number): number {
  const i = HEAT_LIMITS.findIndex((limit) => pct < limit);
  return i < 0 ? HEAT_LIMITS.length + 1 : i + 1;
}

/** Cards on mobile: merchants with a usable price first (cheapest first), then the rest. */
export function cardOrder(row: CompareRow, merchantIds: string[]): string[] {
  const rank = (id: string) => {
    const c = row.cells[id];
    return c?.inStock ? 0 : c ? 1 : 2;
  };
  return [...merchantIds].sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    return (row.cells[a]?.total ?? Infinity) - (row.cells[b]?.total ?? Infinity);
  });
}

/** http(s) URLs only; anything else (javascript:, data:, junk) is dropped. */
export function safeShopUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** `?hide=a,b` -> ids that exist (unknown ids are ignored, so stale links stay harmless). */
export function parseHide(raw: string | string[] | undefined, valid: string[]): string[] {
  const text = Array.isArray(raw) ? raw.join(",") : (raw ?? "");
  const known = new Set(valid);
  return [...new Set(text.split(",").map((s) => s.trim()))].filter((s) => known.has(s));
}

export function serializeHide(ids: string[]): string | undefined {
  return ids.length > 0 ? ids.join(",") : undefined;
}
