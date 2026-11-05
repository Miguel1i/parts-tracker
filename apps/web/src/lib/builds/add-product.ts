import "server-only";
import {
  asinFromUrl,
  canonicalUrl,
  catalogKey,
  hostOf,
  normalizeGtin,
  parsePcpp,
  pcppQuery,
  toCategory,
} from "@parts/core";
import {
  buildItems,
  builds,
  merchants,
  productIdentifiers,
  productMerchant,
  products,
  type Db,
} from "@parts/db";
import { and, eq, isNull, sql } from "@parts/db/orm";
import { ActionError } from "@/lib/auth/guard";

type Conn = Pick<Db, "select" | "insert" | "update" | "delete">;

/**
 * Adds a product to a build, or bumps the quantity when it's already there. The caller has
 * already checked that the user owns the build (`ownedBuild`).
 */
export async function addToBuild(tx: Conn, buildId: string, productId: string, quantity = 1) {
  const [existing] = await tx
    .select({ productId: buildItems.productId })
    .from(buildItems)
    .where(and(eq(buildItems.buildId, buildId), eq(buildItems.productId, productId)));
  if (existing) {
    await tx
      .update(buildItems)
      .set({ quantity: sql`min(${buildItems.quantity} + ${quantity}, 99)` })
      .where(and(eq(buildItems.buildId, buildId), eq(buildItems.productId, productId)));
  } else {
    const [last] = await tx
      .select({ max: sql<number | null>`max(${buildItems.sortOrder})` })
      .from(buildItems)
      .where(eq(buildItems.buildId, buildId));
    await tx
      .insert(buildItems)
      .values({ buildId, productId, quantity, sortOrder: (last?.max ?? -1) + 1 });
  }
  await tx.update(builds).set({ updatedAt: new Date() }).where(eq(builds.id, buildId));
}

/** Only an http(s) URL; anything else (javascript:, file:, garbage) is `badUrl`. */
function parseHttpUrl(raw: string): string {
  const trimmed = raw.trim();
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    throw new ActionError("badUrl");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new ActionError("badUrl");
  if (!hostOf(trimmed)) throw new ActionError("badUrl");
  return trimmed;
}

export type AddByUrlInput = { buildId: string; url: string; name: string; gtin?: string };
export type AddedProduct = {
  productId: string;
  created: boolean;
  /** How an existing product was recognised. */
  matchedBy: "url" | "identifier" | "name" | null;
};

/**
 * Adds the product behind a shop link to a build. The link is never fetched (the host check
 * and the user's own typed name are all we use); the scraper learns the rest later. The
 * product is deduped by link, ASIN/GTIN, then name before a new catalog entry is created.
 */
export async function addProductByUrl(
  db: Db,
  actorId: string,
  input: AddByUrlInput,
): Promise<AddedProduct> {
  const url = parseHttpUrl(input.url);
  const host = hostOf(url);
  const allMerchants = await db.select().from(merchants);
  const candidates = allMerchants.filter((m) => hostOf(m.baseUrl) === host);
  if (candidates.length === 0) throw new ActionError("unknownMerchant");
  const merchant = candidates.find((m) => m.enabled && m.visibleToUsers) ?? candidates[0]!;

  const canon = canonicalUrl(url);
  const name = input.name.trim();
  const gtin = normalizeGtin(input.gtin);
  const asin = asinFromUrl(url);

  return db.transaction(async (tx) => {
    let productId: string | null = null;
    let matchedBy: AddedProduct["matchedBy"] = null;

    // 1. The same link already belongs to a catalog product.
    const pairs = await tx
      .select({
        productId: productMerchant.productId,
        manualUrl: productMerchant.manualUrl,
        autoUrl: productMerchant.autoUrl,
      })
      .from(productMerchant)
      .innerJoin(products, eq(products.id, productMerchant.productId))
      .where(and(eq(productMerchant.merchantId, merchant.id), eq(products.archived, false)));
    const byUrl = pairs.find(
      (p) =>
        (p.manualUrl && canonicalUrl(p.manualUrl) === canon) ||
        (p.autoUrl && canonicalUrl(p.autoUrl) === canon),
    );
    if (byUrl) {
      productId = byUrl.productId;
      matchedBy = "url";
    }

    // 2. The same ASIN or GTIN.
    if (!productId) {
      const wanted = [
        ...(asin ? [{ kind: "asin" as const, value: asin }] : []),
        ...(gtin ? [{ kind: "gtin" as const, value: gtin }] : []),
      ];
      for (const w of wanted) {
        const [hit] = await tx
          .select({ productId: productIdentifiers.productId })
          .from(productIdentifiers)
          .innerJoin(products, eq(products.id, productIdentifiers.productId))
          .where(
            and(
              eq(productIdentifiers.kind, w.kind),
              eq(productIdentifiers.value, w.value),
              eq(products.archived, false),
            ),
          );
        if (hit) {
          productId = hit.productId;
          matchedBy = "identifier";
          break;
        }
      }
    }

    // 3. The same name, ignoring noise (case, spacing, packaging words).
    if (!productId) {
      const key = catalogKey(name);
      const existing = await tx
        .select({ id: products.id, name: products.name })
        .from(products)
        .where(eq(products.archived, false));
      const byName = key ? existing.find((p) => catalogKey(p.name) === key) : undefined;
      if (byName) {
        productId = byName.id;
        matchedBy = "name";
      }
    }

    let created = false;
    if (!productId) {
      const [row] = await tx
        .insert(products)
        .values({ name, query: pcppQuery(name), refUrl: url, createdBy: actorId })
        .returning({ id: products.id });
      productId = row!.id;
      created = true;
      if (gtin) {
        await tx
          .insert(productIdentifiers)
          .values({ productId, kind: "gtin", value: gtin, source: "user", confirmed: false })
          .onConflictDoNothing();
      }
    }

    // Seed the pair's link, never replacing one that's there (pinning is admin-only).
    const [pair] = await tx
      .select({ manualUrl: productMerchant.manualUrl, autoUrl: productMerchant.autoUrl })
      .from(productMerchant)
      .where(
        and(eq(productMerchant.productId, productId), eq(productMerchant.merchantId, merchant.id)),
      );
    if (!pair) {
      await tx
        .insert(productMerchant)
        .values({ productId, merchantId: merchant.id, autoUrl: canon });
    } else if (!pair.manualUrl && !pair.autoUrl) {
      await tx
        .update(productMerchant)
        .set({ autoUrl: canon })
        .where(
          and(
            eq(productMerchant.productId, productId),
            eq(productMerchant.merchantId, merchant.id),
            isNull(productMerchant.manualUrl),
            isNull(productMerchant.autoUrl),
          ),
        );
    }

    await addToBuild(tx, input.buildId, productId);
    return { productId, created, matchedBy };
  });
}

export type ImportInput = { buildId: string; text: string; replace: boolean };

/**
 * Imports a pasted PCPartPicker list: each line becomes a catalog product (matched by
 * `catalogKey` or created) and a build item. `replace` first removes the build's items that
 * aren't marked bought.
 */
export async function importPcppList(db: Db, actorId: string, input: ImportInput) {
  const items = parsePcpp(input.text);
  if (items.length === 0) throw new ActionError("importEmpty");

  return db.transaction(async (tx) => {
    if (input.replace) {
      await tx
        .delete(buildItems)
        .where(and(eq(buildItems.buildId, input.buildId), isNull(buildItems.boughtAt)));
    }
    const known = new Map<string, string>();
    const existing = await tx
      .select({ id: products.id, name: products.name })
      .from(products)
      .where(eq(products.archived, false));
    for (const p of existing) {
      const key = catalogKey(p.name);
      if (key && !known.has(key)) known.set(key, p.id);
    }

    let added = 0;
    let matched = 0;
    for (const item of items) {
      const key = catalogKey(item.name);
      let productId = known.get(key);
      if (productId) {
        matched++;
      } else {
        const category = toCategory(item.category);
        const [row] = await tx
          .insert(products)
          .values({
            name: item.name,
            query: pcppQuery(item.name),
            category: category === "other" ? null : category,
            refPrice: item.priceEur,
            refUrl: item.url && /^https?:\/\//i.test(item.url) ? item.url : null,
            createdBy: actorId,
          })
          .returning({ id: products.id });
        productId = row!.id;
        if (key) known.set(key, productId);
        added++;
      }
      await addToBuild(tx, input.buildId, productId);
    }
    return { added, matched };
  });
}
