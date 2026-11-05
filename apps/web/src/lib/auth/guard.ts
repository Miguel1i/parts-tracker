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
 * An expected failure the caller can act on. `code` is a key under `Errors` in the messages,
 * so the client shows it translated; anything else becomes `generic`. `meta` carries values
 * for the message (e.g. `retryAfterSec`).
 */
export class ActionError extends Error {
  constructor(
    readonly code: ActionErrorCode,
    readonly meta?: Record<string, string | number>,
  ) {
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
  | "dispatchFailed"
  | "rateLimited"
  | "unknownMerchant"
  | "badUrl"
  | "wrongPassword"
  | "emailTaken"
  | "usernameTaken"
  | "lastAdmin"
  | "alreadyReported"
  | "nothingToCheck"
  | "importEmpty";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ActionErrorCode; meta?: Record<string, string | number> };

type Handler<S extends z.ZodType, R, C> = (input: z.infer<S>, ctx: C) => Promise<R>;

/**
 * Re-checks the session on every call (a Server Action is a public POST endpoint, whatever
 * the UI shows) and throws before reading the input when the caller lacks `need`. Invalid
 * input returns `{ ok: false }` instead of throwing, so forms can show it.
 */
function guardedAction<S extends z.ZodType, R>(
  need: "user" | "admin",
  schema: S,
  handler: Handler<S, R, { actor: SessionUser; isAdmin: boolean }>,
): (input: z.input<S>) => Promise<ActionResult<R>> {
  return async (input) => {
    const session = await getSession();
    if (evaluateAccess(session?.user, need) !== "ok") throw new ForbiddenError();
    const actor = session!.user;
    const parsed = schema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid" };
    try {
      const isAdmin = evaluateAccess(actor, "admin") === "ok";
      return { ok: true, data: await handler(parsed.data, { actor, isAdmin }) };
    } catch (e) {
      if (e instanceof ForbiddenError) throw e;
      if (e instanceof ActionError) {
        return { ok: false, error: e.code, ...(e.meta ? { meta: e.meta } : {}) };
      }
      // Unexpected (DB, network...): log it, but keep internals out of the browser.
      console.error(`[${need} action]`, e);
      return { ok: false, error: "generic" };
    }
  };
}

/** The only way to build an admin Server Action: active, unbanned admins only. */
export function adminAction<S extends z.ZodType, R>(
  schema: S,
  handler: Handler<S, R, { actor: SessionUser }>,
): (input: z.input<S>) => Promise<ActionResult<R>> {
  return guardedAction("admin", schema, handler);
}

/**
 * The only way to build a signed-in user's Server Action: active, unbanned users. The handler
 * still has to check ownership of whatever it touches (see lib/builds/access.ts).
 */
export function userAction<S extends z.ZodType, R>(
  schema: S,
  handler: Handler<S, R, { actor: SessionUser; isAdmin: boolean }>,
): (input: z.input<S>) => Promise<ActionResult<R>> {
  return guardedAction("user", schema, handler);
}
