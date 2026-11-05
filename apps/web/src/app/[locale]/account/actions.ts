"use server";

import { headers } from "next/headers";
import { z } from "zod";
import {
  builds,
  buildItems,
  getDb,
  merchants,
  products,
  themes,
  user,
  userMerchants,
  userPreferences,
} from "@parts/db";
import { and, asc, eq, inArray } from "@parts/db/orm";
import { routing } from "@/i18n/routing";
import { ActionError, userAction } from "@/lib/auth/guard";
import { auth } from "@/lib/auth/server";
import { normalizeEmail } from "@/lib/auth/signup";

/*
 * Every export is built with userAction (re-checks the session on each call) and only touches
 * the actor's own rows. Password changes, session revocation and account deletion run in the
 * browser through Better Auth's client (see the section components).
 */

const USERNAME = /^[a-z0-9_.]{3,30}$/i;

function errorCode(e: unknown): string {
  if (e && typeof e === "object") {
    const o = e as { body?: { code?: string }; code?: string };
    return o.body?.code ?? o.code ?? "";
  }
  return "";
}

export const updateProfile = userAction(
  z.object({
    name: z.string().trim().min(1).max(100),
    username: z.string().trim().regex(USERNAME),
  }),
  async ({ name, username }) => {
    try {
      await auth.api.updateUser({ body: { name, username }, headers: await headers() });
    } catch (e) {
      if (/USERNAME/.test(errorCode(e))) {
        throw new ActionError(
          /TAKEN|EXISTS|ALREADY/.test(errorCode(e)) ? "usernameTaken" : "invalid",
        );
      }
      throw e;
    }
    return { name, username };
  },
);

export const changeEmail = userAction(
  z.object({
    newEmail: z.string().trim().email().max(254),
    currentPassword: z.string().min(1).max(128),
  }),
  async ({ newEmail, currentPassword }, { actor }) => {
    try {
      await auth.api.verifyPassword({
        body: { password: currentPassword },
        headers: await headers(),
      });
    } catch {
      throw new ActionError("wrongPassword");
    }
    const email = normalizeEmail(newEmail);
    const db = getDb();
    const [taken] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
    if (taken && taken.id !== actor.id) throw new ActionError("emailTaken");
    await db
      .update(user)
      .set({ email, emailVerified: false, updatedAt: new Date() })
      .where(eq(user.id, actor.id));
    return { email };
  },
);

export const savePreferences = userAction(
  z.object({
    locale: z.enum(routing.locales),
    theme: z.enum(themes),
    defaultBuildId: z.string().min(1).nullable(),
    priceWithShipping: z.boolean(),
  }),
  async ({ locale, theme, defaultBuildId, priceWithShipping }, { actor }) => {
    const db = getDb();
    if (defaultBuildId) {
      const [own] = await db
        .select({ id: builds.id })
        .from(builds)
        .where(and(eq(builds.id, defaultBuildId), eq(builds.userId, actor.id)));
      if (!own) throw new ActionError("notFound");
    }
    const values = { locale, theme, defaultBuildId, priceWithShipping, updatedAt: new Date() };
    await db
      .insert(userPreferences)
      .values({ userId: actor.id, ...values })
      .onConflictDoUpdate({ target: userPreferences.userId, set: values });
    return { locale, theme };
  },
);

export const setMerchants = userAction(
  z.object({ enabledMerchantIds: z.array(z.string().min(1)).max(500) }),
  async ({ enabledMerchantIds }, { actor }) => {
    const db = getDb();
    const visible = await db
      .select({ id: merchants.id })
      .from(merchants)
      .where(and(eq(merchants.enabled, true), eq(merchants.visibleToUsers, true)));
    const on = new Set(enabledMerchantIds);
    const rows = visible.map((m) => ({
      userId: actor.id,
      merchantId: m.id,
      enabled: on.has(m.id),
    }));
    await db.transaction(async (tx) => {
      // Rewrite this user's rows for the merchants they can see.
      if (rows.length > 0) {
        await tx.delete(userMerchants).where(
          and(
            eq(userMerchants.userId, actor.id),
            inArray(
              userMerchants.merchantId,
              rows.map((r) => r.merchantId),
            ),
          ),
        );
        await tx.insert(userMerchants).values(rows);
      }
    });
    return { enabled: rows.filter((r) => r.enabled).length };
  },
);

export const exportMyData = userAction(z.object({}), async (_input, { actor }) => {
  const db = getDb();
  const [profile] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      username: user.username,
      displayUsername: user.displayUsername,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(eq(user.id, actor.id));
  const [preferences] = await db
    .select({
      locale: userPreferences.locale,
      theme: userPreferences.theme,
      defaultBuildId: userPreferences.defaultBuildId,
      priceWithShipping: userPreferences.priceWithShipping,
    })
    .from(userPreferences)
    .where(eq(userPreferences.userId, actor.id));
  const merchantChoices = await db
    .select({ merchant: merchants.name, enabled: userMerchants.enabled })
    .from(userMerchants)
    .innerJoin(merchants, eq(merchants.id, userMerchants.merchantId))
    .where(eq(userMerchants.userId, actor.id));
  const ownBuilds = await db
    .select()
    .from(builds)
    .where(eq(builds.userId, actor.id))
    .orderBy(asc(builds.createdAt));
  const ids = ownBuilds.map((b) => b.id);
  const items = ids.length
    ? await db
        .select({
          buildId: buildItems.buildId,
          product: products.name,
          quantity: buildItems.quantity,
          boughtAt: buildItems.boughtAt,
          boughtPrice: buildItems.boughtPrice,
          boughtMerchant: merchants.name,
        })
        .from(buildItems)
        .innerJoin(products, eq(products.id, buildItems.productId))
        .leftJoin(merchants, eq(merchants.id, buildItems.boughtMerchantId))
        .where(inArray(buildItems.buildId, ids))
        .orderBy(asc(buildItems.sortOrder))
    : [];
  return {
    exportedAt: new Date().toISOString(),
    profile,
    preferences: preferences ?? null,
    merchants: merchantChoices,
    builds: ownBuilds.map((b) => ({
      name: b.name,
      notes: b.notes,
      isPublic: b.isPublic,
      createdAt: b.createdAt,
      items: items.filter((i) => i.buildId === b.id).map((i) => ({ ...i, buildId: undefined })),
    })),
  };
});
