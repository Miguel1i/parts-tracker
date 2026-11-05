import { getDb } from "@parts/db";
import { PackageOpen } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { BuildTotalChartLazy, MoversChartLazy } from "@/components/charts/dash-build-chart-lazy";
import { Sparkline, sparkLabel } from "@/components/charts/dash-sparkline";
import { EmptyState, PageHeader } from "@/components/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { getSession, requireUser } from "@/lib/auth/guard";
import { loadDashboard } from "@/lib/charts/dashboard";
import { CheckButton } from "./builds/[id]/check-button";
import { Landing } from "./landing";
import { kicker } from "@/lib/kicker";

export async function DashboardBody() {
  const session = await getSession();
  if (!session) return <Landing />;
  const user = await requireUser();
  return <SignedIn userId={user.id} />;
}

async function SignedIn({ userId }: { userId: string }) {
  const t = await getTranslations("Dashboard");
  const ts = await getTranslations("Charts.spark");
  const format = await getFormatter();
  const d = await loadDashboard(getDb(), userId);
  const header = (
    <PageHeader
      kicker={await kicker("dashboard")}
      title={t("title")}
      description={t("description")}
    />
  );

  if (!d.build) {
    return (
      <>
        {header}
        <EmptyState icon={PackageOpen} title={t("noBuild.title")}>
          <p>{t("noBuild.body")}</p>
          <Link href="/builds" className={buttonVariants({ className: "mt-4" })}>
            {t("noBuild.cta")}
          </Link>
        </EmptyState>
      </>
    );
  }

  const runStatus = d.lastRun ? t(`runStatus.${d.lastRun.status}` as "runStatus.queued") : null;

  return (
    <>
      {header}
      <div className="grid gap-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted-foreground text-sm">
            {t("buildLabel")}{" "}
            <Link
              href={`/builds/${d.build.id}`}
              className="text-foreground font-medium hover:underline"
            >
              {d.build.name}
            </Link>
          </p>
          <CheckButton buildId={d.build.id} label={t("checkAll")} />
        </div>

        {/* One ruled strip of figures (hairlines between cells), not four floating cards. */}
        <div className="bg-border grid grid-cols-2 gap-px overflow-hidden rounded-[6px] border lg:grid-cols-4">
          <Tile title={t("kpi.buildTotal")}>
            <p className="font-mono text-[26px] font-semibold tabular-nums leading-none">
              {format.number(d.total, "price")}
            </p>
            <p className="text-muted-foreground text-xs">
              {d.withShipping ? t("withShipping") : t("withoutShipping")}
              {d.missing > 0 && ` · ${t("missing", { count: d.missing })}`}
            </p>
            {d.totalSpark.length > 1 && (
              <Sparkline
                values={d.totalSpark}
                label={`${t("kpi.buildTotal")}. ${sparkLabel(ts, d.totalSpark)}`}
              />
            )}
          </Tile>
          <Tile title={t("kpi.savings")}>
            <p className="font-mono text-[26px] font-semibold tabular-nums leading-none">
              {d.savings == null ? "–" : format.number(d.savings, "price")}
            </p>
            <p className="text-muted-foreground text-xs">
              {d.savings == null ? t("savingsNone") : t("savingsHint")}
            </p>
          </Tile>
          <Tile title={t("kpi.merchants")}>
            <p className="font-mono text-[26px] font-semibold tabular-nums leading-none">
              {d.merchantCount}
            </p>
            <p className="text-muted-foreground text-xs">{t("merchantsHint")}</p>
          </Tile>
          <Tile title={t("kpi.lastRun")}>
            <p className="text-[22px] font-bold leading-none">{runStatus ?? "–"}</p>
            <p className="text-muted-foreground text-xs">
              {d.lastRun?.at ? format.relativeTime(d.lastRun.at) : t("noRuns")}
            </p>
          </Tile>
        </div>

        <Card>
          <CardContent>{d.chart && <BuildTotalChartLazy data={d.chart} />}</CardContent>
        </Card>

        <div className="grid items-start gap-6 lg:grid-cols-2">
          <Card>
            <CardContent>
              <MoversChartLazy data={d.movers} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("feed.title")}</CardTitle>
              <CardDescription>{t("feed.description")}</CardDescription>
            </CardHeader>
            <CardContent>
              {d.feed.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t("feed.empty")}</p>
              ) : (
                <ul className="divide-y">
                  {d.feed.map((c) => (
                    <li key={`${c.productId}-${c.ts}`} className="grid gap-0.5 py-2 text-sm">
                      <span className="break-words font-medium">{c.name}</span>
                      <span className="text-muted-foreground flex flex-wrap gap-x-2 tabular-nums">
                        <span>
                          {format.number(c.from, "price")} → {format.number(c.to, "price")}
                        </span>
                        <span className="text-foreground font-medium">
                          {c.delta < 0 ? "▼" : "▲"} {format.number(Math.abs(c.delta), "price")}
                        </span>
                        <span>
                          {c.merchantName} · {format.relativeTime(c.ts)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function Tile({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-card flex min-w-0 flex-col gap-2 p-4 sm:p-5">
      <p className="text-muted-foreground font-mono text-[11px] uppercase tracking-[0.08em]">
        {title}
      </p>
      {children}
    </div>
  );
}
