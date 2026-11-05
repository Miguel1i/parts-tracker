import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { initLocale } from "@/i18n/server";
import { DashboardBody } from "./dashboard-body";

// No session read here: the shell is static and DashboardBody streams in.
export default async function DashboardPage() {
  await initLocale();
  const t = await getTranslations("Dashboard");

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <Suspense
        fallback={
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-28" />
              ))}
            </div>
            <Skeleton className="h-96" />
          </div>
        }
      >
        <DashboardBody />
      </Suspense>
    </>
  );
}
