import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth-card";
import { Skeleton } from "@/components/ui/skeleton";
import { routing } from "@/i18n/routing";
import { initLocale } from "@/i18n/server";
import { SignInForm } from "./sign-in-form";

export async function generateMetadata(): Promise<Metadata> {
  const locale = (await initLocale()) ?? routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: "Auth.signIn" });
  return { title: t("title"), robots: { index: false } };
}

export default async function SignInPage() {
  await initLocale();
  const t = await getTranslations("Auth.signIn");

  return (
    <AuthCard title={t("title")} description={t("description")}>
      {/* The form reads ?next, ?invite and ?email, so it streams in behind a boundary. */}
      <Suspense fallback={<Skeleton className="h-48 w-full" />}>
        <SignInForm />
      </Suspense>
    </AuthCard>
  );
}
