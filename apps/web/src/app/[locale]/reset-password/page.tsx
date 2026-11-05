import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth-card";
import { Skeleton } from "@/components/ui/skeleton";
import { routing } from "@/i18n/routing";
import { initLocale } from "@/i18n/server";
import { ResetForm } from "./reset-form";

export async function generateMetadata(): Promise<Metadata> {
  const locale = (await initLocale()) ?? routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: "Auth.reset" });
  // The token is in the URL: don't leak it to other sites through the Referer header.
  return { title: t("title"), robots: { index: false }, referrer: "no-referrer" };
}

export default async function ResetPasswordPage() {
  await initLocale();
  const t = await getTranslations("Auth.reset");
  return (
    <AuthCard title={t("title")} description={t("description")}>
      {/* Reads ?token, so it streams in behind a boundary. */}
      <Suspense fallback={<Skeleton className="h-40 w-full" />}>
        <ResetForm />
      </Suspense>
    </AuthCard>
  );
}
