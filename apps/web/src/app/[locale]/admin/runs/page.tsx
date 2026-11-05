import type { Metadata } from "next";
import { Activity, ExternalLink } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { getDb, scrapeRuns, user } from "@parts/db";
import { desc, eq } from "@parts/db/orm";
import { EmptyState, PageHeader } from "@/components/empty-state";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { initLocale } from "@/i18n/server";
import { loadRunDurations } from "@/lib/admin/health-data";
import { getSettings } from "@/lib/admin/queries";
import { adminMetadata, requireAdmin } from "@/lib/auth/guard";
import { DurationChart } from "./duration-chart";
import { CheckAllButton, CronIntervalSelect } from "./run-controls";
import { durationMs, formatDuration, RunStatusBadge, safeGhUrl } from "./run-bits";
import { resolveScopeNames, scopeParts } from "./scope";

// Session-dependent and admin-only: render on request (see ../layout.tsx).
export const instant = false;

const PAGE_SIZE = 30;

// Titles only for admins, so a 404 doesn't reveal what lives here.
export const generateMetadata = () => adminMetadata(metadata);

async function metadata(): Promise<Metadata> {
  const locale = (await initLocale()) ?? routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: "Admin.nav" });
  return { title: t("runs") };
}

const STAT_KEYS = ["ok", "blocked", "not_found", "review", "error"] as const;

export default async function RunsPage({ searchParams }: PageProps<"/[locale]/admin/runs">) {
  await initLocale();
  await requireAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1);
  const t = await getTranslations("Admin.runs");
  const tc = await getTranslations("Admin.common");
  const format = await getFormatter();

  const db = getDb();
  const [fetched, settings, durations] = await Promise.all([
    db
      .select({
        id: scrapeRuns.id,
        trigger: scrapeRuns.trigger,
        scope: scrapeRuns.scope,
        status: scrapeRuns.status,
        startedAt: scrapeRuns.startedAt,
        finishedAt: scrapeRuns.finishedAt,
        createdAt: scrapeRuns.createdAt,
        stats: scrapeRuns.stats,
        ghRunUrl: scrapeRuns.ghRunUrl,
        requesterName: user.name,
      })
      .from(scrapeRuns)
      .leftJoin(user, eq(user.id, scrapeRuns.requestedBy))
      .orderBy(desc(scrapeRuns.createdAt), desc(scrapeRuns.id))
      .limit(PAGE_SIZE + 1)
      .offset((page - 1) * PAGE_SIZE),
    getSettings(),
    loadRunDurations(),
  ]);
  const rows = fetched.slice(0, PAGE_SIZE);
  const hasNext = fetched.length > PAGE_SIZE;
  const names = await resolveScopeNames(rows.map((r) => r.scope));
  const href = (p: number) => ({
    pathname: "/admin/runs" as const,
    query: p > 1 ? { page: String(p) } : {},
  });
  const dt = (d: Date | null) =>
    d ? format.dateTime(d, { dateStyle: "short", timeStyle: "short" }) : "–";

  return (
    <div className="grid gap-8">
      <div>
        <PageHeader title={t("title")} description={t("description")} />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <CronIntervalSelect hours={settings.cronIntervalHours} />
          <CheckAllButton />
        </div>
      </div>

      <DurationChart runs={durations} />

      <section aria-labelledby="runs-list" className="grid gap-3">
        <h2 id="runs-list" className="text-base font-semibold">
          {t("list")}
        </h2>
        {rows.length === 0 ? (
          <EmptyState icon={Activity} title={t("empty")} />
        ) : (
          <div className="overflow-x-auto rounded-[6px] border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground text-left">
                <tr>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">
                    {t("columns.started")}
                  </th>
                  <th className="px-3 py-2 font-medium">{t("columns.scope")}</th>
                  <th className="px-3 py-2 font-medium">{t("columns.status")}</th>
                  <th className="hidden px-3 py-2 font-medium md:table-cell">
                    {t("columns.requestedBy")}
                  </th>
                  <th className="hidden px-3 py-2 font-medium sm:table-cell">
                    {t("columns.duration")}
                  </th>
                  <th className="hidden px-3 py-2 font-medium lg:table-cell">
                    {t("columns.stats")}
                  </th>
                  <th className="px-3 py-2 font-medium">
                    <span className="sr-only">{t("columns.links")}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y align-top">
                {rows.map((r) => {
                  const parts = scopeParts(r.scope, names);
                  const gh = safeGhUrl(r.ghRunUrl);
                  return (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap px-3 py-2">
                        <Link
                          href={`/admin/runs/${r.id}`}
                          className="underline-offset-4 hover:underline"
                        >
                          {dt(r.startedAt ?? r.createdAt)}
                        </Link>
                        <div className="text-muted-foreground text-xs">
                          {t(`triggers.${r.trigger}`)}
                        </div>
                      </td>
                      <td className="max-w-[12rem] px-3 py-2 sm:max-w-xs">
                        {parts.length === 0 ? (
                          t("scope.all")
                        ) : (
                          <ul className="grid gap-0.5">
                            {parts.map((p) => (
                              <li key={p.kind} className="break-words">
                                <span className="text-muted-foreground">
                                  {t(`scope.${p.kind}`)}:{" "}
                                </span>
                                {p.name}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <RunStatusBadge status={r.status} />
                      </td>
                      <td className="hidden px-3 py-2 md:table-cell">
                        {r.requesterName ?? (
                          <span className="text-muted-foreground">{t("system")}</span>
                        )}
                      </td>
                      <td className="hidden whitespace-nowrap px-3 py-2 tabular-nums sm:table-cell">
                        {formatDuration(durationMs(r.startedAt, r.finishedAt))}
                      </td>
                      <td className="hidden px-3 py-2 lg:table-cell">
                        {r.stats ? (
                          <dl className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                            {STAT_KEYS.map((k) => (
                              <div key={k} className="flex gap-1">
                                <dt className="text-muted-foreground">{t(`stats.${k}`)}</dt>
                                <dd className="tabular-nums">{r.stats?.[k] ?? 0}</dd>
                              </div>
                            ))}
                          </dl>
                        ) : (
                          <span className="text-muted-foreground">–</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        {gh && (
                          <a
                            href={gh}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                          >
                            <ExternalLink className="size-3.5" aria-hidden />
                            <span className="sr-only sm:not-sr-only">{t("github")}</span>
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {(page > 1 || hasNext) && (
          <div className="flex items-center justify-between text-sm">
            {page > 1 ? (
              <Link href={href(page - 1)} className="underline">
                {tc("previous")}
              </Link>
            ) : (
              <span />
            )}
            <span className="text-muted-foreground">{tc("page", { page })}</span>
            {hasNext ? (
              <Link href={href(page + 1)} className="underline">
                {tc("next")}
              </Link>
            ) : (
              <span />
            )}
          </div>
        )}
      </section>
    </div>
  );
}
