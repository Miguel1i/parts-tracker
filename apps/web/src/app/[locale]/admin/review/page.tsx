import { getDb, matchCandidates, merchants, productIdentifiers, products, user } from "@parts/db";
import { and, desc, eq, inArray } from "@parts/db/orm";
import { Inbox } from "lucide-react";
import { Fragment } from "react";
import { getFormatter, getTranslations } from "next-intl/server";
import { EmptyState, PageHeader } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { initLocale } from "@/i18n/server";
import { isHttpUrl, isReport } from "@/lib/admin/review";
import { requireAdmin } from "@/lib/auth/guard";
import { cn } from "@/lib/utils";
import { DecisionButtons } from "./decision-buttons";

// Session-dependent and admin-only: render on request (see ../layout.tsx).
export const instant = false;

const PAGE_SIZE = 25;
const STATUSES = ["pending", "approved", "rejected"] as const;
type Status = (typeof STATUSES)[number];

const verdictClass: Record<string, string> = {
  veto: "text-destructive",
  penalty: "text-destructive",
  boost: "text-primary",
  pass: "text-muted-foreground",
};

function Ids({ items }: { items: { kind: string; value: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-1">
      {items.map((i) => (
        <li key={`${i.kind}:${i.value}`}>
          <Badge variant="outline" className="font-mono">
            {i.kind.toUpperCase()} {i.value}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

export default async function ReviewPage({ searchParams }: PageProps<"/[locale]/admin/review">) {
  await initLocale();
  await requireAdmin();
  const sp = await searchParams;
  const status: Status = STATUSES.find((s) => s === sp.status) ?? "pending";
  const page = Math.max(1, Number.parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1);
  const t = await getTranslations("Admin.review");
  const tc = await getTranslations("Admin.common");
  const format = await getFormatter();

  const db = getDb();
  const total = await db.$count(matchCandidates, eq(matchCandidates.status, status));
  const rows = await db
    .select({
      c: matchCandidates,
      product: products,
      merchantName: merchants.name,
    })
    .from(matchCandidates)
    .innerJoin(products, eq(products.id, matchCandidates.productId))
    .innerJoin(merchants, eq(merchants.id, matchCandidates.merchantId))
    .where(eq(matchCandidates.status, status))
    .orderBy(desc(matchCandidates.createdAt), desc(matchCandidates.id))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  const productIds = [...new Set(rows.map((r) => r.product.id))];
  const idRows = productIds.length
    ? await db
        .select({
          productId: productIdentifiers.productId,
          kind: productIdentifiers.kind,
          value: productIdentifiers.value,
        })
        .from(productIdentifiers)
        .where(
          and(
            inArray(productIdentifiers.productId, productIds),
            eq(productIdentifiers.confirmed, true),
          ),
        )
    : [];
  const confirmedBy = new Map<string, { kind: string; value: string }[]>();
  for (const r of idRows) {
    const list = confirmedBy.get(r.productId) ?? [];
    list.push(r);
    confirmedBy.set(r.productId, list);
  }

  const reporterIds = [
    ...new Set(rows.map((r) => r.c.signals?.report?.userId).filter((v): v is string => !!v)),
  ];
  const reporterRows = reporterIds.length
    ? await db
        .select({ id: user.id, name: user.name })
        .from(user)
        .where(inArray(user.id, reporterIds))
    : [];
  const reporterName = new Map(reporterRows.map((u) => [u.id, u.name]));
  const reportRows = rows.filter((r) => isReport(r.c.signals));
  const sorted = [...reportRows, ...rows.filter((r) => !isReport(r.c.signals))];
  const reportCount = reportRows.length;

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (p: number, s: Status = status) => ({
    pathname: "/admin/review" as const,
    query: { ...(s === "pending" ? {} : { status: s }), ...(p > 1 ? { page: String(p) } : {}) },
  });

  return (
    <div>
      <PageHeader title={t("title")} description={t("description")} />

      <nav aria-label={t("filter")} className="mb-6 flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={href(1, s)}
            aria-current={s === status ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              s === status
                ? "bg-primary text-primary-foreground border-transparent"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {t(`status.${s}`)}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <EmptyState icon={Inbox} title={t("empty")}>
          {t("emptyHint")}
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-4">
          {sorted.map(({ c, product, merchantName }, idx) => {
            const s = c.signals ?? {};
            const report = isReport(c.signals);
            const heading =
              reportCount > 0 && idx === 0
                ? t("reports.heading")
                : reportCount > 0 && idx === reportCount
                  ? t("candidates")
                  : null;
            const pageIds = [
              ...(s.page?.gtins ?? []).map((v) => ({ kind: "gtin", value: v })),
              ...(s.page?.mpn ? [{ kind: "mpn", value: s.page.mpn }] : []),
              ...(s.page?.asin ? [{ kind: "asin", value: s.page.asin }] : []),
              ...(s.page?.sku ? [{ kind: "sku", value: s.page.sku }] : []),
            ];
            const refIds = confirmedBy.get(product.id) ?? [];
            return (
              <Fragment key={c.id}>
                {heading && (
                  <li
                    role="presentation"
                    className="text-muted-foreground mt-2 text-sm font-medium first:mt-0"
                  >
                    {heading}
                  </li>
                )}
                <li className="bg-card rounded-xl border p-4">
                  {report && (
                    <div className="bg-muted mb-4 flex flex-wrap items-center gap-2 rounded-md px-3 py-2 text-sm">
                      <Badge variant="destructive">
                        {t("reports.by", {
                          name:
                            reporterName.get(s.report?.userId ?? "") ?? t("reports.unknownUser"),
                        })}
                      </Badge>
                      <span className="break-words">
                        {s.report?.reason || t("reports.noReason")}
                      </span>
                      {s.report?.at != null && (
                        <span className="text-muted-foreground">
                          {format.dateTime(new Date(s.report.at), {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="grid gap-4 md:grid-cols-2 md:gap-6">
                    <section className="min-w-0">
                      <h2 className="text-muted-foreground mb-2 text-xs font-medium uppercase">
                        {t("reference")}
                      </h2>
                      <div className="flex gap-3">
                        {isHttpUrl(product.imageUrl) && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={product.imageUrl}
                            alt=""
                            referrerPolicy="no-referrer"
                            className="bg-muted size-16 shrink-0 rounded-md object-contain"
                          />
                        )}
                        <div className="min-w-0">
                          <Link
                            href={`/admin/catalog/${product.id}`}
                            className="break-words font-medium hover:underline"
                          >
                            {product.name}
                          </Link>
                          <p className="text-muted-foreground text-sm">
                            {[
                              product.brand,
                              product.category,
                              product.refPrice != null
                                ? format.number(product.refPrice, "price")
                                : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3">
                        <p className="text-muted-foreground mb-1 text-xs">{t("confirmedIds")}</p>
                        {refIds.length ? (
                          <Ids items={refIds} />
                        ) : (
                          <p className="text-muted-foreground text-sm">–</p>
                        )}
                      </div>
                    </section>

                    <section className="min-w-0 md:border-l md:pl-6">
                      <h2 className="text-muted-foreground mb-2 text-xs font-medium uppercase">
                        {report ? t("reports.reportedOffer") : t("candidate")}
                      </h2>
                      <p className="break-words font-medium">
                        {c.title ?? "–"}{" "}
                        <span className="text-muted-foreground font-normal">· {merchantName}</span>
                      </p>
                      <p className="break-all text-sm">
                        {isHttpUrl(c.url) ? (
                          <a
                            href={c.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary underline"
                          >
                            {c.url}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">{c.url}</span>
                        )}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                        <Badge variant="secondary">
                          {t("score")} {format.number(c.score, { maximumFractionDigits: 1 })}
                        </Badge>
                        {s.stage && <Badge variant="outline">{s.stage}</Badge>}
                        {c.priceEur != null && (
                          <span className="tabular-nums">{format.number(c.priceEur, "price")}</span>
                        )}
                        <span className="text-muted-foreground">
                          {format.dateTime(c.createdAt, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </span>
                      </div>
                      {s.vetoes && s.vetoes.length > 0 && (
                        <div className="mt-2 flex flex-wrap items-center gap-1">
                          <span className="text-destructive text-xs font-medium">
                            {t("vetoes")}
                          </span>
                          {s.vetoes.map((v) => (
                            <Badge key={v} variant="destructive">
                              {v}
                            </Badge>
                          ))}
                        </div>
                      )}
                      <div className="mt-3">
                        <p className="text-muted-foreground mb-1 text-xs">{t("pageIds")}</p>
                        {pageIds.length ? (
                          <Ids items={pageIds} />
                        ) : (
                          <p className="text-muted-foreground text-sm">{t("noPageIds")}</p>
                        )}
                      </div>
                      {s.results && s.results.length > 0 && (
                        <details className="mt-3 text-sm">
                          <summary className="text-muted-foreground cursor-pointer select-none">
                            {t("rules", { count: s.results.length })}
                          </summary>
                          <ul className="mt-2 flex flex-col gap-1">
                            {s.results.map((r, i) => (
                              <li key={`${r.rule}-${i}`} className="bg-muted rounded-md px-2 py-1">
                                <span className="font-medium">{r.rule}</span>{" "}
                                <span className={cn("text-xs uppercase", verdictClass[r.verdict])}>
                                  {r.verdict}
                                </span>{" "}
                                <span
                                  className={cn(
                                    "tabular-nums",
                                    r.weight > 0 && "text-primary",
                                    r.weight < 0 && "text-destructive",
                                  )}
                                >
                                  {r.weight > 0 ? "+" : ""}
                                  {r.weight}
                                </span>
                                <p className="text-muted-foreground break-words text-xs">
                                  {r.evidence}
                                </p>
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </section>
                  </div>
                  {c.status === "pending" && (
                    <div className="mt-4 flex justify-end border-t pt-4">
                      <DecisionButtons id={c.id} report={report} />
                    </div>
                  )}
                </li>
              </Fragment>
            );
          })}
        </ul>
      )}

      {pages > 1 && (
        <div className="mt-6 flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link href={href(page - 1)} className="underline">
              {tc("previous")}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground">
            {tc("page", { page })} / {pages}
          </span>
          {page < pages ? (
            <Link href={href(page + 1)} className="underline">
              {tc("next")}
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </div>
  );
}
