import { getDb } from "@parts/db";
import { ChevronLeft, Globe, PackageOpen } from "lucide-react";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { initLocale } from "@/i18n/server";
import { requireUser } from "@/lib/auth/guard";
import { getBuildView, merchantOptions } from "@/lib/builds/queries";
import { loadBuildCharts } from "@/lib/charts/dashboard";
import { BuildTotalChartLazy } from "@/components/charts/dash-build-chart-lazy";
import { BuildMenu } from "../build-menu";
import { AddPanel } from "./add-panel";
import { CheckButton } from "./check-button";
import { ItemsTable } from "./items-table";
import { SharePanel } from "./share-panel";

// Reads the session at the top level: render on request.
export const instant = false;

export default async function BuildPage({ params }: { params: Promise<{ id: string }> }) {
  await initLocale();
  const user = await requireUser();
  const { id } = await params;
  const db = getDb();
  const build = await getBuildView(db, id, user.id);
  if (!build) notFound();
  const merchants = await merchantOptions(db);
  const { chart, sparks } = await loadBuildCharts(db, user.id, id, build.withShipping);
  const t = await getTranslations("Builds");
  const format = await getFormatter();

  return (
    <>
      <Link
        href="/builds"
        className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {t("back")}
      </Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="break-words text-2xl font-semibold tracking-tight sm:text-3xl">
              {build.name}
            </h1>
            <BuildMenu buildId={build.id} name={build.name} redirectOnDelete />
          </div>
          <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-2 text-sm">
            <span>{t("count", { count: build.items.length })}</span>
            {build.isPublic && (
              <Badge variant="secondary">
                <Globe className="size-3" />
                {t("public")}
              </Badge>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="text-3xl font-semibold tabular-nums">
            {format.number(build.total, "price")}
          </p>
          <p className="text-muted-foreground text-xs">
            {build.withShipping ? t("detail.withShipping") : t("detail.withoutShipping")}
            {build.missingPrice > 0 && ` · ${t("missing", { count: build.missingPrice })}`}
          </p>
        </div>
      </div>

      <div className="grid gap-6">
        <CheckButton buildId={build.id} />
        {build.items.length === 0 ? (
          <EmptyState icon={PackageOpen} title={t("detail.empty.title")}>
            {t("detail.empty.body")}
          </EmptyState>
        ) : (
          <ItemsTable
            buildId={build.id}
            items={build.items}
            merchants={merchants}
            total={build.total}
            missingPrice={build.missingPrice}
            sparks={sparks}
          />
        )}
        {build.items.length > 0 && (
          <div className="rounded-xl border p-4">
            <BuildTotalChartLazy data={chart} />
          </div>
        )}
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <AddPanel buildId={build.id} />
          <SharePanel buildId={build.id} isPublic={build.isPublic} shareToken={build.shareToken} />
        </div>
      </div>
    </>
  );
}
