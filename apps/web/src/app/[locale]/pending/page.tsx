import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/logo";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { initLocale } from "@/i18n/server";
import { evaluateAccess } from "@/lib/auth/access";
import { getSession } from "@/lib/auth/guard";
import { PendingActions } from "./pending-actions";

// Reads the session up front to redirect away (signed out → sign-in, approved → home).
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const locale = (await initLocale()) ?? routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: "Auth.pending" });
  return { title: t("title"), robots: { index: false } };
}

export default async function PendingPage() {
  const locale = (await initLocale()) ?? routing.defaultLocale;
  const session = await getSession();
  const access = evaluateAccess(session?.user, "user");
  if (access === "ok") redirect({ href: "/", locale });
  if (access !== "pending") redirect({ href: "/sign-in", locale });
  const t = await getTranslations("Auth.pending");

  return (
    <div className="mx-auto w-full max-w-[28rem] py-4 sm:py-10">
      <Logo className="mb-8" />
      <div className="bg-card text-card-foreground rounded-[6px] border border-dashed p-6 sm:p-8">
        <h1 className="text-[30px] font-extrabold leading-[1.08] tracking-[-0.02em]">
          {t("title")}
        </h1>
        <p className="text-muted-foreground mt-3 text-[15px] leading-6">
          {t("body", { email: session!.user.email })}
        </p>
        <PendingActions />
      </div>
    </div>
  );
}
