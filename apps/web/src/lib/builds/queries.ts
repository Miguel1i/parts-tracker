import "server-only";
import {
  buildItems,
  builds,
  merchants,
  productMerchant,
  products,
  userMerchants,
  userPreferences,
  type Db,
} from "@parts/db";
import { and, asc, desc, eq, inArray, isNotNull, isNull, or, sql } from "@parts/db/orm";
import { safeHttpUrl } from "@/lib/charts/product-view";

type Conn = Pick<Db, "select">;

/** The cheapest usable offer of a product for one user. */
export type Offer = {
  merchantId: string;
  merchantName: string;
  /** Shelf price in EUR. */
  price: number;
  /** Shipping added to `price` (0 when the user prefers prices without it, or it's free). */
  shipping: number;
  /** What the user compares and sums: price + shipping. */
  unitTotal: number;
  checkedAt: number | null;
  url: string | null;
};

export type OfferRow = {
  productId: string;
  merchantId: string;
  merchantName: string;
  price: number;
  shipping: number;
  freeShippingOver: number | null;
  checkedAt: Date | null;
  url: string | null;
};

/** Pure: the shipping a merchant adds to `price`. */
export function shippingFor(price: number, shipping: number, freeOver: number | null): number {
  return freeOver != null && freeOver <= price ? 0 : shipping;
}

/** Pure: the cheapest offer per product (ties go to the first row). */
export function pickBestOffers(rows: OfferRow[], withShipping: boolean): Map<string, Offer> {
  const best = new Map<string, Offer>();
  for (const r of rows) {
    const shipping = withShipping ? shippingFor(r.price, r.shipping, r.freeShippingOver) : 0;
    const unitTotal = r.price + shipping;
    const current = best.get(r.productId);
    if (current && current.unitTotal <= unitTotal) continue;
    best.set(r.productId, {
      merchantId: r.merchantId,
      merchantName: r.merchantName,
      price: r.price,
      shipping,
      unitTotal,
      checkedAt: r.checkedAt ? r.checkedAt.getTime() : null,
      url: r.url && /^https?:\/\//i.test(r.url) ? r.url : null,
    });
  }
  return best;
}

/** The user's price display preference (default: with shipping). */
export async function priceWithShipping(db: Conn, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ v: userPreferences.priceWithShipping })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId));
  return row?.v ?? true;
}

/** Merchants this user compares: enabled, visible, and not switched off by the user. */
export async function userMerchantIds(db: Conn, userId: string): Promise<string[]> {
  const rows = await db
    .select({ id: merchants.id })
    .from(merchants)
    .leftJoin(
      userMerchants,
      and(eq(userMerchants.merchantId, merchants.id), eq(userMerchants.userId, userId)),
    )
    .where(
      and(
        eq(merchants.enabled, true),
        eq(merchants.visibleToUsers, true),
        or(isNull(userMerchants.enabled), eq(userMerchants.enabled, true)),
      ),
    );
  return rows.map((r) => r.id);
}

const CHUNK = 500;

/**
 * Current best offer per product: the cheapest `ok` price among the merchants the user
 * compares (see `userMerchantIds`), plus shipping when the user's preference says so.
 */
export async function bestOffers(
  db: Conn,
  userId: string,
  productIds: string[],
): Promise<Map<string, Offer>> {
  const ids = [...new Set(productIds)];
  if (ids.length === 0) return new Map();
  const withShipping = await priceWithShipping(db, userId);
  const rows: OfferRow[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = await db
      .select({
        productId: productMerchant.productId,
        merchantId: merchants.id,
        merchantName: merchants.name,
        price: productMerchant.lastPriceEur,
        shipping: merchants.shipping,
        freeShippingOver: merchants.freeShippingOver,
        checkedAt: productMerchant.lastCheckedAt,
        url: sql<string | null>`coalesce(${productMerchant.manualUrl}, ${productMerchant.autoUrl})`,
      })
      .from(productMerchant)
      .innerJoin(merchants, eq(merchants.id, productMerchant.merchantId))
      .leftJoin(
        userMerchants,
        and(eq(userMerchants.merchantId, merchants.id), eq(userMerchants.userId, userId)),
      )
      .where(
        and(
          inArray(productMerchant.productId, ids.slice(i, i + CHUNK)),
          eq(productMerchant.enabled, true),
          eq(productMerchant.lastStatus, "ok"),
          isNotNull(productMerchant.lastPriceEur),
          eq(merchants.enabled, true),
          eq(merchants.visibleToUsers, true),
          or(isNull(userMerchants.enabled), eq(userMerchants.enabled, true)),
        ),
      )
      .orderBy(asc(merchants.sortOrder), asc(merchants.name));
    for (const r of part) rows.push({ ...r, price: r.price! });
  }
  return pickBestOffers(rows, withShipping);
}

export type BuildSummary = {
  id: string;
  name: string;
  isPublic: boolean;
  itemCount: number;
  total: number;
  missingPrice: number;
  updatedAt: number | null;
};

/** The user's builds, newest activity first, each with its current total. */
export async function listBuilds(db: Conn, userId: string): Promise<BuildSummary[]> {
  const mine = await db
    .select()
    .from(builds)
    .where(eq(builds.userId, userId))
    .orderBy(desc(builds.updatedAt), asc(builds.name));
  if (mine.length === 0) return [];
  const items = await db
    .select({
      buildId: buildItems.buildId,
      productId: buildItems.productId,
      quantity: buildItems.quantity,
    })
    .from(buildItems)
    .where(
      inArray(
        buildItems.buildId,
        mine.map((b) => b.id),
      ),
    );
  const offers = await bestOffers(
    db,
    userId,
    items.map((i) => i.productId),
  );
  return mine.map((b) => {
    const own = items.filter((i) => i.buildId === b.id);
    let total = 0;
    let missing = 0;
    for (const i of own) {
      const offer = offers.get(i.productId);
      if (offer) total += offer.unitTotal * i.quantity;
      else missing++;
    }
    return {
      id: b.id,
      name: b.name,
      isPublic: b.isPublic,
      itemCount: own.length,
      total,
      missingPrice: missing,
      updatedAt: b.updatedAt ? b.updatedAt.getTime() : null,
    };
  });
}

export type BuildItemView = {
  productId: string;
  name: string;
  image: string | null;
  quantity: number;
  bought: { at: number; price: number | null; merchantId: string | null } | null;
  offer: Offer | null;
};

export type BuildView = {
  id: string;
  name: string;
  isPublic: boolean;
  shareToken: string | null;
  items: BuildItemView[];
  total: number;
  missingPrice: number;
  withShipping: boolean;
};

/** One build with its items and current prices, or null when `userId` doesn't own it. */
export async function getBuildView(
  db: Conn,
  buildId: string,
  userId: string,
): Promise<BuildView | null> {
  const [build] = await db
    .select()
    .from(builds)
    .where(and(eq(builds.id, buildId), eq(builds.userId, userId)));
  if (!build) return null;
  const rows = await db
    .select({
      productId: buildItems.productId,
      name: products.name,
      imageUrl: products.imageUrl,
      quantity: buildItems.quantity,
      boughtAt: buildItems.boughtAt,
      boughtPrice: buildItems.boughtPrice,
      boughtMerchantId: buildItems.boughtMerchantId,
    })
    .from(buildItems)
    .innerJoin(products, eq(products.id, buildItems.productId))
    .where(eq(buildItems.buildId, buildId))
    .orderBy(asc(buildItems.sortOrder), asc(products.name));
  const offers = await bestOffers(
    db,
    userId,
    rows.map((r) => r.productId),
  );
  let total = 0;
  let missing = 0;
  const items = rows.map((r): BuildItemView => {
    const offer = offers.get(r.productId) ?? null;
    if (offer) total += offer.unitTotal * r.quantity;
    else missing++;
    return {
      productId: r.productId,
      name: r.name,
      image: safeHttpUrl(r.imageUrl),
      quantity: r.quantity,
      bought: r.boughtAt
        ? { at: r.boughtAt.getTime(), price: r.boughtPrice, merchantId: r.boughtMerchantId }
        : null,
      offer,
    };
  });
  return {
    id: build.id,
    name: build.name,
    isPublic: build.isPublic,
    shareToken: build.shareToken,
    items,
    total,
    missingPrice: missing,
    withShipping: await priceWithShipping(db, userId),
  };
}

/** Shops the user can name as where a part was bought. */
export async function merchantOptions(db: Conn) {
  return (
    db
      .select({ id: merchants.id, name: merchants.name })
      .from(merchants)
      // A disabled shop is never shown, whatever its visibility flag says.
      .where(and(eq(merchants.enabled, true), eq(merchants.visibleToUsers, true)))
      .orderBy(asc(merchants.sortOrder), asc(merchants.name))
  );
}

export type CatalogHit = { id: string; name: string; category: string | null };

/** Up to 20 non-archived products whose name contains every word of `q`. */
export async function searchCatalog(db: Conn, q: string): Promise<CatalogHit[]> {
  const words = q.trim().slice(0, 100).split(/\s+/).filter(Boolean).slice(0, 6);
  if (words.length === 0) return [];
  const likes = words.map((w) => {
    const escaped = w.replace(/[\\%_]/g, (c) => `\\${c}`);
    return sql`${products.name} LIKE ${`%${escaped}%`} ESCAPE '\\'`;
  });
  return db
    .select({ id: products.id, name: products.name, category: products.category })
    .from(products)
    .where(and(eq(products.archived, false), ...likes))
    .orderBy(asc(products.name))
    .limit(20);
}
