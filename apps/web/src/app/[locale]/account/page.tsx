import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { builds, getDb, merchants, user, userMerchants, userPreferences } from "@parts/db";
import { and, asc, eq } from "@parts/db/orm";
import { PageHeader } from "@/components/empty-state";
import { routing } from "@/i18n/routing";
import { initLocale } from "@/i18n/server";
import { requireUser } from "@/lib/auth/guard";
import { EmailSection } from "./email-section";
import { PasswordSection } from "./password-section";
import { PreferencesSection } from "./preferences-section";
import { PrivacySection } from "./privacy-section";
import { ProfileSection } from "./profile-section";
import { SessionsSection } from "./sessions-section";
import { kicker } from "@/lib/kicker";

// Reads the session at the top level, so it renders on request.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const locale = (await initLocale()) ?? routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: "Account.settings" });
  return { title: t("title"), robots: { index: false } };
}

export default async function AccountPage() {
  await initLocale();
  const actor = await requireUser();
  const t = await getTranslations("Account.settings");
  const db = getDb();

  const [[row], [prefs], ownBuilds, visible, choices] = await Promise.all([
    db
      .select({
        name: user.name,
        email: user.email,
        username: user.username,
        displayUsername: user.displayUsername,
      })
      .from(user)
      .where(eq(user.id, actor.id)),
    db.select().from(userPreferences).where(eq(userPreferences.userId, actor.id)),
    db
      .select({ id: builds.id, name: builds.name })
      .from(builds)
      .where(eq(builds.userId, actor.id))
      .orderBy(asc(builds.name)),
    db
      .select({ id: merchants.id, name: merchants.name })
      .from(merchants)
      .where(and(eq(merchants.enabled, true), eq(merchants.visibleToUsers, true)))
      .orderBy(asc(merchants.sortOrder), asc(merchants.name)),
    db.select().from(userMerchants).where(eq(userMerchants.userId, actor.id)),
  ]);
  const disabled = new Set(choices.filter((c) => !c.enabled).map((c) => c.merchantId));

  return (
    <div className="max-w-5xl">
      <PageHeader
        kicker={await kicker("account")}
        title={t("title")}
        description={t("description")}
      />
      {/* Settings layout (globals.css .settings-sections): title + explanation on the left,
          the form panel on the right, sections separated by rules; one column on phones. */}
      <div className="settings-sections">
        <ProfileSection
          name={row?.name ?? actor.name}
          username={row?.displayUsername ?? row?.username ?? ""}
          email={row?.email ?? actor.email}
        />
        <EmailSection email={row?.email ?? actor.email} />
        <PasswordSection />
        <SessionsSection />
        <PreferencesSection
          preferences={{
            locale: prefs?.locale ?? null,
            theme: prefs?.theme ?? null,
            defaultBuildId: prefs?.defaultBuildId ?? null,
            priceWithShipping: prefs?.priceWithShipping ?? true,
          }}
          builds={ownBuilds}
          merchants={visible.map((m) => ({ ...m, enabled: !disabled.has(m.id) }))}
        />
        <PrivacySection />
      </div>
    </div>
  );
}
