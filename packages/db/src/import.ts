import { and, eq } from "drizzle-orm";
import { ensureLegacyPlaceholder, LEGACY_ADMIN_USER_ID } from "./admin";
import type { Db } from "./client";
import { mapLegacy, type LegacyFile, type LegacyPlan, type MerchantRow } from "./legacy";
import {
  appSettings,
  blocklist,
  buildItems,
  builds,
  merchants,
  pricePoints,
  productIdentifiers,
  productMerchant,
  products,
  userMerchants,
} from "./schema";
import { LEGACY_MERCHANTS, STOREFRONT_APIS } from "./seed-data";

export { LEGACY_ADMIN_USER_ID } from "./admin";
export const LEGACY_BUILD_NAME = "Legacy build";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export type ImportSummary = {
  merchants: { inserted: number; updated: number };
  products: { inserted: number; skipped: number };
  identifiers: number;
  productMerchantPairs: number;
  manualUrls: number;
  autoUrls: number;
  blocklist: number;
  pricePoints: number;
  buildItems: number;
  bought: number;
  warnings: string[];
};

/** Inserts or updates merchants by name; returns name → id. */
async function upsertMerchants(tx: Tx, rows: MerchantRow[]) {
  const ids = new Map<string, string>();
  let inserted = 0;
  let updated = 0;
  for (const row of rows) {
    const [existing] = await tx
      .select({ id: merchants.id })
      .from(merchants)
      .where(eq(merchants.name, row.name));
    if (existing) {
      await tx.update(merchants).set(row).where(eq(merchants.id, existing.id));
      ids.set(row.name, existing.id);
      updated++;
    } else {
      const [created] = await tx.insert(merchants).values(row).returning({ id: merchants.id });
      ids.set(row.name, created!.id);
      inserted++;
    }
  }
  return { ids, inserted, updated };
}

async function ensureSettings(tx: Tx) {
  await tx.insert(appSettings).values({ id: 1 }).onConflictDoNothing();
}

/** Seeds app settings and the 12 legacy merchants. Safe to re-run. */
export async function seed(db: Db) {
  const plan = mapLegacy({ merchants: LEGACY_MERCHANTS, components: [] });
  return db.transaction(async (tx) => {
    await ensureSettings(tx);
    const { inserted, updated } = await upsertMerchants(tx, plan.merchants);
    await applyStorefrontApis(tx);
    return { inserted, updated };
  });
}

/** Finds an already-imported product by GTIN, then by exact name. */
async function findExistingProduct(tx: Tx, name: string, gtin: string | undefined) {
  if (gtin) {
    const [hit] = await tx
      .select({ id: productIdentifiers.productId })
      .from(productIdentifiers)
      .where(and(eq(productIdentifiers.kind, "gtin"), eq(productIdentifiers.value, gtin)));
    if (hit) return hit.id;
  }
  const [byName] = await tx
    .select({ id: products.id })
    .from(products)
    .where(eq(products.name, name));
  return byName?.id;
}

/**
 * Writes a mapped legacy file. Merchants are upserted; products that already exist
 * (same GTIN or name) are skipped entirely, so re-running never duplicates history.
 */
export async function importPlan(
  db: Db,
  plan: LegacyPlan,
  ownerId = LEGACY_ADMIN_USER_ID,
): Promise<ImportSummary> {
  return db.transaction(async (tx) => {
    await ensureSettings(tx);
    // Until `pnpm seed:admin` runs, imported data belongs to a placeholder user.
    if (ownerId === LEGACY_ADMIN_USER_ID) await ensureLegacyPlaceholder(tx);
    const m = await upsertMerchants(tx, plan.merchants);
    const merchantId = (name: string) => m.ids.get(name)!;

    const summary: ImportSummary = {
      merchants: { inserted: m.inserted, updated: m.updated },
      products: { inserted: 0, skipped: 0 },
      identifiers: 0,
      productMerchantPairs: 0,
      manualUrls: 0,
      autoUrls: 0,
      blocklist: 0,
      pricePoints: 0,
      buildItems: 0,
      bought: 0,
      warnings: [...plan.warnings],
    };

    // The owner compares every merchant that is visible to users.
    await tx
      .insert(userMerchants)
      .values([...m.ids.values()].map((id) => ({ userId: ownerId, merchantId: id })))
      .onConflictDoNothing();

    let [build] = await tx
      .select({ id: builds.id })
      .from(builds)
      .where(and(eq(builds.userId, ownerId), eq(builds.name, LEGACY_BUILD_NAME)));
    build ??= (
      await tx
        .insert(builds)
        .values({
          userId: ownerId,
          name: LEGACY_BUILD_NAME,
          notes: "Imported from pc_tracker.json",
        })
        .returning({ id: builds.id })
    )[0]!;

    for (const p of plan.products) {
      const gtin = p.identifiers.find((i) => i.kind === "gtin")?.value;
      if (await findExistingProduct(tx, p.product.name, gtin)) {
        summary.products.skipped++;
        summary.warnings.push(`${p.product.name}: already in the catalog; skipped`);
        continue;
      }

      const [created] = await tx
        .insert(products)
        .values({ ...p.product, createdBy: ownerId })
        .returning({ id: products.id });
      const productId = created!.id;
      summary.products.inserted++;

      if (p.identifiers.length) {
        await tx.insert(productIdentifiers).values(
          p.identifiers.map((i) => ({
            productId,
            kind: i.kind,
            value: i.value,
            source: i.source,
            sourceMerchantId: i.merchant ? merchantId(i.merchant) : null,
            confirmed: i.confirmed,
          })),
        );
        summary.identifiers += p.identifiers.length;
      }

      if (p.pairs.length) {
        await tx.insert(productMerchant).values(
          p.pairs.map((pair) => ({
            productId,
            merchantId: merchantId(pair.merchant),
            manualUrl: pair.manualUrl,
            autoUrl: pair.autoUrl,
            lastStatus: pair.lastStatus,
            lastPriceEur: pair.lastPriceEur,
            lastCheckedAt: pair.lastCheckedAt,
          })),
        );
        summary.productMerchantPairs += p.pairs.length;
        summary.manualUrls += p.pairs.filter((x) => x.manualUrl).length;
        summary.autoUrls += p.pairs.filter((x) => x.autoUrl).length;
      }

      if (p.blocklist.length) {
        await tx.insert(blocklist).values(
          p.blocklist.map((b) => ({
            productId,
            merchantId: merchantId(b.merchant),
            url: b.url,
            name: b.name,
          })),
        );
        summary.blocklist += p.blocklist.length;
      }

      // SQLite caps bound parameters per statement; insert history in chunks.
      for (let i = 0; i < p.pricePoints.length; i += 200) {
        await tx.insert(pricePoints).values(
          p.pricePoints.slice(i, i + 200).map((pt) => ({
            productId,
            merchantId: merchantId(pt.merchant),
            ts: pt.ts,
            priceEur: pt.priceEur,
            priceOrig: pt.priceOrig,
            currency: pt.currency,
            shipping: pt.shipping,
            inStock: true,
            url: pt.url,
          })),
        );
      }
      summary.pricePoints += p.pricePoints.length;

      await tx.insert(buildItems).values({
        buildId: build.id,
        productId,
        sortOrder: p.buildItem.sortOrder,
        boughtAt: p.buildItem.boughtAt,
        boughtPrice: p.buildItem.boughtPrice,
        boughtMerchantId: p.buildItem.boughtMerchant
          ? merchantId(p.buildItem.boughtMerchant)
          : null,
      });
      summary.buildItems++;
      if (p.buildItem.boughtPrice != null) summary.bought++;
    }

    return summary;
  });
}

export async function importLegacy(db: Db, file: LegacyFile, ownerId?: string) {
  return importPlan(db, mapLegacy(file), ownerId);
}

/** Row counts per table, for summaries and tests. */
export async function countRows(db: Db) {
  const tables = {
    merchants,
    products,
    productIdentifiers,
    productMerchant,
    blocklist,
    pricePoints,
    builds,
    buildItems,
    userMerchants,
  };
  const out: Record<string, number> = {};
  for (const [name, table] of Object.entries(tables)) out[name] = await db.$count(table);
  return out;
}

/** Adds the known storefront API settings to merchants that don't have one yet. */
async function applyStorefrontApis(tx: Tx) {
  const rows = await tx
    .select({
      id: merchants.id,
      baseUrl: merchants.baseUrl,
      adapterConfig: merchants.adapterConfig,
    })
    .from(merchants);
  for (const row of rows) {
    let host = "";
    try {
      host = new URL(row.baseUrl).host;
    } catch {
      continue;
    }
    const api = STOREFRONT_APIS[host];
    const config = row.adapterConfig ?? {};
    if (!api || config.saleor) continue;
    await tx
      .update(merchants)
      .set({ adapterConfig: { ...config, ...api } })
      .where(eq(merchants.id, row.id));
  }
}
