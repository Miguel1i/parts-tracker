import "server-only";
import {
  buildItems,
  builds,
  merchants,
  productMerchant,
  products,
  scrapeLogs,
  type Db,
  type ScrapeStatus,
} from "@parts/db";
import { and, asc, desc, eq, inArray, isNotNull, sql } from "@parts/db/orm";
import { shippingFor, userMerchantIds } from "@/lib/builds/queries";
import { merchantStyles } from "./palette";
import { safeHttpUrl } from "./product-view";

type Conn = Pick<Db, "select">;

export type ProductHead = {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  refPrice: number | null;
  refUrl: string | null;
  image: string | null;
};

export async function loadProductHead(db: Conn, id: string): Promise<ProductHead | null> {
  const [p] = await db
    .select({
      id: products.id,
      name: products.name,
      brand: products.brand,
      category: products.category,
      refPrice: products.refPrice,
      refUrl: products.refUrl,
      imageUrl: products.imageUrl,
      archived: products.archived,
    })
    .from(products)
    .where(eq(products.id, id));
  if (!p || p.archived) return null;
  return {
    id: p.id,
    name: p.name,
    brand: p.brand,
    category: p.category,
    refPrice: p.refPrice,
    refUrl: safeHttpUrl(p.refUrl),
    image: safeHttpUrl(p.imageUrl),
  };
}

export type OfferRowView = {
  merchantId: string;
  merchantName: string;
  color: string;
  dash?: string;
  price: number;
  shipping: number;
  inStock: boolean;
  checkedAt: number | null;
  url: string | null;
};

/** The latest known offer of each merchant the user compares (those with a price). */
export async function loadProductOffers(
  db: Conn,
  productId: string,
  userId: string,
): Promise<OfferRowView[]> {
  const all = await db
    .select({
      id: merchants.id,
      name: merchants.name,
      sortOrder: merchants.sortOrder,
      shipping: merchants.shipping,
      freeShippingOver: merchants.freeShippingOver,
    })
    .from(merchants);
  const styles = merchantStyles(all);
  const allowed = new Set(await userMerchantIds(db, userId));
  const rows = await db
    .select({
      merchantId: productMerchant.merchantId,
      price: productMerchant.lastPriceEur,
      status: productMerchant.lastStatus,
      checkedAt: productMerchant.lastCheckedAt,
      manualUrl: productMerchant.manualUrl,
      autoUrl: productMerchant.autoUrl,
    })
    .from(productMerchant)
    .where(
      and(
        eq(productMerchant.productId, productId),
        eq(productMerchant.enabled, true),
        isNotNull(productMerchant.lastPriceEur),
        inArray(productMerchant.lastStatus, ["ok", "out_of_stock"]),
      ),
    );
  const byId = new Map(all.map((m) => [m.id, m]));
  const out: OfferRowView[] = [];
  for (const r of rows) {
    const m = byId.get(r.merchantId);
    if (!m || !allowed.has(m.id) || r.price == null) continue;
    const s = styles.get(m.id)!;
    out.push({
      merchantId: m.id,
      merchantName: m.name,
      color: s.color,
      ...(s.dash ? { dash: s.dash } : {}),
      price: r.price,
      shipping: shippingFor(r.price, m.shipping, m.freeShippingOver),
      inStock: r.status === "ok",
      checkedAt: r.checkedAt ? r.checkedAt.getTime() : null,
      url: safeHttpUrl(r.manualUrl ?? r.autoUrl),
    });
  }
  return out.sort(
    (a, b) =>
      a.price + a.shipping - (b.price + b.shipping) || a.merchantName.localeCompare(b.merchantName),
  );
}

export type DiagnosticView = {
  merchantId: string;
  merchantName: string;
  runId: string;
  status: ScrapeStatus;
  message: string | null;
  log: string | null;
  at: number;
};

/** The latest scrape log of each merchant for this product. */
export async function loadProductDiagnostics(
  db: Conn,
  productId: string,
  userId: string,
): Promise<DiagnosticView[]> {
  const allowed = await userMerchantIds(db, userId);
  if (allowed.length === 0) return [];
  // The newest log id per merchant (index scrape_logs_pair_idx), then only those rows: one log
  // per merchant, however many runs there were, without reading every trace.
  const latest = await db
    .select({ id: sql<number>`max(${scrapeLogs.id})` })
    .from(scrapeLogs)
    .where(and(eq(scrapeLogs.productId, productId), inArray(scrapeLogs.merchantId, allowed)))
    .groupBy(scrapeLogs.merchantId);
  const ids = latest.map((r) => r.id).filter((x): x is number => x != null);
  if (ids.length === 0) return [];
  const rows = await db
    .select({
      merchantId: scrapeLogs.merchantId,
      merchantName: merchants.name,
      sortOrder: merchants.sortOrder,
      runId: scrapeLogs.runId,
      status: scrapeLogs.status,
      message: scrapeLogs.message,
      log: scrapeLogs.log,
      at: scrapeLogs.createdAt,
    })
    .from(scrapeLogs)
    .innerJoin(merchants, eq(merchants.id, scrapeLogs.merchantId))
    .where(inArray(scrapeLogs.id, ids));
  const seen = new Map<string, DiagnosticView & { sortOrder: number }>();
  for (const r of rows) {
    if (!r.merchantId || seen.has(r.merchantId)) continue;
    seen.set(r.merchantId, {
      merchantId: r.merchantId,
      merchantName: r.merchantName,
      sortOrder: r.sortOrder,
      runId: r.runId,
      status: r.status,
      message: r.message,
      log: r.log,
      at: r.at.getTime(),
    });
  }
  return [...seen.values()]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.merchantName.localeCompare(b.merchantName))
    .map((d) => ({
      merchantId: d.merchantId,
      merchantName: d.merchantName,
      runId: d.runId,
      status: d.status,
      message: d.message,
      log: d.log,
      at: d.at,
    }));
}

export type BoughtView = { at: number; price: number | null; merchantName: string | null };

/** When this user bought the part (their most recent purchase across their builds). */
export async function loadBought(
  db: Conn,
  productId: string,
  userId: string,
): Promise<BoughtView | null> {
  const rows = await db
    .select({
      at: buildItems.boughtAt,
      price: buildItems.boughtPrice,
      merchantName: merchants.name,
    })
    .from(buildItems)
    .innerJoin(builds, eq(builds.id, buildItems.buildId))
    .leftJoin(merchants, eq(merchants.id, buildItems.boughtMerchantId))
    .where(
      and(
        eq(buildItems.productId, productId),
        eq(builds.userId, userId),
        isNotNull(buildItems.boughtAt),
      ),
    )
    .orderBy(desc(buildItems.boughtAt), asc(builds.id))
    .limit(1);
  const r = rows[0];
  return r?.at ? { at: r.at.getTime(), price: r.price, merchantName: r.merchantName } : null;
}
