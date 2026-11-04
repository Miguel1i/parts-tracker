import "server-only";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import type { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { initLocale } from "@/i18n/server";
import { routing } from "@/i18n/routing";
import { evaluateAccess } from "./access";
import { auth, type AuthSession, type SessionUser } from "./server";

/** The current session (one lookup per request). */
export const getSession = cache(async (): Promise<AuthSession | null> => {
  // Skip the 60 s session cookie cache: role, status and bans must be current for the guards
  // (a demoted or banned admin would otherwise keep admin rights until the cookie expires).
  return auth.api.getSession({
    headers: await headers(),
    query: { disableCookieCache: true },
  });
});

/**
 * For admin pages and layouts. Anyone who isn't an active admin gets a 404, so the admin
 * area's existence isn't revealed.
 */
export async function requireAdmin(): Promise<SessionUser> {
  const session = await getSession();
  if (evaluateAccess(session?.user, "admin") !== "ok") notFound();
  return session!.user;
}

/** For signed-in pages: anonymous → sign-in, pending → the waiting page, banned → sign-in. */
export async function requireUser(): Promise<SessionUser> {
  const session = await getSession();
  const result = evaluateAccess(session?.user, "user");
  if (result === "ok") return session!.user;
  const locale = (await initLocale()) ?? routing.defaultLocale;
  if (result === "pending") redirect({ href: "/pending", locale });
  redirect({ href: "/sign-in", locale });
  throw new Error("unreachable");
}

/** Page metadata (titles) only for active admins; everyone else gets the app defaults. */
export async function adminMetadata(build: () => Promise<Metadata>): Promise<Metadata> {
  const session = await getSession();
  if (evaluateAccess(session?.user, "admin") !== "ok") return { robots: { index: false } };
  return build();
}

export class ForbiddenError extends Error {
  constructor() {
    super("Forbidden");
    this.name = "ForbiddenError";
  }
}

/**
 * An expected failure an admin can act on. `code` is a key under `Admin.errors` in the
 * messages, so the client shows it translated; anything else becomes `generic`.
 */
export class ActionError extends Error {
  constructor(readonly code: ActionErrorCode) {
    super(code);
    this.name = "ActionError";
  }
}

export type ActionErrorCode =
  | "generic"
  | "invalid"
  | "notFound"
  | "self"
  | "emailMismatch"
  | "userExists"
  | "slugTaken"
  | "nameTaken"
  | "duplicate"
  | "invalidAdapter"
  | "hasHistory"
  | "alreadyDecided"
  | "dispatchFailed";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionErrorCode };

/**
 * The only way to build an admin Server Action. It re-checks the session on every call
 * (a Server Action is a public POST endpoint, whatever the UI shows) and throws before
 * reading the input when the caller isn't an active admin. Invalid input returns
 * `{ ok: false }` instead of throwing, so forms can show it.
 */
export function adminAction<S extends z.ZodType, R>(
  schema: S,
  handler: (input: z.infer<S>, ctx: { actor: SessionUser }) => Promise<R>,
): (input: z.input<S>) => Promise<ActionResult<R>> {
  return async (input) => {
    const session = await getSession();
    if (evaluateAccess(session?.user, "admin") !== "ok") throw new ForbiddenError();
    const parsed = schema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid" };
    try {
      return { ok: true, data: await handler(parsed.data, { actor: session!.user }) };
    } catch (e) {
      if (e instanceof ForbiddenError) throw e;
      if (e instanceof ActionError) return { ok: false, error: e.code };
      // Unexpected (DB, network...): log it, but keep internals out of the browser.
      console.error("[admin action]", e);
      return { ok: false, error: "generic" };
    }
  };
}
