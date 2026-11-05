import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { builds, getDb, invites, user } from "@parts/db";
import { and, asc, desc, eq, gt, inArray, isNull, or, sql, type SQL } from "@parts/db/orm";
import { PageHeader } from "@/components/empty-state";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { initLocale } from "@/i18n/server";
import { getSettings } from "@/lib/admin/queries";
import { adminMetadata, requireAdmin } from "@/lib/auth/guard";
import { cn } from "@/lib/utils";
import { InvitePanel } from "./invite-panel";
import { PendingPanel } from "./pending-panel";
import { SignupModeSelect } from "./signup-mode-select";
import { UsersTable, type UserRow } from "./users-table";
import { kicker } from "@/lib/kicker";

// Session-dependent and admin-only: render on request (see ../layout.tsx).
export const instant = false;

const PAGE_SIZE = 50;
const filters = ["all", "pending", "active", "admins", "banned"] as const;
type Filter = (typeof filters)[number];

// Titles only for admins, so a 404 doesn't reveal what lives here.
export const generateMetadata = () => adminMetadata(metadata);

async function metadata(): Promise<Metadata> {
  const locale = (await initLocale()) ?? routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: "Admin.nav" });
  return { title: t("users") };
}

export default async function UsersPage({ searchParams }: PageProps<"/[locale]/admin/users">) {
  await initLocale();
  const actor = await requireAdmin();
  const t = await getTranslations("Admin.users");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const filter: Filter = filters.includes(sp.status as Filter) ? (sp.status as Filter) : "all";
  const page = Math.max(1, Number(sp.page) || 1);

  const db = getDb();
  const where: SQL[] = [];
  if (q) {
    const pattern = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    where.push(
      or(
        sql`${user.name} like ${pattern} escape '\\'`,
        sql`${user.email} like ${pattern} escape '\\'`,
        sql`${user.username} like ${pattern} escape '\\'`,
      )!,
    );
  }
  if (filter === "pending") where.push(and(eq(user.status, "pending"), eq(user.banned, false))!);
  if (filter === "active") where.push(and(eq(user.status, "active"), eq(user.banned, false))!);
  if (filter === "admins") where.push(eq(user.role, "admin"));
  if (filter === "banned") where.push(eq(user.banned, true));

  const [rows, total, settings, openInvites, waiting] = await Promise.all([
    db
      .select()
      .from(user)
      .where(where.length ? and(...where) : undefined)
      // Pending first, so approvals are easy to find.
      .orderBy(sql`${user.status} = 'pending' desc`, desc(user.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.$count(user, where.length ? and(...where) : undefined),
    getSettings(),
    db
      .select()
      .from(invites)
      .where(and(isNull(invites.usedAt), gt(invites.expiresAt, new Date())))
      .orderBy(asc(invites.expiresAt)),
    db
      .select({
        id: user.id,
        name: user.name,
        username: user.displayUsername,
        email: user.email,
        createdAt: user.createdAt,
      })
      .from(user)
      .where(and(eq(user.status, "pending"), eq(user.banned, false)))
      .orderBy(asc(user.createdAt))
      .limit(100),
  ]);

  const ids = rows.map((r) => r.id);
  const userBuilds = ids.length
    ? await db
        .select({
          id: builds.id,
          userId: builds.userId,
          name: builds.name,
          isPublic: builds.isPublic,
          createdAt: builds.createdAt,
        })
        .from(builds)
        .where(inArray(builds.userId, ids))
        .orderBy(desc(builds.createdAt))
    : [];

  const data: UserRow[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    username: r.displayUsername ?? r.username,
    image: r.image?.startsWith("https://") ? r.image : null,
    role: r.role,
    status: r.status,
    banned: r.banned,
    banReason: r.banReason,
    banExpires: r.banExpires,
    createdAt: r.createdAt,
    isSelf: r.id === actor.id,
    builds: userBuilds.filter((b) => b.userId === r.id),
  }));
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        kicker={await kicker("admin")}
        title={t("title")}
        description={t("description")}
      />
      <PendingPanel users={waiting} />
      <div className="mb-8 grid gap-4 xl:grid-cols-2">
        <SignupModeSelect mode={settings.signupMode} />
        <InvitePanel
          invites={openInvites.map((i) => ({
            id: i.id,
            email: i.email,
            role: i.role,
            expiresAt: i.expiresAt,
          }))}
        />
      </div>

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <nav aria-label={t("filterLabel")} className="-mx-1 flex gap-1 overflow-x-auto px-1">
          {filters.map((f) => (
            <Link
              key={f}
              href={{
                pathname: "/admin/users",
                query: { ...(q && { q }), ...(f !== "all" && { status: f }) },
              }}
              aria-current={f === filter ? "page" : undefined}
              className={cn(
                "hover:bg-muted whitespace-nowrap rounded-[4px] px-3 py-1.5 text-sm",
                f === filter ? "bg-muted font-medium" : "text-muted-foreground",
              )}
            >
              {t(`filters.${f}`)}
            </Link>
          ))}
        </nav>
        <form role="search" className="flex gap-2" action="">
          {filter !== "all" && <input type="hidden" name="status" value={filter} />}
          <label htmlFor="user-search" className="sr-only">
            {t("search")}
          </label>
          <Input
            id="user-search"
            name="q"
            type="search"
            defaultValue={q}
            placeholder={t("searchPlaceholder")}
            className="sm:w-64"
          />
        </form>
      </div>

      <UsersTable users={data} />

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{t("pageOf", { page, pages })}</span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                className="hover:bg-muted rounded-[4px] border px-3 py-1.5"
                href={{ pathname: "/admin/users", query: { ...sp, page: String(page - 1) } }}
              >
                {t("previous")}
              </Link>
            )}
            {page < pages && (
              <Link
                className="hover:bg-muted rounded-[4px] border px-3 py-1.5"
                href={{ pathname: "/admin/users", query: { ...sp, page: String(page + 1) } }}
              >
                {t("next")}
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}
