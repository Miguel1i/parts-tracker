"use server";

import { appSettings, getDb, scrapeRuns, type Db } from "@parts/db";
import { and, eq, ne } from "@parts/db/orm";
import { z } from "zod";
import { writeAudit } from "@/lib/admin/audit";
import { dispatchScrape } from "@/lib/admin/github";
import { ActionError, adminAction } from "@/lib/auth/guard";
import { CRON_HOURS } from "./hours";

type Scope = { productId?: string; merchantId?: string; buildId?: string };

/** Marks the queued row failed when GitHub refuses the dispatch (as startTestRun does). */
async function dispatch(db: Db, runId: string, scope: Scope) {
  try {
    const result = await dispatchScrape({ runId, ...scope });
    return { runId, ...result };
  } catch (e) {
    await db
      .update(scrapeRuns)
      .set({ status: "failed", finishedAt: new Date() })
      .where(and(eq(scrapeRuns.id, runId), ne(scrapeRuns.status, "succeeded")));
    console.error("[runs dispatch]", e);
    throw new ActionError("dispatchFailed");
  }
}

export const runAll = adminAction(z.object({}), async (_input, { actor }) => {
  const db = getDb();
  const run = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(scrapeRuns)
      .values({ trigger: "manual", scope: {}, status: "queued", requestedBy: actor.id })
      .returning({ id: scrapeRuns.id });
    await writeAudit(tx, {
      actorUserId: actor.id,
      action: "run.start",
      entity: "run",
      entityId: created!.id,
      diff: { scope: {} },
    });
    return created!;
  });
  return dispatch(db, run.id, {});
});

export const rerun = adminAction(
  z.object({ runId: z.string().min(1) }),
  async ({ runId }, { actor }) => {
    const db = getDb();
    const [source] = await db.select().from(scrapeRuns).where(eq(scrapeRuns.id, runId));
    if (!source) throw new ActionError("notFound");
    const scope: Scope = {
      ...(source.scope.productId ? { productId: source.scope.productId } : {}),
      ...(source.scope.merchantId ? { merchantId: source.scope.merchantId } : {}),
      ...(source.scope.buildId ? { buildId: source.scope.buildId } : {}),
    };
    const run = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(scrapeRuns)
        .values({ trigger: "manual", scope, status: "queued", requestedBy: actor.id })
        .returning({ id: scrapeRuns.id });
      await writeAudit(tx, {
        actorUserId: actor.id,
        action: "run.rerun",
        entity: "run",
        entityId: created!.id,
        diff: { rerunOf: runId, scope },
      });
      return created!;
    });
    return dispatch(db, run.id, scope);
  },
);

export const setCronInterval = adminAction(
  z.object({ hours: z.number().refine((h) => (CRON_HOURS as readonly number[]).includes(h)) }),
  async ({ hours }, { actor }) => {
    const db = getDb();
    await db.transaction(async (tx) => {
      await tx.insert(appSettings).values({ id: 1 }).onConflictDoNothing();
      const [before] = await tx.select().from(appSettings).where(eq(appSettings.id, 1));
      await tx
        .update(appSettings)
        .set({ cronIntervalHours: hours, updatedAt: new Date() })
        .where(eq(appSettings.id, 1));
      await writeAudit(tx, {
        actorUserId: actor.id,
        action: "settings.cronInterval",
        entity: "settings",
        entityId: "1",
        diff: { cronIntervalHours: [before?.cronIntervalHours, hours] },
      });
    });
    return { hours };
  },
);
