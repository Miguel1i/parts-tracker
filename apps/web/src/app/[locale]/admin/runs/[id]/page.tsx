import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { getDb, merchants, products, scrapeLogs, scrapeRuns, user } from "@parts/db";
import { asc, eq } from "@parts/db/orm";
import { PageHeader } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { initLocale } from "@/i18n/server";
import { adminMetadata, requireAdmin } from "@/lib/auth/guard";
import { RerunButton } from "../run-controls";
import { durationMs, formatDuration, RunStatusBadge, safeGhUrl } from "../run-bits";
import { resolveScopeNames, scopeParts } from "../scope";
import { kicker } from "@/lib/kicker";

// Session-dependent and admin-only: render on request (see ../../layout.tsx).
export const instant = false;

const LOG_LIMIT = 500;

// Titles only for admins, so a 404 doesn't reveal what lives here.
export const generateMetadata = () => adminMetadata(metadata);

async function metadata(): Promise<Metadata> {
  const locale = (await initLocale()) ?? routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: "Admin.runs" });
  return { title: t("detailTitle") };
}

export default async function RunDetailPage({ params }: PageProps<"/[locale]/admin/runs/[id]">) {
  await initLocale();
  await requireAdmin();
  const { id } = await params;
  const t = await getTranslations("Admin.runs");
  const format = await getFormatter();
  const db = getDb();

  const [run] = await db
    .select({
      id: scrapeRuns.id,
      trigger: scrapeRuns.trigger,
      scope: scrapeRuns.scope,
      status: scrapeRuns.status,
      startedAt: scrapeRuns.startedAt,
      finishedAt: scrapeRuns.finishedAt,
      stats: scrapeRuns.stats,
      ghRunUrl: scrapeRuns.ghRunUrl,
      requesterName: user.name,
    })
    .from(scrapeRuns)
    .leftJoin(user, eq(user.id, scrapeRuns.requestedBy))
    .where(eq(scrapeRuns.id, id));
  if (!run) notFound();

  const [logs, names, logCount] = await Promise.all([
    db
      .select({
        id: scrapeLogs.id,
        status: scrapeLogs.status,
        message: scrapeLogs.message,
        log: scrapeLogs.log,
        productName: products.name,
        merchantName: merchants.name,
      })
      .from(scrapeLogs)
      .leftJoin(products, eq(products.id, scrapeLogs.productId))
      .leftJoin(merchants, eq(merchants.id, scrapeLogs.merchantId))
      .where(eq(scrapeLogs.runId, id))
      .orderBy(asc(scrapeLogs.id))
      .limit(LOG_LIMIT),
    resolveScopeNames([run.scope]),
    db.$count(scrapeLogs, eq(scrapeLogs.runId, id)),
  ]);
  const parts = scopeParts(run.scope, names);
  const gh = safeGhUrl(run.ghRunUrl);
  const dt = (d: Date | null) =>
    d ? format.dateTime(d, { dateStyle: "medium", timeStyle: "medium" }) : "–";
  const stats = Object.entries(run.stats ?? {});

  return (
    <div className="grid gap-8">
      <div>
        <Link href="/admin/runs" className="text-muted-foreground text-sm underline">
          {t("back")}
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <PageHeader kicker={await kicker("admin")} title={t("detailTitle")} />
          <RerunButton runId={run.id} />
        </div>

        <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          <Item label={t("columns.status")}>
            <RunStatusBadge status={run.status} />
          </Item>
          <Item label={t("columns.trigger")}>{t(`triggers.${run.trigger}`)}</Item>
          <Item label={t("columns.scope")}>
            {parts.length === 0
              ? t("scope.all")
              : parts
                  .map((p) => `${t(`scope.${p.kind}`)}: ${p.name}`.replace(/: $/, ""))
                  .join(" · ")}
          </Item>
          <Item label={t("columns.requestedBy")}>{run.requesterName ?? t("system")}</Item>
          <Item label={t("columns.started")}>{dt(run.startedAt)}</Item>
          <Item label={t("columns.finished")}>{dt(run.finishedAt)}</Item>
          <Item label={t("columns.duration")}>
            {formatDuration(durationMs(run.startedAt, run.finishedAt))}
          </Item>
          {gh && (
            <Item label={t("github")}>
              <a
                href={gh}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 underline"
              >
                <ExternalLink className="size-3.5" aria-hidden />
                {t("openGithub")}
              </a>
            </Item>
          )}
        </dl>

        {stats.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {stats.map(([k, v]) => (
              <Badge key={k} variant="secondary" className="font-mono">
                {k}: {v}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <section aria-labelledby="run-logs" className="grid gap-3">
        <h2 id="run-logs" className="text-base font-semibold">
          {t("logs")}
        </h2>
        {logCount > LOG_LIMIT && (
          <p className="text-muted-foreground text-sm">
            {t("logsTruncated", { shown: LOG_LIMIT, total: logCount })}
          </p>
        )}
        {logs.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("noLogs")}</p>
        ) : (
          <ul className="divide-y rounded-[6px] border">
            {logs.map((l) => (
              <li key={l.id} className="px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Badge variant="outline" className="font-mono">
                    {l.status}
                  </Badge>
                  <span className="min-w-0 break-words font-medium">
                    {l.productName ?? "–"}
                    <span className="text-muted-foreground font-normal">
                      {" "}
                      · {l.merchantName ?? "–"}
                    </span>
                  </span>
                </div>
                {l.message && <p className="text-muted-foreground mt-1 break-words">{l.message}</p>}
                {l.log && (
                  <details className="mt-1">
                    <summary className="text-muted-foreground cursor-pointer select-none text-xs">
                      {t("showLog")}
                    </summary>
                    <pre
                      tabIndex={0}
                      className="bg-muted focus-visible:outline-ring mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-[4px] p-2 text-xs focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      {l.log}
                    </pre>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}
