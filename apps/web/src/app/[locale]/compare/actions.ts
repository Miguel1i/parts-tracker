"use server";

import { buildItems, getDb, scrapeLogs } from "@parts/db";
import { and, desc, eq } from "@parts/db/orm";
import { z } from "zod";
import { ActionError, userAction } from "@/lib/auth/guard";
import { ownedBuild } from "@/lib/builds/access";

const id = z.string().min(1).max(100);

/** The latest scrape log of one pair of an owned build (null when it was never checked). */
export const pairLog = userAction(
  z.object({ buildId: id, productId: id, merchantId: id }),
  async (input, { actor }) => {
    const db = getDb();
    await ownedBuild(db, input.buildId, actor.id);
    const [item] = await db
      .select({ productId: buildItems.productId })
      .from(buildItems)
      .where(and(eq(buildItems.buildId, input.buildId), eq(buildItems.productId, input.productId)));
    if (!item) throw new ActionError("notFound");
    const [row] = await db
      .select({
        status: scrapeLogs.status,
        message: scrapeLogs.message,
        log: scrapeLogs.log,
        createdAt: scrapeLogs.createdAt,
      })
      .from(scrapeLogs)
      .where(
        and(eq(scrapeLogs.productId, input.productId), eq(scrapeLogs.merchantId, input.merchantId)),
      )
      .orderBy(desc(scrapeLogs.id))
      .limit(1);
    return {
      entry: row
        ? {
            status: row.status,
            message: row.message,
            log: row.log,
            createdAt: row.createdAt ? row.createdAt.getTime() : null,
          }
        : null,
    };
  },
);
