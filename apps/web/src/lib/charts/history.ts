import "server-only";
import { merchants, pricePoints, products, type Db } from "@parts/db";
import { and, asc, eq, gte, inArray } from "@parts/db/orm";
import { shippingFor, userMerchantIds } from "@/lib/builds/queries";
import { merchantStyles } from "./palette";
import { DAY_MS, type Obs } from "./transforms";

type Conn = Pick<Db, "select">;

export type HistoryRange = "7d" | "30d" | "90d" | "1y" | "all";
export const HISTORY_RANGES: readonly HistoryRange[] = ["7d", "30d", "90d", "1y", "all"];

/** Start of a range as ms, or null for "all". */
export function rangeStart(range: HistoryRange, now: number): number | null {
  switch (range) {
    case "7d":
      return now - 7 * DAY_MS;
    case "30d":
      return now - 30 * DAY_MS;
    case "90d":
      return now - 90 * DAY_MS;
    case "1y":
      return now - 365 * DAY_MS;
    default:
      return null;
  }
}

export type HistoryMerchant = {
  id: string;
  name: string;
  /** CSS colour, stable per merchant. */
  color: string;
  dash?: string;
  shipping: number;
  freeShippingOver: number | null;
};

export type ProductHistory = {
  product: { id: string; name: string; refPrice: number | null };
  merchants: HistoryMerchant[];
  obs: Obs[];
};

/**
 * Price history of one product. With `userId`, only the merchants that user compares; without,
 * every enabled, visible merchant. Shipping per observation is the stored value when the
 * scraper saw one, else the merchant's rule; `withShipping: false` zeroes it. Returns null for
 * an unknown or archived product.
 */
export async function loadProductHistory(
  db: Conn,
  opts: { productId: string; userId: string | null; from: number | null; withShipping?: boolean },
): Promise<ProductHistory | null> {
  const [product] = await db
    .select({
      id: products.id,
      name: products.name,
      refPrice: products.refPrice,
      archived: products.archived,
    })
    .from(products)
    .where(eq(products.id, opts.productId));
  if (!product || product.archived) return null;
  const head = { id: product.id, name: product.name, refPrice: product.refPrice };

  const all = await db
    .select({
      id: merchants.id,
      name: merchants.name,
      sortOrder: merchants.sortOrder,
      shipping: merchants.shipping,
      freeShippingOver: merchants.freeShippingOver,
      enabled: merchants.enabled,
      visibleToUsers: merchants.visibleToUsers,
    })
    .from(merchants);
  const styles = merchantStyles(all);
  const allowed = opts.userId
    ? new Set(await userMerchantIds(db, opts.userId))
    : new Set(all.filter((m) => m.enabled && m.visibleToUsers).map((m) => m.id));
  const shown = all
    .filter((m) => allowed.has(m.id))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const byId = new Map(shown.map((m) => [m.id, m]));

  const outMerchants: HistoryMerchant[] = shown.map((m) => {
    const s = styles.get(m.id)!;
    return {
      id: m.id,
      name: m.name,
      color: s.color,
      ...(s.dash ? { dash: s.dash } : {}),
      shipping: m.shipping,
      freeShippingOver: m.freeShippingOver,
    };
  });
  if (shown.length === 0) return { product: head, merchants: outMerchants, obs: [] };

  const rows = await db
    .select()
    .from(pricePoints)
    .where(
      and(
        eq(pricePoints.productId, opts.productId),
        inArray(
          pricePoints.merchantId,
          shown.map((m) => m.id),
        ),
        opts.from == null ? undefined : gte(pricePoints.ts, new Date(opts.from)),
      ),
    )
    .orderBy(asc(pricePoints.ts));

  const obs = rows.map((r): Obs => {
    const m = byId.get(r.merchantId)!;
    const shipping =
      opts.withShipping === false
        ? 0
        : (r.shipping ?? shippingFor(r.priceEur, m.shipping, m.freeShippingOver));
    return {
      merchantId: r.merchantId,
      ts: r.ts.getTime(),
      price: r.priceEur,
      shipping,
      inStock: r.inStock,
      url: r.url,
      title: r.title,
      runId: r.runId,
    };
  });
  return { product: head, merchants: outMerchants, obs };
}
