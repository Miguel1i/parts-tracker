import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
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
    <div className="mx-auto w-full max-w-[25rem] py-4 sm:py-10">
      <Logo className="mb-8" />
      <h1 className="text-[30px] font-extrabold leading-[1.08] tracking-[-0.02em]">{t("title")}</h1>
      <p className="text-muted-foreground mt-2 text-[15px] leading-6">{t("description")}</p>
      <div className="bg-card text-card-foreground mt-6 rounded-[6px] border p-5 sm:p-6">
        {/* The form reads ?next, ?invite and ?email, so it streams in behind a boundary. */}
        <Suspense fallback={<Skeleton className="h-48 w-full" />}>
          <SignInForm />
        </Suspense>
      </div>
    </div>
  );
}
