import "server-only";
import { randomBytes } from "node:crypto";
import { builds, user, type Db } from "@parts/db";
import { and, eq } from "@parts/db/orm";
import { ActionError } from "@/lib/auth/guard";

type Conn = Pick<Db, "select">;

/**
 * The build if `userId` owns it. Anything else is `notFound`, so other users' build ids are
 * never confirmed to exist.
 */
export async function ownedBuild(db: Conn, buildId: string, userId: string) {
  const [row] = await db
    .select()
    .from(builds)
    .where(and(eq(builds.id, buildId), eq(builds.userId, userId)));
  if (!row) throw new ActionError("notFound");
  return row;
}

/** A shared build by its link token, only while it's public. Owner shown by display name only. */
export async function publicBuildByToken(db: Conn, token: string) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const [row] = await db
    .select({ build: builds, ownerName: user.name })
    .from(builds)
    .innerJoin(user, eq(user.id, builds.userId))
    .where(and(eq(builds.shareToken, token), eq(builds.isPublic, true)));
  return row ?? null;
}

/** 32 random bytes, base64url: the read-only share link's id. */
export function newShareToken() {
  return randomBytes(32).toString("base64url");
}
