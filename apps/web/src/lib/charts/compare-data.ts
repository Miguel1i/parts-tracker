import "server-only";
import { buildItems, merchants, productMerchant, products, type Db } from "@parts/db";
import { asc, eq, inArray, sql } from "@parts/db/orm";
import { priceWithShipping, shippingFor, userMerchantIds } from "@/lib/builds/queries";
import type { RawCell } from "./compare";
import { merchantStyles } from "./palette";

type Conn = Pick<Db, "select">;

export type CompareMerchant = { id: string; name: string; color: string; dash?: string };

export type CompareData = {
  products: { id: string; name: string; image: string | null }[];
  merchants: CompareMerchant[];
  cells: RawCell[];
  withShipping: boolean;
};

const CHUNK = 500;

/** A build's products against the merchants this user compares. Ownership is checked by the caller. */
export async function loadCompare(db: Conn, userId: string, buildId: string): Promise<CompareData> {
  const items = await db
    .select({ id: products.id, name: products.name, image: products.imageUrl })
    .from(buildItems)
    .innerJoin(products, eq(products.id, buildItems.productId))
    .where(eq(buildItems.buildId, buildId))
    .orderBy(asc(buildItems.sortOrder), asc(products.name));

  const all = await db
    .select({
      id: merchants.id,
      name: merchants.name,
      sortOrder: merchants.sortOrder,
      shipping: merchants.shipping,
      freeShippingOver: merchants.freeShippingOver,
    })
    .from(merchants)
    .orderBy(asc(merchants.sortOrder), asc(merchants.name));
  const mine = new Set(await userMerchantIds(db, userId));
  const styles = merchantStyles(all);
  const shown = all.filter((m) => mine.has(m.id));
  const byId = new Map(shown.map((m) => [m.id, m]));
  const withShipping = await priceWithShipping(db, userId);

  const cells: RawCell[] = [];
  const ids = items.map((i) => i.id);
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = await db
      .select({
        productId: productMerchant.productId,
        merchantId: productMerchant.merchantId,
        enabled: productMerchant.enabled,
        status: productMerchant.lastStatus,
        price: productMerchant.lastPriceEur,
        checkedAt: productMerchant.lastCheckedAt,
        url: sql<string | null>`coalesce(${productMerchant.manualUrl}, ${productMerchant.autoUrl})`,
      })
      .from(productMerchant)
      .where(inArray(productMerchant.productId, ids.slice(i, i + CHUNK)));
    for (const r of part) {
      const m = byId.get(r.merchantId);
      if (!m || !r.enabled) continue;
      const shipping =
        withShipping && r.price != null ? shippingFor(r.price, m.shipping, m.freeShippingOver) : 0;
      cells.push({
        productId: r.productId,
        merchantId: r.merchantId,
        status: r.status,
        price: r.price,
        total: r.price != null ? r.price + shipping : null,
        url: r.url && /^https?:\/\//i.test(r.url) ? r.url : null,
        checkedAt: r.checkedAt ? r.checkedAt.getTime() : null,
      });
    }
  }

  return {
    products: items,
    merchants: shown.map((m) => {
      const s = styles.get(m.id)!;
      return { id: m.id, name: m.name, color: s.color, ...(s.dash ? { dash: s.dash } : {}) };
    }),
    cells,
    withShipping,
  };
}
