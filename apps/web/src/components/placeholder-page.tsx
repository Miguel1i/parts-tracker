import type { LucideIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { EmptyState, PageHeader } from "@/components/empty-state";
import { routing } from "@/i18n/routing";
import { initLocale } from "@/i18n/server";

type Section = "Compare" | "Builds" | "Admin";

/** Header + empty state for sections that land in later milestones. */
export async function PlaceholderPage({ section, icon }: { section: Section; icon: LucideIcon }) {
  await initLocale();
  const t = await getTranslations(section);
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <EmptyState icon={icon} title={t("empty.title")}>
        {t("empty.body")}
      </EmptyState>
    </>
  );
}

export async function placeholderMetadata(section: Section) {
  const locale = (await initLocale()) ?? routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: section });
  return { title: t("title") };
}
