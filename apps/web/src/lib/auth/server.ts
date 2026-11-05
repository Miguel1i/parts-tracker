import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { admin, username } from "better-auth/plugins";
import { account, appSettings, getDb, invites, session, user, verification } from "@parts/db";
import { and, eq, gt, isNull, ne } from "@parts/db/orm";
import { linkEmail, sendEmail } from "@/lib/email";
import { siteUrl } from "@/lib/site-url";
import { decideSignup, normalizeEmail, usableInvite } from "./signup";

/** Reads the invite token a sign-up request carries (`inviteToken` in the JSON body). */
function inviteTokenOf(ctx: { body?: unknown } | null | undefined): string | undefined {
  const body = ctx?.body;
  if (!body || typeof body !== "object") return undefined;
  const token = (body as Record<string, unknown>).inviteToken;
  return typeof token === "string" && token.length > 0 && token.length <= 200 ? token : undefined;
}

async function signupContext(email: string, token: string | undefined) {
  const db = getDb();
  const [settings] = await db.select().from(appSettings).where(eq(appSettings.id, 1));
  const rows = token
    ? await db
        .select()
        .from(invites)
        .where(
          and(eq(invites.token, token), isNull(invites.usedAt), gt(invites.expiresAt, new Date())),
        )
    : [];
  return {
    mode: settings?.signupMode ?? "approval",
    invite: usableInvite(rows, email, token),
  };
}

/** How long a password-reset link stays valid (long enough for an admin to pass it on). */
export const RESET_TOKEN_HOURS = 24;

export const auth = betterAuth({
  appName: "Parts Tracker",
  baseURL: siteUrl(),
  database: drizzleAdapter(getDb(), {
    provider: "sqlite",
    schema: { user, session, account, verification },
  }),
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 60 },
  },
  // Email (or username) and password. There's no email service, so addresses aren't verified:
  // invites are redeemed by their secret token, and approval mode has an admin vet each account.
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    autoSignIn: true,
    // Forgotten passwords: Better Auth stores a one-time token (verification row
    // `reset-password:<token>`). With Resend configured the link is emailed; either way the
    // request shows on /admin/users, where an admin can copy the link and pass it on.
    resetPasswordTokenExpiresIn: RESET_TOKEN_HOURS * 60 * 60,
    revokeSessionsOnPasswordReset: true,
    async sendResetPassword({ user: u, url }) {
      try {
        await sendEmail({
          to: u.email,
          subject: "Reset your Parts Tracker password",
          ...linkEmail({
            heading: "Reset your password",
            body: "Someone asked to reset the password of your Parts Tracker account. If it wasn't you, ignore this email.",
            cta: "Choose a new password",
            url,
            footer: `The link works once and expires in ${RESET_TOKEN_HOURS} hours.`,
          }),
        });
      } catch (e) {
        console.error("[reset email]", e);
      }
    },
  },
  user: {
    // Account deletion from /account; Better Auth asks for the password. Builds, preferences and
    // sessions cascade; the shared catalog stays (products.created_by is set to null).
    deleteUser: {
      enabled: true,
      async beforeDelete(deleted) {
        const u = deleted as typeof deleted & { role?: string };
        if (u.role !== "admin") return;
        const others = await getDb().$count(
          user,
          and(eq(user.role, "admin"), eq(user.status, "active"), ne(user.id, u.id)),
        );
        if (others === 0)
          throw new APIError("BAD_REQUEST", { message: "lastAdmin", code: "LAST_ADMIN" });
      },
    },
    additionalFields: {
      // Set only by the signup hook and admins, never from client input.
      status: { type: "string", input: false, required: false, defaultValue: "pending" },
    },
    async validateUserInfo({ user: info, source }, ctx) {
      if (source.action !== "create-user" || source.method === "admin") return;
      if (typeof info.email !== "string") return { error: "invite_required" };
      const { mode, invite } = await signupContext(info.email, inviteTokenOf(ctx));
      const decision = decideSignup({ mode, invite });
      if (!decision.ok) return { error: decision.error, message: "An invite is required" };
    },
  },
  databaseHooks: {
    user: {
      create: {
        async before(data, ctx) {
          const token = inviteTokenOf(ctx);
          const { mode, invite } = await signupContext(data.email, token);
          const decision = decideSignup({
            mode,
            invite,
            createdByAdmin: ctx?.path === "/admin/create-user",
          });
          if (!decision.ok) return false;
          const email = normalizeEmail(data.email);
          return {
            data: {
              ...data,
              name: data.name?.trim() || email.split("@")[0],
              email,
              status: decision.status,
              role: decision.role,
            },
          };
        },
        async after(created, ctx) {
          const token = inviteTokenOf(ctx);
          if (!token) return;
          const { invite } = await signupContext(created.email, token);
          if (invite) {
            await getDb()
              .update(invites)
              .set({ usedAt: new Date() })
              .where(eq(invites.id, invite.id));
          }
        },
      },
    },
  },
  hooks: {
    // Avatars are initials only: nobody sets an image URL (it would be loaded by every viewer).
    before: createAuthMiddleware(async (ctx) => {
      if (
        ctx.path === "/update-user" &&
        ctx.body &&
        typeof ctx.body === "object" &&
        "image" in ctx.body
      ) {
        throw new APIError("BAD_REQUEST", { message: "image is not allowed" });
      }
    }),
  },
  plugins: [
    admin({ defaultRole: "user", adminRoles: ["admin"] }),
    // Sign in with the username or the email; usernames are 3-30 of a-z, 0-9, _ and .
    username({ minUsernameLength: 3, maxUsernameLength: 30 }),
    nextCookies(),
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
export type SessionUser = AuthSession["user"];
