import { and, asc, eq, sql } from "drizzle-orm";
import type { Db } from "./client";
import {
  account,
  auditLog,
  builds,
  invites,
  products,
  scrapeRuns,
  user,
  userMerchants,
} from "./schema";

/** Owner of data imported before real users existed (see migration 0002_auth). */
export const LEGACY_ADMIN_USER_ID = "legacy-admin";
export const LEGACY_ADMIN_EMAIL = "legacy-admin@invalid.local";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Conn = Db | Tx;

/** Inserts the banned placeholder user that owns legacy rows, if it's missing. */
export async function ensureLegacyPlaceholder(db: Conn) {
  await db
    .insert(user)
    .values({
      id: LEGACY_ADMIN_USER_ID,
      name: "Legacy admin",
      email: LEGACY_ADMIN_EMAIL,
      role: "user",
      status: "pending",
      banned: true,
      banReason: "Placeholder for legacy data",
    })
    .onConflictDoNothing();
}

/** The oldest active admin, if any. */
export async function firstAdminId(db: Conn): Promise<string | undefined> {
  const [row] = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.role, "admin"), eq(user.status, "active"), eq(user.banned, false)))
    .orderBy(asc(user.createdAt))
    .limit(1);
  return row?.id;
}

export type PromoteResult = { userId: string; created: boolean; reassigned: number };

/** Better Auth's username rules (plugin defaults): 3-30 of a-z, 0-9, _ and ., stored lowercased. */
export function normalizeUsername(raw: string): string {
  const username = raw.trim().toLowerCase();
  if (!/^[a-z0-9_.]{3,30}$/.test(username)) {
    throw new Error(`Usernames are 3-30 letters, digits, _ or . (got "${raw}")`);
  }
  return username;
}

export type PromoteOptions = {
  /** Sign-in username; kept if omitted. */
  username?: string;
  /** A Better Auth password hash (`hashPassword` from better-auth/crypto) for the email/password login. */
  passwordHash?: string;
};

/**
 * Creates (or promotes) `email` as an active admin and moves every row owned by the legacy
 * placeholder to them, then deletes the placeholder. One transaction; safe to re-run.
 */
export async function promoteAdmin(
  db: Db,
  rawEmail: string,
  options: PromoteOptions = {},
): Promise<PromoteResult> {
  const email = rawEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`Not an email: ${rawEmail}`);
  if (email === LEGACY_ADMIN_EMAIL) throw new Error("That's the placeholder account");
  const username = options.username === undefined ? undefined : normalizeUsername(options.username);

  return db.transaction(async (tx) => {
    if (username) {
      const [taken] = await tx
        .select({ email: user.email })
        .from(user)
        .where(eq(user.username, username));
      if (taken && taken.email !== email) throw new Error(`Username "${username}" is taken`);
    }
    const [existing] = await tx.select({ id: user.id }).from(user).where(eq(user.email, email));
    let userId: string;
    if (existing) {
      userId = existing.id;
      await tx
        .update(user)
        .set({
          role: "admin",
          status: "active",
          banned: false,
          banReason: null,
          banExpires: null,
          ...(username ? { username, displayUsername: options.username!.trim() } : {}),
        })
        .where(eq(user.id, userId));
    } else {
      const [created] = await tx
        .insert(user)
        .values({
          name: options.username?.trim() || email.split("@")[0]!,
          email,
          ...(username ? { username, displayUsername: options.username!.trim() } : {}),
          emailVerified: true,
          role: "admin",
          status: "active",
        })
        .returning({ id: user.id });
      userId = created!.id;
    }

    if (options.passwordHash) {
      // Better Auth keeps the email/password login as an account with provider "credential".
      const [cred] = await tx
        .select({ id: account.id })
        .from(account)
        .where(and(eq(account.userId, userId), eq(account.providerId, "credential")));
      if (cred) {
        await tx
          .update(account)
          .set({ password: options.passwordHash })
          .where(eq(account.id, cred.id));
      } else {
        await tx.insert(account).values({
          userId,
          accountId: userId,
          providerId: "credential",
          password: options.passwordHash,
        });
      }
    }

    const legacy = LEGACY_ADMIN_USER_ID;
    let reassigned = 0;
    const count = (r: { rowsAffected: number }) => (reassigned += r.rowsAffected);

    // user_merchants has PK (userId, merchantId): copy what doesn't collide, then drop the rest.
    count(
      await tx.run(sql`INSERT OR IGNORE INTO ${userMerchants} (user_id, merchant_id, enabled)
        SELECT ${userId}, merchant_id, enabled FROM ${userMerchants} WHERE user_id = ${legacy}`),
    );
    await tx.delete(userMerchants).where(eq(userMerchants.userId, legacy));
    count(await tx.update(builds).set({ userId }).where(eq(builds.userId, legacy)));
    count(
      await tx.update(products).set({ createdBy: userId }).where(eq(products.createdBy, legacy)),
    );
    count(await tx.update(invites).set({ invitedBy: userId }).where(eq(invites.invitedBy, legacy)));
    count(
      await tx
        .update(auditLog)
        .set({ actorUserId: userId })
        .where(eq(auditLog.actorUserId, legacy)),
    );
    count(
      await tx
        .update(scrapeRuns)
        .set({ requestedBy: userId })
        .where(eq(scrapeRuns.requestedBy, legacy)),
    );
    await tx.delete(user).where(eq(user.id, legacy));

    await tx.insert(auditLog).values({
      actorUserId: userId,
      action: existing ? "user.promote" : "user.create",
      entity: "user",
      entityId: userId,
      diff: {
        role: "admin",
        status: "active",
        via: "seed:admin",
        reassigned,
        ...(username ? { username } : {}),
        ...(options.passwordHash ? { password: "set" } : {}),
      },
    });

    return { userId, created: !existing, reassigned };
  });
}
