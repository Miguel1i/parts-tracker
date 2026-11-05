"use server";

import { builds, getDb } from "@parts/db";
import { and, eq } from "@parts/db/orm";
import { z } from "zod";
import { ActionError, userAction } from "@/lib/auth/guard";
import { ownedBuild } from "@/lib/builds/access";

const MAX_BUILDS = 50;
const name = z.string().trim().min(1).max(80);

export const createBuild = userAction(z.object({ name }), async (input, { actor }) => {
  const db = getDb();
  const count = await db.$count(builds, eq(builds.userId, actor.id));
  if (count >= MAX_BUILDS) throw new ActionError("invalid");
  const [row] = await db
    .insert(builds)
    .values({ userId: actor.id, name: input.name })
    .returning({ id: builds.id });
  return { id: row!.id };
});

export const renameBuild = userAction(
  z.object({ buildId: z.string().min(1).max(100), name }),
  async (input, { actor }) => {
    const db = getDb();
    await ownedBuild(db, input.buildId, actor.id);
    await db
      .update(builds)
      .set({ name: input.name })
      .where(and(eq(builds.id, input.buildId), eq(builds.userId, actor.id)));
    return { id: input.buildId };
  },
);

export const deleteBuild = userAction(
  z.object({ buildId: z.string().min(1).max(100) }),
  async (input, { actor }) => {
    const db = getDb();
    await ownedBuild(db, input.buildId, actor.id);
    await db.delete(builds).where(and(eq(builds.id, input.buildId), eq(builds.userId, actor.id)));
    return { id: input.buildId };
  },
);
