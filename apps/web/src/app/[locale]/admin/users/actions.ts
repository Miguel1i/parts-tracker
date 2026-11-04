"use server";

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { appSettings, getDb, invites, signupModes, user } from "@parts/db";
import { and, eq, isNull } from "@parts/db/orm";
import { getPathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { writeAudit } from "@/lib/admin/audit";
import { ActionError, adminAction } from "@/lib/auth/guard";
import { auth } from "@/lib/auth/server";
import { normalizeEmail } from "@/lib/auth/signup";
import { linkEmail, sendEmail } from "@/lib/email";

/*
 * Every export is built with adminAction (re-checks the session as an active admin on each
 * call). Role, ban, session and delete changes go through Better Auth's admin API so its own
 * invariants hold (a ban revokes sessions, …); each one is written to the audit log.
 */

const userId = z.object({ userId: z.string().min(1) });
const INVITE_DAYS = 7;

async function target(id: string) {
  const [row] = await getDb().select().from(user).where(eq(user.id, id));
  if (!row) throw new ActionError("notFound");
  return row;
}

/** Admins can't lock themselves out: no self-demotion, ban or delete. */
function notSelf(actorId: string, id: string) {
  if (actorId === id) throw new ActionError("self");
}

export const approveUser = adminAction(userId, async ({ userId: id }, { actor }) => {
  const before = await target(id);
  if (before.status === "active") return { status: "active" as const };
  await getDb().transaction(async (tx) => {
    await tx.update(user).set({ status: "active" }).where(eq(user.id, id));
    await writeAudit(tx, {
      actorUserId: actor.id,
      action: "user.approve",
      entity: "user",
      entityId: id,
      diff: { status: [before.status, "active"] },
    });
  });
  return { status: "active" as const };
});

export const setUserRole = adminAction(
  userId.extend({ role: z.enum(["admin", "user"]) }),
  async ({ userId: id, role }, { actor }) => {
    notSelf(actor.id, id);
    const before = await target(id);
    await auth.api.setRole({ body: { userId: id, role }, headers: await headers() });
    await writeAudit(getDb(), {
      actorUserId: actor.id,
      action: "user.role",
      entity: "user",
      entityId: id,
      diff: { role: [before.role, role] },
    });
    return { role };
  },
);

export const banUser = adminAction(
  userId.extend({
    reason: z.string().trim().max(200).optional(),
    /** Days; empty = permanent. */
    days: z.number().int().min(1).max(3650).optional(),
  }),
  async ({ userId: id, reason, days }, { actor }) => {
    notSelf(actor.id, id);
    await target(id);
    await auth.api.banUser({
      body: {
        userId: id,
        ...(reason ? { banReason: reason } : {}),
        ...(days ? { banExpiresIn: days * 86_400 } : {}),
      },
      headers: await headers(),
    });
    await writeAudit(getDb(), {
      actorUserId: actor.id,
      action: "user.ban",
      entity: "user",
      entityId: id,
      diff: { reason: reason ?? null, days: days ?? null },
    });
    return null;
  },
);

export const unbanUser = adminAction(userId, async ({ userId: id }, { actor }) => {
  await target(id);
  await auth.api.unbanUser({ body: { userId: id }, headers: await headers() });
  await writeAudit(getDb(), {
    actorUserId: actor.id,
    action: "user.unban",
    entity: "user",
    entityId: id,
  });
  return null;
});

export const revokeUserSessions = adminAction(userId, async ({ userId: id }, { actor }) => {
  await target(id);
  await auth.api.revokeUserSessions({ body: { userId: id }, headers: await headers() });
  await writeAudit(getDb(), {
    actorUserId: actor.id,
    action: "user.revokeSessions",
    entity: "user",
    entityId: id,
  });
  return null;
});

export const removeUser = adminAction(
  userId.extend({ confirmEmail: z.string() }),
  async ({ userId: id, confirmEmail }, { actor }) => {
    notSelf(actor.id, id);
    const before = await target(id);
    if (normalizeEmail(confirmEmail) !== normalizeEmail(before.email)) {
      throw new ActionError("emailMismatch");
    }
    await auth.api.removeUser({ body: { userId: id }, headers: await headers() });
    // After the delete, so the audit row's actor FK isn't the deleted user.
    await writeAudit(getDb(), {
      actorUserId: actor.id,
      action: "user.delete",
      entity: "user",
      entityId: id,
      diff: { email: before.email, name: before.name, role: before.role },
    });
    return null;
  },
);

export const updateUserName = adminAction(
  userId.extend({ name: z.string().trim().min(1).max(100) }),
  async ({ userId: id, name }, { actor }) => {
    const before = await target(id);
    if (before.name === name) return { name };
    await getDb().transaction(async (tx) => {
      await tx.update(user).set({ name }).where(eq(user.id, id));
      await writeAudit(tx, {
        actorUserId: actor.id,
        action: "user.update",
        entity: "user",
        entityId: id,
        diff: { name: [before.name, name] },
      });
    });
    return { name };
  },
);

export const setSignupMode = adminAction(
  z.object({ mode: z.enum(signupModes) }),
  async ({ mode }, { actor }) => {
    const db = getDb();
    await db.transaction(async (tx) => {
      await tx.insert(appSettings).values({ id: 1 }).onConflictDoNothing();
      const [before] = await tx.select().from(appSettings).where(eq(appSettings.id, 1));
      await tx
        .update(appSettings)
        .set({ signupMode: mode, updatedAt: new Date() })
        .where(eq(appSettings.id, 1));
      await writeAudit(tx, {
        actorUserId: actor.id,
        action: "settings.signupMode",
        entity: "settings",
        entityId: "1",
        diff: { signupMode: [before?.signupMode, mode] },
      });
    });
    return { mode };
  },
);

export const inviteUser = adminAction(
  z.object({
    email: z.email().max(254),
    role: z.enum(["admin", "user"]).default("user"),
    locale: z.enum(routing.locales).default(routing.defaultLocale),
  }),
  async ({ email: rawEmail, role, locale }, { actor }) => {
    const email = normalizeEmail(rawEmail);
    const db = getDb();
    const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
    if (existing) throw new ActionError("userExists");

    const token = randomBytes(24).toString("base64url");
    const expiresAt = new Date(Date.now() + INVITE_DAYS * 86_400_000);
    await db.transaction(async (tx) => {
      // A new invite replaces any open one for the same email.
      await tx.delete(invites).where(and(eq(invites.email, email), isNull(invites.usedAt)));
      await tx.insert(invites).values({ email, role, token, invitedBy: actor.id, expiresAt });
      await writeAudit(tx, {
        actorUserId: actor.id,
        action: "invite.create",
        entity: "invite",
        entityId: email,
        diff: { email, role, expiresAt: expiresAt.toISOString() },
      });
    });

    const base = (process.env.BETTER_AUTH_URL || "http://localhost:3000").replace(/\/$/, "");
    const path = getPathname({
      href: { pathname: "/sign-in", query: { invite: token, email } },
      locale,
    });
    const t = await getTranslations({ locale, namespace: "Email.invite" });
    await sendEmail({
      to: email,
      subject: t("subject"),
      ...linkEmail({
        heading: t("heading"),
        body: t("body", { inviter: actor.name || actor.email }),
        cta: t("cta"),
        url: `${base}${path}`,
        footer: t("footer"),
      }),
    });
    return { email, expiresAt };
  },
);

export const revokeInvite = adminAction(
  z.object({ inviteId: z.string().min(1) }),
  async ({ inviteId }, { actor }) => {
    const db = getDb();
    const [row] = await db.select().from(invites).where(eq(invites.id, inviteId));
    if (!row) throw new ActionError("notFound");
    await db.transaction(async (tx) => {
      await tx.delete(invites).where(eq(invites.id, inviteId));
      await writeAudit(tx, {
        actorUserId: actor.id,
        action: "invite.revoke",
        entity: "invite",
        entityId: row.email,
        diff: { email: row.email, role: row.role },
      });
    });
    return null;
  },
);
