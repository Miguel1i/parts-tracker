"use server";

import { buildItems, builds, getDb, merchants, products } from "@parts/db";
import { and, asc, eq } from "@parts/db/orm";
import { z } from "zod";
import { ActionError, userAction } from "@/lib/auth/guard";
import { newShareToken, ownedBuild } from "@/lib/builds/access";
import { addProductByUrl, addToBuild, importPcppList } from "@/lib/builds/add-product";
import { reportMatch, runStatus, startCheck } from "@/lib/builds/checks";
import { searchCatalog as searchCatalogQuery } from "@/lib/builds/queries";

const id = z.string().min(1).max(100);
const itemKey = z.object({ buildId: id, productId: id });

async function touch(db: ReturnType<typeof getDb>, buildId: string) {
  await db.update(builds).set({ updatedAt: new Date() }).where(eq(builds.id, buildId));
}

// -------------------------------------------------------------- items

export const setQuantity = userAction(
  itemKey.extend({ quantity: z.number().int().min(1).max(99) }),
  async (input, { actor }) => {
    const db = getDb();
    await ownedBuild(db, input.buildId, actor.id);
    const rows = await db
      .update(buildItems)
      .set({ quantity: input.quantity })
      .where(and(eq(buildItems.buildId, input.buildId), eq(buildItems.productId, input.productId)))
      .returning({ productId: buildItems.productId });
    if (rows.length === 0) throw new ActionError("notFound");
    await touch(db, input.buildId);
    return { quantity: input.quantity };
  },
);

export const removeItem = userAction(itemKey, async (input, { actor }) => {
  const db = getDb();
  await ownedBuild(db, input.buildId, actor.id);
  await db
    .delete(buildItems)
    .where(and(eq(buildItems.buildId, input.buildId), eq(buildItems.productId, input.productId)));
  await touch(db, input.buildId);
  return { productId: input.productId };
});

export const moveItem = userAction(
  itemKey.extend({ direction: z.enum(["up", "down"]) }),
  async (input, { actor }) => {
    const db = getDb();
    await ownedBuild(db, input.buildId, actor.id);
    await db.transaction(async (tx) => {
      const rows = await tx
        .select({ productId: buildItems.productId })
        .from(buildItems)
        .innerJoin(products, eq(products.id, buildItems.productId))
        .where(eq(buildItems.buildId, input.buildId))
        .orderBy(asc(buildItems.sortOrder), asc(products.name));
      const from = rows.findIndex((r) => r.productId === input.productId);
      if (from < 0) throw new ActionError("notFound");
      const to = input.direction === "up" ? from - 1 : from + 1;
      if (to < 0 || to >= rows.length) return;
      const order = rows.map((r) => r.productId);
      [order[from], order[to]] = [order[to]!, order[from]!];
      for (const [index, productId] of order.entries()) {
        await tx
          .update(buildItems)
          .set({ sortOrder: index })
          .where(and(eq(buildItems.buildId, input.buildId), eq(buildItems.productId, productId)));
      }
    });
    return { productId: input.productId };
  },
);

export const setBought = userAction(
  itemKey.extend({
    price: z.number().min(0).max(1_000_000).nullable(),
    merchantId: id.nullable(),
    /** yyyy-mm-dd */
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  async (input, { actor }) => {
    const db = getDb();
    await ownedBuild(db, input.buildId, actor.id);
    const boughtAt = new Date(`${input.date}T12:00:00Z`);
    if (Number.isNaN(boughtAt.getTime())) throw new ActionError("invalid");
    if (input.merchantId) {
      const [m] = await db
        .select({ id: merchants.id })
        .from(merchants)
        .where(eq(merchants.id, input.merchantId));
      if (!m) throw new ActionError("notFound");
    }
    const rows = await db
      .update(buildItems)
      .set({ boughtAt, boughtPrice: input.price, boughtMerchantId: input.merchantId })
      .where(and(eq(buildItems.buildId, input.buildId), eq(buildItems.productId, input.productId)))
      .returning({ productId: buildItems.productId });
    if (rows.length === 0) throw new ActionError("notFound");
    await touch(db, input.buildId);
    return { productId: input.productId };
  },
);

export const clearBought = userAction(itemKey, async (input, { actor }) => {
  const db = getDb();
  await ownedBuild(db, input.buildId, actor.id);
  const rows = await db
    .update(buildItems)
    .set({ boughtAt: null, boughtPrice: null, boughtMerchantId: null })
    .where(and(eq(buildItems.buildId, input.buildId), eq(buildItems.productId, input.productId)))
    .returning({ productId: buildItems.productId });
  if (rows.length === 0) throw new ActionError("notFound");
  await touch(db, input.buildId);
  return { productId: input.productId };
});

// -------------------------------------------------------------- adding

export const searchCatalog = userAction(z.object({ q: z.string().max(200) }), async ({ q }) =>
  searchCatalogQuery(getDb(), q),
);

export const addCatalogProduct = userAction(itemKey, async (input, { actor }) => {
  const db = getDb();
  await ownedBuild(db, input.buildId, actor.id);
  const [p] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.id, input.productId), eq(products.archived, false)));
  if (!p) throw new ActionError("notFound");
  await db.transaction((tx) => addToBuild(tx, input.buildId, input.productId));
  return { productId: input.productId };
});

export const addByUrl = userAction(
  z.object({
    buildId: id,
    url: z.string().trim().min(1).max(2000),
    name: z.string().trim().min(2).max(200),
    gtin: z.string().trim().max(32).optional(),
  }),
  async (input, { actor }) => {
    const db = getDb();
    await ownedBuild(db, input.buildId, actor.id);
    return addProductByUrl(db, actor.id, input);
  },
);

export const importPcpp = userAction(
  z.object({ buildId: id, text: z.string().max(50_000), replace: z.boolean() }),
  async (input, { actor }) => {
    const db = getDb();
    await ownedBuild(db, input.buildId, actor.id);
    return importPcppList(db, actor.id, input);
  },
);

// -------------------------------------------------------------- checks & reports

export const checkNow = userAction(
  z.object({ buildId: id, productId: id.optional() }),
  async (input, { actor, isAdmin }) => {
    const db = getDb();
    await ownedBuild(db, input.buildId, actor.id);
    if (input.productId) {
      // A single part of an owned build.
      const [item] = await db
        .select({ productId: buildItems.productId })
        .from(buildItems)
        .where(
          and(eq(buildItems.buildId, input.buildId), eq(buildItems.productId, input.productId)),
        );
      if (!item) throw new ActionError("notFound");
      return startCheck(db, actor, isAdmin, { productId: input.productId });
    }
    return startCheck(db, actor, isAdmin, { buildId: input.buildId });
  },
);

export const getRunStatus = userAction(z.object({ runId: id }), async ({ runId }, ctx) =>
  runStatus(getDb(), ctx.actor, ctx.isAdmin, runId),
);

export const reportWrongMatch = userAction(
  itemKey.extend({ merchantId: id, reason: z.string().trim().max(500).optional() }),
  async (input, { actor }) => {
    const db = getDb();
    await ownedBuild(db, input.buildId, actor.id);
    await reportMatch(db, actor.id, input);
    return { productId: input.productId };
  },
);

// -------------------------------------------------------------- sharing

export const setBuildPublic = userAction(
  z.object({ buildId: id, isPublic: z.boolean() }),
  async (input, { actor }) => {
    const db = getDb();
    const build = await ownedBuild(db, input.buildId, actor.id);
    const shareToken = input.isPublic && !build.shareToken ? newShareToken() : build.shareToken;
    await db
      .update(builds)
      .set({ isPublic: input.isPublic, shareToken })
      .where(and(eq(builds.id, input.buildId), eq(builds.userId, actor.id)));
    return { isPublic: input.isPublic, shareToken };
  },
);

export const resetShareLink = userAction(z.object({ buildId: id }), async (input, { actor }) => {
  const db = getDb();
  await ownedBuild(db, input.buildId, actor.id);
  const shareToken = newShareToken();
  await db
    .update(builds)
    .set({ shareToken })
    .where(and(eq(builds.id, input.buildId), eq(builds.userId, actor.id)));
  return { shareToken };
});
