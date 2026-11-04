import "server-only";
import { appSettings, getDb, matchCandidates, user } from "@parts/db";
import { eq } from "@parts/db/orm";

/** Badge counts for the admin section nav. Call only after requireAdmin(). */
export async function getAdminCounts() {
  const db = getDb();
  const [pendingUsers, pendingReview] = await Promise.all([
    db.$count(user, eq(user.status, "pending")),
    db.$count(matchCandidates, eq(matchCandidates.status, "pending")),
  ]);
  return { pendingUsers, pendingReview };
}

export async function getSettings() {
  const db = getDb();
  await db.insert(appSettings).values({ id: 1 }).onConflictDoNothing();
  const [row] = await db.select().from(appSettings).where(eq(appSettings.id, 1));
  return row!;
}
