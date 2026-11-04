import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin, magicLink } from "better-auth/plugins";
import { and, eq, gt, isNull } from "@parts/db/orm";
import { getTranslations } from "next-intl/server";
import { account, appSettings, getDb, invites, session, user, verification } from "@parts/db";
import { routing, type Locale } from "@/i18n/routing";
import { linkEmail, sendEmail } from "@/lib/email";
import { enabledProviders } from "./providers";
import { decideSignup, normalizeEmail, usableInvite } from "./signup";

async function signupContext(email: string) {
  const db = getDb();
  const [settings] = await db.select().from(appSettings).where(eq(appSettings.id, 1));
  const rows = await db
    .select()
    .from(invites)
    .where(
      and(
        eq(invites.email, normalizeEmail(email)),
        isNull(invites.usedAt),
        gt(invites.expiresAt, new Date()),
      ),
    );
  return { mode: settings?.signupMode ?? "approval", invite: usableInvite(rows, email) };
}

/** The locale of a callback URL like `/pt/admin`, for the email copy. */
function localeOf(url: string): Locale {
  try {
    const path = new URL(url).searchParams.get("callbackURL") ?? "";
    return path.startsWith("/pt") ? "pt-PT" : routing.defaultLocale;
  } catch {
    return routing.defaultLocale;
  }
}

const providers = enabledProviders();

export const auth = betterAuth({
  appName: "Parts Tracker",
  database: drizzleAdapter(getDb(), {
    provider: "sqlite",
    schema: { user, session, account, verification },
  }),
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 60 },
  },
  user: {
    additionalFields: {
      // Set only by the signup hook and admins, never from client input.
      status: { type: "string", input: false, required: false, defaultValue: "pending" },
    },
    async validateUserInfo({ user: info, source }) {
      if (source.action !== "create-user" || source.method === "admin") return;
      if (typeof info.email !== "string") return { error: "invite_required" };
      const { mode, invite } = await signupContext(info.email);
      const decision = decideSignup({ mode, invite });
      if (!decision.ok) return { error: decision.error, message: "An invite is required" };
    },
  },
  account: {
    // Google always returns verified emails, so its logins link to an existing account by email.
    // GitHub links only when Better Auth sees the address as verified.
    accountLinking: { enabled: true, trustedProviders: ["google"] },
  },
  socialProviders: {
    ...(providers.github && {
      github: {
        clientId: process.env.GITHUB_CLIENT_ID!,
        clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      },
    }),
    ...(providers.google && {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      },
    }),
  },
  databaseHooks: {
    user: {
      create: {
        async before(data, ctx) {
          const { mode, invite } = await signupContext(data.email);
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
              // Magic-link sign-ups arrive without a name; start from the email's local part.
              name: data.name?.trim() || email.split("@")[0],
              email,
              status: decision.status,
              role: decision.role,
            },
          };
        },
        async after(created) {
          const { invite } = await signupContext(created.email);
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
  plugins: [
    admin({ defaultRole: "user", adminRoles: ["admin"] }),
    magicLink({
      expiresIn: 60 * 15,
      async sendMagicLink({ email, url }) {
        const t = await getTranslations({ locale: localeOf(url), namespace: "Email.magicLink" });
        await sendEmail({
          to: email,
          subject: t("subject"),
          ...linkEmail({
            heading: t("heading"),
            body: t("body"),
            cta: t("cta"),
            url,
            footer: t("footer"),
          }),
        });
      },
    }),
    nextCookies(),
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
export type SessionUser = AuthSession["user"];
