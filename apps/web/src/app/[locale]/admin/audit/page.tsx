import { auditLog, getDb, user } from "@parts/db";
import { desc, eq } from "@parts/db/orm";
import { ScrollText } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { EmptyState, PageHeader } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { initLocale } from "@/i18n/server";
import { requireAdmin } from "@/lib/auth/guard";
import { cn } from "@/lib/utils";

// Session-dependent and admin-only: render on request (see ../layout.tsx).
export const instant = false;

const PAGE_SIZE = 50;
const ENTITIES = [
  "user",
  "merchant",
  "product",
  "identifier",
  "candidate",
  "invite",
  "settings",
  "run",
] as const;
type Entity = (typeof ENTITIES)[number];

export default async function AuditPage({ searchParams }: PageProps<"/[locale]/admin/audit">) {
  await initLocale();
  await requireAdmin();
  const sp = await searchParams;
  const entity: Entity | undefined = ENTITIES.find((e) => e === sp.entity);
  const page = Math.max(1, Number.parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1);
  const t = await getTranslations("Admin.audit");
  const tc = await getTranslations("Admin.common");
  const format = await getFormatter();

  const db = getDb();
  const where = entity ? eq(auditLog.entity, entity) : undefined;
  // One extra row tells us whether a next page exists.
  const fetched = await db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      entity: auditLog.entity,
      entityId: auditLog.entityId,
      diff: auditLog.diff,
      createdAt: auditLog.createdAt,
      actorUserId: auditLog.actorUserId,
      actorName: user.name,
      actorEmail: user.email,
    })
    .from(auditLog)
    .leftJoin(user, eq(user.id, auditLog.actorUserId))
    .where(where)
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(PAGE_SIZE + 1)
    .offset((page - 1) * PAGE_SIZE);
  const rows = fetched.slice(0, PAGE_SIZE);
  const hasNext = fetched.length > PAGE_SIZE;

  const href = (p: number, e: Entity | undefined = entity) => ({
    pathname: "/admin/audit" as const,
    query: { ...(e ? { entity: e } : {}), ...(p > 1 ? { page: String(p) } : {}) },
  });

  return (
    <div>
      <PageHeader title={t("title")} description={t("description")} />

      <nav aria-label={t("filter")} className="mb-6 flex flex-wrap gap-2">
        {[undefined, ...ENTITIES].map((e) => (
          <Link
            key={e ?? "all"}
            href={href(1, e)}
            aria-current={e === entity ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              e === entity
                ? "bg-primary text-primary-foreground border-transparent"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {e ? t(`entities.${e}`) : tc("all")}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <EmptyState icon={ScrollText} title={t("empty")} />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground text-left">
              <tr>
                <th className="whitespace-nowrap px-3 py-2 font-medium">{t("time")}</th>
                <th className="hidden px-3 py-2 font-medium md:table-cell">{t("actor")}</th>
                <th className="px-3 py-2 font-medium">{t("action")}</th>
                <th className="hidden px-3 py-2 font-medium sm:table-cell">{t("target")}</th>
                <th className="px-3 py-2 font-medium">{t("diff")}</th>
              </tr>
            </thead>
            <tbody className="divide-y align-top">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap px-3 py-2">
                    {format.dateTime(r.createdAt, { dateStyle: "short", timeStyle: "medium" })}
                  </td>
                  <td className="hidden px-3 py-2 md:table-cell">
                    {r.actorUserId == null ? (
                      <span className="text-muted-foreground">{t("system")}</span>
                    ) : r.actorName == null ? (
                      <span className="text-muted-foreground">{t("deletedUser")}</span>
                    ) : (
                      <>
                        <div>{r.actorName}</div>
                        <div className="text-muted-foreground break-all text-xs">
                          {r.actorEmail}
                        </div>
                      </>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="secondary" className="font-mono">
                      {r.action}
                    </Badge>
                  </td>
                  <td className="hidden px-3 py-2 sm:table-cell">
                    <div>{r.entity}</div>
                    {r.entityId && (
                      <div className="text-muted-foreground break-all font-mono text-xs">
                        {r.entityId}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {r.diff ? (
                      <details>
                        <summary className="text-muted-foreground cursor-pointer select-none">
                          {t("show")}
                        </summary>
                        <pre className="bg-muted mt-2 max-w-[28rem] whitespace-pre-wrap break-all rounded-md p-2 text-xs">
                          {JSON.stringify(r.diff, null, 2)}
                        </pre>
                      </details>
                    ) : (
                      <span className="text-muted-foreground">–</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(page > 1 || hasNext) && (
        <div className="mt-6 flex items-center justify-between text-sm">
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
    </div>
  );
}
