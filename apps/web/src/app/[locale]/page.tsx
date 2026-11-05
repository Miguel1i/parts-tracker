import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { initLocale } from "@/i18n/server";
import { DashboardBody } from "./dashboard-body";

/*
 * No session read here: the shell is static and DashboardBody streams in — the landing page
 * when signed out, the dashboard (with its own PageHeader) when signed in. The fallback is
 * deliberately neutral so neither flashes the other's layout.
 */
export default async function HomePage() {
  await initLocale();

  return (
    <Suspense
      fallback={
        <div className="grid gap-6" aria-hidden>
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-12 w-full max-w-lg" />
          <Skeleton className="h-4 w-full max-w-md" />
          <Skeleton className="mt-6 h-80" />
        </div>
      }
    >
      <DashboardBody />
    </Suspense>
  );
}
