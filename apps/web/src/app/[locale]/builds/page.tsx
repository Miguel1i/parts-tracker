import { getDb } from "@parts/db";
import { Globe } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { EmptyState, PageHeader } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { initLocale } from "@/i18n/server";
import { requireUser } from "@/lib/auth/guard";
import { listBuilds, priceWithShipping } from "@/lib/builds/queries";
import { loadBuildSparks } from "@/lib/charts/dashboard";
import { Sparkline, sparkLabel } from "@/components/charts/dash-sparkline";
import { BuildMenu, CreateBuildButton } from "./build-menu";
import { kicker } from "@/lib/kicker";

// Reads the session at the top level: render on request.
export const instant = false;

export async function generateMetadata() {
  await initLocale();
  const t = await getTranslations("Builds");
  return { title: t("title") };
}

export default async function BuildsPage() {
  await initLocale();
  const user = await requireUser();
  const t = await getTranslations("Builds");
  const format = await getFormatter();
  const db = getDb();
  const list = await listBuilds(db, user.id);
  const ts = await getTranslations("Charts.spark");
  const sparks = await loadBuildSparks(
    db,
    user.id,
    list.map((b) => b.id),
    await priceWithShipping(db, user.id),
  );

  return (
    <>
      <PageHeader
        kicker={await kicker("builds")}
        title={t("title")}
        description={t("description")}
        actions={<CreateBuildButton />}
      />

      {list.length === 0 ? (
        <EmptyState kicker={t("empty.title")} title={t("empty.title")}>
          {t("empty.body")}
        </EmptyState>
      ) : (
        // A ruled list, like lines on a receipt: name and tags, the total, its 30-day trend.
        <ul className="bg-card divide-y rounded-[6px] border">
          {list.map((b) => (
            <li
              key={b.id}
              className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 px-4 py-4 sm:grid-cols-[1fr_auto_auto_auto] sm:px-5"
            >
              <div className="min-w-0">
                <Link
                  href={`/builds/${b.id}`}
                  className="break-words text-base font-semibold underline-offset-4 hover:underline"
                >
                  {b.name}
                </Link>
                <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-2 text-sm">
                  <span>{t("count", { count: b.itemCount })}</span>
                  {b.isPublic && (
                    <Badge variant="secondary">
                      <Globe className="size-3" />
                      {t("public")}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="text-right sm:order-none">
                <p className="font-mono text-xl font-semibold tabular-nums">
                  {format.number(b.total, "price")}
                </p>
                {b.missingPrice > 0 && (
                  <p className="text-muted-foreground text-xs">
                    {t("missing", { count: b.missingPrice })}
                  </p>
                )}
              </div>
              <div className="hidden sm:block">
                <Sparkline
                  values={sparks[b.id] ?? []}
                  label={`${b.name}. ${sparkLabel(ts, sparks[b.id] ?? [])}`}
                />
              </div>
              <div className="col-start-2 row-start-1 justify-self-end sm:col-start-auto sm:row-start-auto">
                <BuildMenu buildId={b.id} name={b.name} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
