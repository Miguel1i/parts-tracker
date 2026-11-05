import "server-only";
import { appSettings, getDb, matchCandidates, user, verification } from "@parts/db";
import { and, asc, eq, gt, like } from "@parts/db/orm";

/** Badge counts for the admin section nav. Call only after requireAdmin(). */
export async function getAdminCounts() {
  const db = getDb();
  const [pendingUsers, resets, pendingReview] = await Promise.all([
    db.$count(user, and(eq(user.status, "pending"), eq(user.banned, false))),
    db.$count(verification, openResets()),
    db.$count(matchCandidates, eq(matchCandidates.status, "pending")),
  ]);
  // Sign-ups and password-reset requests both wait on the Users page.
  return { pendingUsers: pendingUsers + resets, pendingReview };
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

/** Better Auth's unexpired password-reset tokens (verification rows `reset-password:<token>`). */
export const RESET_PREFIX = "reset-password:";
function openResets() {
  return and(
    like(verification.identifier, `${RESET_PREFIX}%`),
    gt(verification.expiresAt, new Date()),
  );
}

/** Open password-reset requests with who asked, oldest first. Call only after requireAdmin(). */
export async function getResetRequests() {
  return getDb()
    .select({
      id: verification.id,
      expiresAt: verification.expiresAt,
      requestedAt: verification.createdAt,
      userId: user.id,
      name: user.name,
      email: user.email,
      username: user.displayUsername,
    })
    .from(verification)
    .innerJoin(user, eq(user.id, verification.value))
    .where(openResets())
    .orderBy(asc(verification.createdAt))
    .limit(100);
}
