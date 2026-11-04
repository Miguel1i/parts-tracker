import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { routing } from "@/i18n/routing";
import { initLocale } from "@/i18n/server";
import { enabledProviders } from "@/lib/auth/server";
import { SignInForm } from "./sign-in-form";

export async function generateMetadata(): Promise<Metadata> {
  const locale = (await initLocale()) ?? routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: "Auth.signIn" });
  return { title: t("title"), robots: { index: false } };
}

export default async function SignInPage() {
  await initLocale();
  const t = await getTranslations("Auth.signIn");
  const providers = enabledProviders();

  return (
    <div className="mx-auto w-full max-w-sm py-6 sm:py-12">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          {/* The form reads ?next, ?invite and ?error, so it streams in behind a boundary. */}
          <Suspense fallback={<Skeleton className="h-48 w-full" />}>
            <SignInForm providers={providers} />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
