import { Clock } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/empty-state";
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
    <EmptyState icon={Clock} title={t("title")}>
      <p>{t("body", { email: session!.user.email })}</p>
      <PendingActions />
    </EmptyState>
  );
}
