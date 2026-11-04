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
  return auth.api.getSession({ headers: await headers() });
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

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

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
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    try {
      return { ok: true, data: await handler(parsed.data, { actor: session!.user }) };
    } catch (e) {
      if (e instanceof ForbiddenError) throw e;
      console.error("[admin action]", e);
      return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
    }
  };
}
