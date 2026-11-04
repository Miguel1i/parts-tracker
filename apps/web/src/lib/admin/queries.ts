import "server-only";
import { appSettings, getDb, matchCandidates, user } from "@parts/db";
import { and, eq } from "@parts/db/orm";

/** Badge counts for the admin section nav. Call only after requireAdmin(). */
export async function getAdminCounts() {
  const db = getDb();
  const [pendingUsers, pendingReview] = await Promise.all([
    db.$count(user, and(eq(user.status, "pending"), eq(user.banned, false))),
    db.$count(matchCandidates, eq(matchCandidates.status, "pending")),
  ]);
  return { pendingUsers, pendingReview };
}

export async function getSettings() {
  const db = getDb();
  const read = () => db.select().from(appSettings).where(eq(appSettings.id, 1));
  const [row] = await read();
  if (row) return row;
  // Fresh database without `pnpm db:seed`: create the defaults once.
  await db.insert(appSettings).values({ id: 1 }).onConflictDoNothing();
  return (await read())[0]!;
}
