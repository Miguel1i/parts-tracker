"use server";

import {
  getDb,
  matchCandidates,
  merchants,
  pricePoints,
  products,
  scrapeLogs,
  scrapeRuns,
} from "@parts/db";
import { and, asc, desc, eq, ne } from "@parts/db/orm";
import { z } from "zod";
import { mergeAdapterConfig } from "@/lib/admin/adapter-schema";
import { changes, writeAudit } from "@/lib/admin/audit";
import { dispatchScrape } from "@/lib/admin/github";
import { ActionError, adminAction } from "@/lib/auth/guard";
import { merchantValuesSchema } from "./schema";

const idSchema = z.object({ id: z.string().min(1) });

function errorText(e: unknown): string {
  const parts: string[] = [];
  for (let cur: unknown = e, i = 0; cur && i < 4; i++) {
    if (cur instanceof Error) {
      parts.push(cur.message);
      cur = cur.cause;
    } else break;
  }
  return parts.join(" ");
}

/** Turns a unique-index violation into a message the admin can act on. */
function friendly(e: unknown): never {
  const text = errorText(e);
  if (/merchants_slug_uq|merchants\.slug/.test(text)) throw new ActionError("slugTaken");
  if (/merchants_name_uq|merchants\.name/.test(text)) throw new ActionError("nameTaken");
  if (/UNIQUE/i.test(text)) throw new ActionError("duplicate");
  throw e;
}

function buildRow(input: z.output<typeof merchantValuesSchema>) {
  const merged = mergeAdapterConfig(input.adapter, input.overrides);
  if (!merged.ok) throw new ActionError("invalidAdapter");
  return {
    name: input.name,
    slug: input.slug,
    country: input.country,
    baseUrl: input.baseUrl,
    searchTemplate: input.searchTemplate,
    currency: input.currency,
    shipping: input.shipping,
    freeShippingOver: input.freeShippingOver,
    enabled: input.enabled,
    visibleToUsers: input.visibleToUsers,
    ownOnly: input.ownOnly,
    needsBrowser: input.needsBrowser,
    adapterConfig: merged.config,
    notes: input.notes,
    color: input.color,
  };
}

export const createMerchant = adminAction(merchantValuesSchema, async (input, { actor }) => {
  const row = buildRow(input);
  const db = getDb();
  try {
    return await db.transaction(async (tx) => {
      const [last] = await tx
        .select({ sortOrder: merchants.sortOrder })
        .from(merchants)
        .orderBy(desc(merchants.sortOrder))
        .limit(1);
      const [created] = await tx
        .insert(merchants)
        .values({ ...row, sortOrder: (last?.sortOrder ?? -1) + 1 })
        .returning();
      const diff: Record<string, unknown> = { ...created! };
      delete diff.createdAt;
      delete diff.lastHealthAt;
      await writeAudit(tx, {
        actorUserId: actor.id,
        action: "merchant.create",
        entity: "merchant",
        entityId: created!.id,
        diff,
      });
      return { id: created!.id };
    });
  } catch (e) {
    friendly(e);
  }
});

export const updateMerchant = adminAction(
  z.object({ id: z.string().min(1), values: merchantValuesSchema }),
  async ({ id, values }, { actor }) => {
    const row = buildRow(values);
    const db = getDb();
    try {
      await db.transaction(async (tx) => {
        const [before] = await tx.select().from(merchants).where(eq(merchants.id, id));
        if (!before) throw new ActionError("notFound");
        await tx.update(merchants).set(row).where(eq(merchants.id, id));
        await writeAudit(tx, {
          actorUserId: actor.id,
          action: "merchant.update",
          entity: "merchant",
          entityId: id,
          diff: changes(before, row),
        });
      });
    } catch (e) {
      friendly(e);
    }
    return { id };
  },
);

export const deleteMerchant = adminAction(idSchema, async ({ id }, { actor }) => {
  const db = getDb();
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(merchants).where(eq(merchants.id, id));
    if (!before) throw new ActionError("notFound");
    const history = await tx.$count(pricePoints, eq(pricePoints.merchantId, id));
    if (history > 0) {
      throw new ActionError("hasHistory");
    }
    await tx.delete(merchants).where(eq(merchants.id, id));
    await writeAudit(tx, {
      actorUserId: actor.id,
      action: "merchant.delete",
      entity: "merchant",
      entityId: id,
      diff: { name: before.name, slug: before.slug },
    });
  });
  return { id };
});

export const setMerchantFlag = adminAction(
  z.object({
    id: z.string().min(1),
    flag: z.enum(["enabled", "visibleToUsers"]),
    value: z.boolean(),
  }),
  async ({ id, flag, value }, { actor }) => {
    const db = getDb();
    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(merchants).where(eq(merchants.id, id));
      if (!before) throw new ActionError("notFound");
      if (before[flag] === value) return;
      await tx
        .update(merchants)
        .set({ [flag]: value })
        .where(eq(merchants.id, id));
      const action =
        flag === "enabled"
          ? value
            ? "merchant.enable"
            : "merchant.disable"
          : value
            ? "merchant.show"
            : "merchant.hide";
      await writeAudit(tx, {
        actorUserId: actor.id,
        action,
        entity: "merchant",
        entityId: id,
        diff: { [flag]: [before[flag], value] },
      });
    });
    return { id };
  },
);

export const moveMerchant = adminAction(
  z.object({ id: z.string().min(1), direction: z.enum(["up", "down"]) }),
  async ({ id, direction }, { actor }) => {
    const db = getDb();
    await db.transaction(async (tx) => {
      const all = await tx
        .select({ id: merchants.id, sortOrder: merchants.sortOrder })
        .from(merchants)
        .orderBy(asc(merchants.sortOrder), asc(merchants.name));
      const from = all.findIndex((m) => m.id === id);
      if (from < 0) throw new ActionError("notFound");
      const to = direction === "up" ? from - 1 : from + 1;
      if (to < 0 || to >= all.length) return;
      const order = all.map((m) => m.id);
      [order[from], order[to]] = [order[to]!, order[from]!];
      for (const [index, mid] of order.entries()) {
        const current = all.find((m) => m.id === mid)!;
        if (current.sortOrder !== index) {
          await tx.update(merchants).set({ sortOrder: index }).where(eq(merchants.id, mid));
        }
      }
      await writeAudit(tx, {
        actorUserId: actor.id,
        action: "merchant.reorder",
        entity: "merchant",
        entityId: id,
        diff: { position: [from, to] },
      });
    });
    return { id };
  },
);

export const startTestRun = adminAction(
  z.object({ merchantId: z.string().min(1), productId: z.string().min(1) }),
  async ({ merchantId, productId }, { actor }) => {
    const db = getDb();
    const [merchant] = await db.select().from(merchants).where(eq(merchants.id, merchantId));
    if (!merchant) throw new ActionError("notFound");
    const [product] = await db
      .select({ id: products.id, name: products.name })
      .from(products)
      .where(and(eq(products.id, productId), eq(products.archived, false)));
    if (!product) throw new ActionError("notFound");

    const run = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(scrapeRuns)
        .values({
          trigger: "manual",
          scope: { productId, merchantId },
          status: "queued",
          requestedBy: actor.id,
        })
        .returning({ id: scrapeRuns.id });
      await writeAudit(tx, {
        actorUserId: actor.id,
        action: "merchant.test",
        entity: "merchant",
        entityId: merchantId,
        diff: { productId, runId: created!.id },
      });
      return created!;
    });

    try {
      const result = await dispatchScrape({ productId, merchantId, runId: run.id });
      return { runId: run.id, ...result };
    } catch (e) {
      await db
        .update(scrapeRuns)
        .set({ status: "failed", finishedAt: new Date() })
        .where(and(eq(scrapeRuns.id, run.id), ne(scrapeRuns.status, "succeeded")));
      console.error("[startTestRun]", e);
      throw new ActionError("dispatchFailed");
    }
  },
);

export const getTestRun = adminAction(z.object({ runId: z.string().min(1) }), async ({ runId }) => {
  const db = getDb();
  const [run] = await db.select().from(scrapeRuns).where(eq(scrapeRuns.id, runId));
  if (!run) throw new ActionError("notFound");
  const [logs, candidates, points] = await Promise.all([
    db
      .select({
        id: scrapeLogs.id,
        status: scrapeLogs.status,
        message: scrapeLogs.message,
        log: scrapeLogs.log,
      })
      .from(scrapeLogs)
      .where(eq(scrapeLogs.runId, runId))
      .orderBy(asc(scrapeLogs.id)),
    db
      .select({
        id: matchCandidates.id,
        title: matchCandidates.title,
        url: matchCandidates.url,
        priceEur: matchCandidates.priceEur,
        score: matchCandidates.score,
        status: matchCandidates.status,
        signals: matchCandidates.signals,
      })
      .from(matchCandidates)
      .where(eq(matchCandidates.runId, runId))
      .orderBy(desc(matchCandidates.score)),
    db
      .select({
        id: pricePoints.id,
        priceEur: pricePoints.priceEur,
        inStock: pricePoints.inStock,
        url: pricePoints.url,
        title: pricePoints.title,
      })
      .from(pricePoints)
      .where(eq(pricePoints.runId, runId))
      .orderBy(asc(pricePoints.id)),
  ]);
  return {
    run: {
      id: run.id,
      status: run.status,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      stats: run.stats,
      ghRunUrl: run.ghRunUrl,
    },
    logs,
    candidates: candidates.map((c) => ({
      id: c.id,
      title: c.title,
      url: c.url,
      priceEur: c.priceEur,
      score: c.score,
      status: c.status,
      vetoes: c.signals?.vetoes ?? [],
    })),
    points,
  };
});
